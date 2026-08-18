from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import health, isochrone, places

app = FastAPI(title="Catalonia Isochrone API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(isochrone.router)
app.include_router(places.router)
