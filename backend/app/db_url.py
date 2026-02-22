"""Database URL normalization for Fly.io compatibility."""
import re
import ssl


def normalize_database_url(url: str) -> tuple[str, dict]:
    """
    Convert DATABASE_URL to asyncpg-compatible format.
    Returns (url, connect_args) tuple.
    """
    connect_args = {}
    
    # Convert postgres:// to postgresql+asyncpg://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql+asyncpg://", 1)
    elif url.startswith("postgresql://") and "+asyncpg" not in url:
        url = url.replace("postgresql://", "postgresql+asyncpg://", 1)
    
    # Check if SSL should be disabled
    if "sslmode=disable" in url or ".flycast" in url or ".internal" in url:
        connect_args["ssl"] = False
    
    # Remove sslmode param (asyncpg doesn't support it)
    if "sslmode=" in url:
        url = re.sub(r'[?&]sslmode=[^&]*', '', url)
        # Clean up trailing ? if no params left
        if url.endswith("?"):
            url = url[:-1]
    
    return url, connect_args
