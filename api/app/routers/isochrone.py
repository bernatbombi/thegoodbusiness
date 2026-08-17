import json

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.config import (
    CACHE_TTL_SECONDS,
    CATALONIA_BOUNDS,
    CONTOUR_COLORS,
    CONTOUR_MINUTES,
    MODE_TO_COSTING,
    VALHALLA_URL,
)
from app.redis_client import redis_client

router = APIRouter()


class IsochroneRequest(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    mode: str = Field(..., pattern="^(pedestrian|auto)$")


def in_catalonia(lat: float, lon: float) -> bool:
    b = CATALONIA_BOUNDS
    return b["min_lat"] <= lat <= b["max_lat"] and b["min_lon"] <= lon <= b["max_lon"]


def cache_key(lat: float, lon: float, mode: str) -> str:
    return f"iso:{mode}:{round(lat, 4)}:{round(lon, 4)}"


@router.post("/isochrone")
async def isochrone(req: IsochroneRequest):
    if not in_catalonia(req.lat, req.lon):
        raise HTTPException(status_code=400, detail="Coordinate outside Catalonia bounding box")

    key = cache_key(req.lat, req.lon, req.mode)
    cached = await redis_client.get(key)
    if cached:
        return json.loads(cached)

    costing = MODE_TO_COSTING[req.mode]
    payload = {
        "locations": [{"lat": req.lat, "lon": req.lon}],
        "costing": costing,
        "contours": [{"time": t, "color": CONTOUR_COLORS[t]} for t in CONTOUR_MINUTES],
        "polygons": True,
    }

    async with httpx.AsyncClient(timeout=10) as client:
        try:
            resp = await client.post(f"{VALHALLA_URL}/isochrone", json=payload)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=502, detail=f"valhalla error: {exc}")

    geojson = resp.json()
    await redis_client.set(key, json.dumps(geojson), ex=CACHE_TTL_SECONDS)
    return geojson
