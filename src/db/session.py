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
    """Create all database tables if they do not already exist and run safe migrations."""
    try:
        Base.metadata.create_all(bind=engine)
        # Safe column migrations for SQLite
        with engine.connect() as conn:
            # Check drift_snapshots columns
            res = conn.exec_driver_sql("PRAGMA table_info(drift_snapshots)").fetchall()
            existing_cols = {row[1] for row in res}
            new_cols = [
                ("window_start", "VARCHAR(64)"),
                ("window_end", "VARCHAR(64)"),
                ("prediction_event_start_id", "INTEGER"),
                ("prediction_event_end_id", "INTEGER"),
            ]
            for col_name, col_type in new_cols:
                if col_name not in existing_cols:
                    conn.exec_driver_sql(f"ALTER TABLE drift_snapshots ADD COLUMN {col_name} {col_type}")
                    logger.info("Migrated column %s on drift_snapshots", col_name)
            conn.commit()
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
