# API documentation

Bruno collection for the FastAPI backend (`api/`), in `bruno/`.

## Usage

1. Open [Bruno](https://www.usebruno.com/), "Open Collection" → `documentation/bruno`.
2. Select the `Local` environment (`baseUrl: http://localhost:8000`).
3. Start the stack (`docker compose up`) or run the API locally.

## Structure

- `Health/` — service health check
- `Isochrone/` — walk/drive-time polygon generation (Valhalla-backed)
- `Places/` — Overture Places lookup within an isochrone polygon

Each request's `docs` tab has params, response shape, and error codes.
