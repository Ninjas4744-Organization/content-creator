from __future__ import annotations

import hashlib
import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Callable, Iterator


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


class Store:
    """Atomic, persistent flow/session/attempt storage, shared by WSGI workers."""

    def __init__(self, path: Path):
        self.path = path
        path.parent.mkdir(parents=True, exist_ok=True)
        # The directory must also be private: SQLite can create WAL/SHM sidecars.
        if not path.exists():
            path.touch(mode=0o600)
        db = sqlite3.connect(path, timeout=15)
        try:
            db.execute("PRAGMA journal_mode=WAL")
        finally:
            db.close()
        with self.connection() as db:
            db.execute("CREATE TABLE IF NOT EXISTS records (kind TEXT, key TEXT, data TEXT NOT NULL, "
                       "expires REAL NOT NULL, PRIMARY KEY (kind, key))")

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=15)
        try:
            with db:
                db.execute("BEGIN IMMEDIATE")
                yield db
        finally:
            db.close()

    def put(self, kind: str, key: str, value: dict, seconds: int) -> None:
        with self.connection() as db:
            db.execute("DELETE FROM records WHERE expires < ?", (time.time(),))
            db.execute("INSERT INTO records VALUES (?, ?, ?, ?)",
                       (kind, key, json.dumps(value), time.time() + seconds))

    def get(self, kind: str, key: str, *, consume: bool = False) -> dict:
        with self.connection() as db:
            row = db.execute("SELECT data FROM records WHERE kind=? AND key=? AND expires>?",
                             (kind, key, time.time())).fetchone()
            if row is None:
                raise ValueError("LTI session expired or invalid; launch again from your course")
            if consume:
                db.execute("DELETE FROM records WHERE kind=? AND key=?", (kind, key))
            return json.loads(row[0])

    def ensure(self, key: str, value: dict, seconds: int) -> dict:
        with self.connection() as db:
            db.execute("DELETE FROM records WHERE kind='attempt' AND key=? AND expires<?", (key, time.time()))
            db.execute("INSERT OR IGNORE INTO records VALUES ('attempt', ?, ?, ?)",
                       (key, json.dumps(value), time.time() + seconds))
            return json.loads(db.execute("SELECT data FROM records WHERE kind='attempt' AND key=?", (key,)).fetchone()[0])

    def change(self, kind: str, key: str, update: Callable[[dict], None]) -> dict:
        with self.connection() as db:
            row = db.execute("SELECT data FROM records WHERE kind=? AND key=? AND expires>?",
                             (kind, key, time.time())).fetchone()
            if row is None:
                raise ValueError("LTI session expired or invalid; launch again from your course")
            value = json.loads(row[0])
            update(value)
            db.execute("UPDATE records SET data=? WHERE kind=? AND key=?", (json.dumps(value), kind, key))
            return value
