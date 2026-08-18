#!/usr/bin/env bash
set -euo pipefail

# Extracts a Catalonia-only subset of the Overture Maps "places" theme into a
# local DuckDB database (./overture/data/places_catalonia.duckdb).
#
# Run once before first use, and re-run whenever refreshing to a newer
# Overture release (Overture ships monthly). Requires DuckDB on the host
# (https://duckdb.org/docs/installation) — this script does not run in a
# container, same as valhalla/download_extract.sh's curl download.
#
# Bump RELEASE below to pull a newer Overture release. Pinned deliberately
# (never "latest") since Overture's schema has changed across releases.

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$DIR/data"
mkdir -p "$DATA_DIR"

RELEASE="2026-07-22.0"
BASE_URL="s3://overturemaps-us-west-2/release/${RELEASE}/theme=places/type=place/*"

# Keep in sync with CATALONIA_BOUNDS in api/app/config.py
MIN_LAT=40.5
MAX_LAT=42.9
MIN_LON=0.15
MAX_LON=3.4

OUT_DB="$DATA_DIR/places_catalonia.duckdb"
METADATA="$DATA_DIR/METADATA.json"

echo "Extracting Overture places (release $RELEASE) for Catalonia bbox -> $OUT_DB"
rm -f "$OUT_DB"

duckdb "$OUT_DB" <<SQL
INSTALL httpfs;
LOAD httpfs;
INSTALL spatial;
LOAD spatial;
SET s3_region='us-west-2';

CREATE TABLE places AS
SELECT
    id,
    geometry,
    names.primary AS name,
    categories.primary AS categories_primary,
    categories.alternate AS categories_alternate,
    basic_category,
    confidence,
    brand.names.primary AS brand_name,
    addresses,
    websites
FROM read_parquet('${BASE_URL}', filename=false, hive_partitioning=1)
WHERE bbox.xmin <= ${MAX_LON} AND bbox.xmax >= ${MIN_LON}
  AND bbox.ymin <= ${MAX_LAT} AND bbox.ymax >= ${MIN_LAT};
SQL
# Note: deliberately no RTREE index — duckdb-spatial 1.1.1 has an internal
# assertion bug when an RTREE-indexed ST_Within is combined with another
# filter (e.g. confidence) in the same WHERE clause, which crashes the
# connection. Regional dataset is small enough (hundreds of thousands of
# rows) that a full scan per query is effectively instant without it.

ROW_COUNT="$(duckdb "$OUT_DB" -csv -noheader -c "SELECT count(*) FROM places;")"

cat > "$METADATA" <<JSON
{
  "release": "${RELEASE}",
  "extracted_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "row_count": ${ROW_COUNT},
  "bbox": {"min_lat": ${MIN_LAT}, "max_lat": ${MAX_LAT}, "min_lon": ${MIN_LON}, "max_lon": ${MAX_LON}}
}
JSON

echo "Done. $ROW_COUNT places extracted."
