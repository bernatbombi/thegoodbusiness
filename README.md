# TheGoodBusiness — Catalonia Isochrone Map

Pedestrian/driving isochrone map for Catalonia. Stack: Valhalla (routing) + Redis (cache) + FastAPI (`api/`) + React/Vite (`web/`).

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

## 2. Env files

Copy the example env files and adjust if needed:

```bash
cp api/.env.example api/.env
cp web/.env.example web/.env
```

Defaults work for local Docker Compose setup as-is.

## 3. Run (Docker Compose)

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

## Project layout

```
api/        FastAPI service (isochrone requests, Redis cache, Valhalla client)
web/        React + Vite frontend (map UI)
valhalla/   Valhalla routing engine: OSM data + entrypoint/build scripts
```
