import httpx
from fastapi import APIRouter, HTTPException

from app.config import VALHALLA_URL

router = APIRouter()


@router.get("/health")
async def health():
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.get(f"{VALHALLA_URL}/status")
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise HTTPException(status_code=503, detail=f"valhalla unavailable: {exc}")
    return {"status": "ok"}
