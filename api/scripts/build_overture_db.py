"""
Extracts a Catalonia-only subset of Overture Maps "places" into a local
DuckDB file, baked into the image at build time (run via `docker build`,
not at container runtime) — so the file never needs to be committed to the
repo or provided via a host volume, which makes it deploy anywhere
(Railway, etc.) without extra infra.

Bump RELEASE to pull a newer Overture release (ships monthly). Pinned
deliberately (never "latest") since Overture's schema has changed across
releases — re-verify column names below when bumping.
"""

import json
import os
from datetime import datetime, timezone

import duckdb

RELEASE = "2026-07-22.0"
BASE_URL = f"s3://overturemaps-us-west-2/release/{RELEASE}/theme=places/type=place/*"

# Keep in sync with CATALONIA_BOUNDS in api/app/config.py
MIN_LAT, MAX_LAT = 40.5, 42.9
MIN_LON, MAX_LON = 0.15, 3.4

OUT_DB = os.environ.get("OVERTURE_DB_PATH", "/data/overture/places_catalonia.duckdb")


def main():
    os.makedirs(os.path.dirname(OUT_DB), exist_ok=True)
    if os.path.exists(OUT_DB):
        os.remove(OUT_DB)

    con = duckdb.connect(OUT_DB)
    con.execute("INSTALL httpfs; LOAD httpfs;")
    con.execute("INSTALL spatial; LOAD spatial;")
    con.execute("SET s3_region='us-west-2';")

    print(f"Extracting Overture places (release {RELEASE}) for Catalonia bbox -> {OUT_DB}")
    con.execute(
        f"""
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
        FROM read_parquet('{BASE_URL}', filename=false, hive_partitioning=1)
        WHERE bbox.xmin <= {MAX_LON} AND bbox.xmax >= {MIN_LON}
          AND bbox.ymin <= {MAX_LAT} AND bbox.ymax >= {MIN_LAT}
        """
    )
    # Deliberately no RTREE index — duckdb-spatial 1.1.1 has an internal
    # assertion bug when an RTREE-indexed ST_Within is combined with another
    # filter (e.g. confidence) in the same WHERE clause. Dataset is small
    # enough (hundreds of thousands of rows) that a full scan is instant.

    row_count = con.execute("SELECT count(*) FROM places").fetchone()[0]
    con.close()

    metadata_path = os.path.join(os.path.dirname(OUT_DB), "METADATA.json")
    with open(metadata_path, "w") as f:
        json.dump(
            {
                "release": RELEASE,
                "extracted_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                "row_count": row_count,
                "bbox": {"min_lat": MIN_LAT, "max_lat": MAX_LAT, "min_lon": MIN_LON, "max_lon": MAX_LON},
            },
            f,
        )

    print(f"Done. {row_count} places extracted.")


if __name__ == "__main__":
    main()
