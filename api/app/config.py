import os

from dotenv import load_dotenv

load_dotenv()

VALHALLA_URL = os.environ.get("VALHALLA_URL", "http://localhost:8002")
REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")
CACHE_TTL_SECONDS = 60 * 60

# Rough Catalonia bounding box
CATALONIA_BOUNDS = {"min_lat": 40.5, "max_lat": 42.9, "min_lon": 0.15, "max_lon": 3.4}

CONTOUR_MINUTES = [5, 10, 15]
CONTOUR_COLORS = {5: "2ecc71", 10: "f1c40f", 15: "e74c3c"}  # green / yellow / red

MODE_TO_COSTING = {
    "pedestrian": "pedestrian",
    "auto": "auto",
}
