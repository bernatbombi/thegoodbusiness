#!/usr/bin/env bash
set -euo pipefail

# Downloads the Catalonia OSM extract (Geofabrik) into ./valhalla/data
# Run once before first `docker compose up` (or whenever refreshing OSM data).

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$DIR/data"
mkdir -p "$DATA_DIR"

URL="https://download.geofabrik.de/europe/spain/cataluna-latest.osm.pbf"
OUT="$DATA_DIR/cataluna-latest.osm.pbf"

echo "Downloading $URL -> $OUT"
curl -fL --progress-bar -o "$OUT" "$URL"
echo "Done. Tiles will be built automatically on first valhalla container start."
