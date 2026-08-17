#!/usr/bin/env bash
set -euo pipefail

DATA_DIR=/data
CONF="$DATA_DIR/valhalla.json"
TILE_DIR="$DATA_DIR/valhalla_tiles"
STATUS_FILE="$DATA_DIR/status"
PBF="$DATA_DIR/region.osm.pbf"
PBF_URL="${PBF_URL:-https://download.geofabrik.de/europe/spain/cataluna-latest.osm.pbf}"

mkdir -p "$DATA_DIR"
echo "building" > "$STATUS_FILE"

# Local dev may bind-mount a pre-downloaded pbf into /custom_files. If not
# present (e.g. Railway, no host mount available), download it ourselves.
CUSTOM_PBF=$(find /custom_files -maxdepth 1 -name '*.pbf' 2>/dev/null | head -n1 || true)
if [ -n "$CUSTOM_PBF" ]; then
  PBF="$CUSTOM_PBF"
elif [ ! -f "$PBF" ]; then
  echo "No pbf found, downloading from $PBF_URL..."
  curl -fL --progress-bar -o "$PBF" "$PBF_URL"
fi

# Healthchecks (Docker/Railway) hit :8002/status. valhalla_service doesn't bind
# that port until tiles are built, which can take several minutes — without a
# stand-in, the healthcheck fails and the deploy gets killed mid-build. This
# stub always returns 200 and reports real progress via STATUS_FILE; it's
# killed once valhalla_service is ready to take over the port for real.
python3 - "$STATUS_FILE" <<'PY' &
import http.server, sys, json

status_file = sys.argv[1]

class Handler(http.server.BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            status = open(status_file).read().strip()
        except FileNotFoundError:
            status = "unknown"
        body = json.dumps({"status": status}).encode()
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args):
        pass

http.server.HTTPServer(("0.0.0.0", 8002), Handler).serve_forever()
PY
STUB_PID=$!

cleanup_stub() {
  kill "$STUB_PID" 2>/dev/null || true
  wait "$STUB_PID" 2>/dev/null || true
}
trap cleanup_stub EXIT

if [ ! -f "$CONF" ]; then
  echo "Building Valhalla config..."
  valhalla_build_config --mjolnir-tile-dir "$TILE_DIR" \
    --mjolnir-tile-extract /data/tiles.tar \
    --mjolnir-timezone /data/timezones.sqlite \
    --mjolnir-admin /data/admins.sqlite \
    > "$CONF"
fi

if [ ! -f /data/tiles.tar ]; then
  echo "building_tiles" > "$STATUS_FILE"
  echo "Building Valhalla tiles from $PBF (this can take a few minutes)..."
  valhalla_build_tiles -c "$CONF" "$PBF"
  find "$TILE_DIR" -type f | sort -n | tar --no-recursion -cf /data/tiles.tar -T -
else
  echo "Tiles already built, skipping."
fi

echo "ready" > "$STATUS_FILE"
cleanup_stub
trap - EXIT

echo "Starting valhalla_service..."
exec valhalla_service "$CONF" 1
