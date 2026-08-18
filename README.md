# TheGoodBusiness — Catalonia Isochrone Map

Pedestrian/driving isochrone map for Catalonia. Stack: Valhalla (routing) + Redis (cache) + FastAPI (`api/`) + React/Vite (`web/`) + DuckDB/Overture Places (POI lookup).

## Prerequisites

- Docker + Docker Compose
- ~2GB free disk (OSM extract + built tiles)
- (Only for running outside Docker) Python 3.12+, Node 20+

## 1. Download OSM data

Valhalla needs a Catalonia OSM extract before it can build tiles. Run once (and again whenever refreshing the map data):

```bash
./valhalla/download_extract.sh
```

Downloads `cataluna-latest.osm.pbf` (Geofabrik) into `valhalla/data/`.

## 2. Download Overture Places data (optional, for local dev)

The `/places/within` endpoint (what types of places exist inside an isochrone) reads a local Catalonia-only extract of [Overture Maps](https://overturemaps.org/) Places. Requires the [DuckDB CLI](https://duckdb.org/docs/installation) on the host:

```bash
brew install duckdb   # or see the DuckDB install docs
./overture/download_extract.sh
```

Downloads/filters into `overture/data/places_catalonia.duckdb` (~30MB, gitignored). Re-run to refresh — Overture ships monthly releases; the script pins an explicit release date, bump `RELEASE` in the script to update.

This step is **not required for Docker deploys**: `api/Dockerfile` bakes the same extraction into the image at build time (`api/scripts/build_overture_db.py`), so `docker compose up` / any container deploy (Railway, etc.) works without it. Running the script locally just lets you refresh the data without rebuilding the image.

## 3. Env files

Copy the example env files and adjust if needed:

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env
```

Defaults work for local Docker Compose setup as-is.

## 4. Run (Docker Compose)

```bash
docker compose up -d
```

First boot builds Valhalla tiles from the `.pbf` — can take several minutes (healthcheck `start_period` is 10m). Subsequent boots reuse the built tiles.

Services:

| Service | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:8000 |
| Valhalla | http://localhost:8002 |

Logs / status:

```bash
docker compose ps
docker compose logs -f valhalla   # watch tile build progress
```

Stop:

```bash
docker compose down
```

## Running without Docker (optional)

**API**

```bash
cd api
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn app.main:app --reload
```

Requires Valhalla + Redis reachable at the URLs set in `api/.env` (point at the Dockerized ones, or run those two via `docker compose up valhalla redis`).

**Web**

```bash
cd web
npm ci
npm run dev
```

## API endpoints

Full request/response docs: [Bruno collection](documentation/bruno) (`documentation/README.md` for usage).

| Endpoint | Purpose |
|---|---|
| `GET /health` | Valhalla reachability check |
| `POST /isochrone` | 5/10/15 min walk/drive polygons around a point (Valhalla, Redis-cached) |
| `POST /places/within` | Overture Places counts/types inside an isochrone contour (or an arbitrary polygon) |

## Project layout

```
api/            FastAPI service (isochrone + places requests, Redis cache, Valhalla client, Overture DuckDB)
web/            React + Vite frontend (map UI)
valhalla/       Valhalla routing engine: OSM data + entrypoint/build scripts
overture/       Overture Places extraction script + local DuckDB data (gitignored)
documentation/  Bruno API collection
```
