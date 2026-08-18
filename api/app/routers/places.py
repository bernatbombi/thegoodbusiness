import json
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, model_validator

from app.config import CONTOUR_MINUTES, OVERTURE_MIN_CONFIDENCE
from app.places_db import get_places_db
from app.redis_client import redis_client
from app.routers.isochrone import cache_key, in_catalonia

router = APIRouter()


class PlacesWithinRequest(BaseModel):
    geometry: dict[str, Any] | None = None
    lat: float | None = Field(None, ge=-90, le=90)
    lon: float | None = Field(None, ge=-180, le=180)
    mode: str | None = Field(None, pattern="^(pedestrian|auto)$")
    minutes: int | None = None

    @model_validator(mode="after")
    def check_inputs(self):
        if self.geometry is None and not (self.lat and self.lon and self.mode and self.minutes):
            raise ValueError("provide either 'geometry' or 'lat'/'lon'/'mode'/'minutes'")
        if self.minutes is not None and self.minutes not in CONTOUR_MINUTES:
            raise ValueError(f"minutes must be one of {CONTOUR_MINUTES}")
        return self


def _flatten_positions(node: Any) -> list[list[float]]:
    if not node:
        return []
    if isinstance(node[0], (int, float)):
        return [node]
    positions = []
    for child in node:
        positions.extend(_flatten_positions(child))
    return positions


def _polygon_bbox(geometry: dict[str, Any]) -> tuple[float, float, float, float]:
    positions = _flatten_positions(geometry["coordinates"])
    lons = [p[0] for p in positions]
    lats = [p[1] for p in positions]
    return min(lats), max(lats), min(lons), max(lons)


async def _resolve_geometry(req: PlacesWithinRequest) -> dict[str, Any]:
    if req.geometry is not None:
        return req.geometry

    if not in_catalonia(req.lat, req.lon):
        raise HTTPException(status_code=400, detail="Coordinate outside Catalonia bounding box")

    key = cache_key(req.lat, req.lon, req.mode)
    cached = await redis_client.get(key)
    if not cached:
        raise HTTPException(
            status_code=404,
            detail="No cached isochrone for this location/mode. Call /isochrone first.",
        )

    geojson = json.loads(cached)
    for feature in geojson["features"]:
        if feature["properties"].get("contour") == req.minutes:
            return feature["geometry"]

    raise HTTPException(status_code=404, detail=f"No contour found for {req.minutes} minutes")


@router.post("/places/within")
async def places_within(req: PlacesWithinRequest):
    geometry = await _resolve_geometry(req)

    min_lat, max_lat, min_lon, max_lon = _polygon_bbox(geometry)
    if not (in_catalonia(min_lat, min_lon) and in_catalonia(max_lat, max_lon)):
        raise HTTPException(status_code=400, detail="Polygon outside Catalonia bounding box")

    db = get_places_db()
    rows = db.execute(
        """
        SELECT
            COALESCE(basic_category, categories_primary, categories_alternate[1]) AS type,
            COALESCE(categories_primary, categories_alternate[1]) AS category,
            count(*) AS n
        FROM places
        WHERE confidence >= ?
          AND ST_Within(geometry, ST_GeomFromGeoJSON(?))
        GROUP BY 1, 2
        ORDER BY n DESC
        """,
        [OVERTURE_MIN_CONFIDENCE, json.dumps(geometry)],
    ).fetchall()

    categories = [{"category": category, "type": type_, "count": n} for type_, category, n in rows]
    types: dict[str, int] = {}
    for c in categories:
        key = c["type"] or "unknown"
        types[key] = types.get(key, 0) + c["count"]

    return {
        "total": sum(types.values()),
        "types": [{"type": t, "count": n} for t, n in sorted(types.items(), key=lambda kv: -kv[1])],
        "categories": categories,
    }
