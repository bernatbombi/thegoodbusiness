FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
RUN python -c "import duckdb; c = duckdb.connect(); c.execute('INSTALL spatial'); c.execute('INSTALL httpfs')"

# Bakes a Catalonia-only Overture Places extract into the image at build
# time, so it deploys anywhere (no repo commit, no host volume needed).
# Cached by Docker as long as scripts/ doesn't change, so ordinary app-code
# deploys don't re-run the S3 extraction.
ENV OVERTURE_DB_PATH=/data/overture/places_catalonia.duckdb
COPY scripts ./scripts
RUN python scripts/build_overture_db.py

COPY app ./app

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
