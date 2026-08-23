"""Database engine and session management for RetentionAI.

Defaults to SQLite (data/retentionai.db) with automatic fallback/creation.
Supports PostgreSQL when DATABASE_URL is provided in environment variables.
"""

from __future__ import annotations

import os
import logging
from pathlib import Path
from contextlib import contextmanager
from typing import Generator

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session

from src.config import PROJECT_ROOT
from src.db.models import Base

logger = logging.getLogger(__name__)

# Database URL resolution
DEFAULT_SQLITE_PATH = PROJECT_ROOT / "data" / "retentionai.db"
DEFAULT_SQLITE_PATH.parent.mkdir(parents=True, exist_ok=True)

DATABASE_URL = os.environ.get("DATABASE_URL") or f"sqlite:///{DEFAULT_SQLITE_PATH}"

# For SQLite, enable check_same_thread=False for multi-threaded FastAPI handlers
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    """Create all database tables if they do not already exist."""
    try:
        Base.metadata.create_all(bind=engine)
        logger.info("Database initialized successfully at %s", DATABASE_URL)
    except Exception as exc:
        logger.error("Failed to initialize database: %s", exc)
        raise


@contextmanager
def get_db_session() -> Generator[Session, None, None]:
    """Context manager for thread-safe database sessions."""
    session = SessionLocal()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
