import duckdb

from app.config import OVERTURE_DB_PATH

_connection: duckdb.DuckDBPyConnection | None = None


def get_places_db() -> duckdb.DuckDBPyConnection:
    global _connection
    if _connection is None:
        _connection = duckdb.connect(OVERTURE_DB_PATH, read_only=True)
        _connection.execute("LOAD spatial;")
    return _connection
