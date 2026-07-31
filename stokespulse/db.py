import json
import sqlite3
import time

from .config import DATA_DIR
import os

DB_PATH = os.path.join(DATA_DIR, "monitor.db")

RETENTION_DAYS = 30

SCHEMA = """
CREATE TABLE IF NOT EXISTS probe_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    ts INTEGER NOT NULL,
    status TEXT NOT NULL,
    latency_ms REAL,
    ports_open TEXT NOT NULL DEFAULT '[]',
    ports_closed TEXT NOT NULL DEFAULT '[]'
);
CREATE INDEX IF NOT EXISTS idx_probe_history_device_ts ON probe_history(device_id, ts);

CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    device_id TEXT NOT NULL,
    event_type TEXT NOT NULL,
    started_at INTEGER NOT NULL,
    ended_at INTEGER,
    duration_s INTEGER,
    alerted TEXT NOT NULL DEFAULT 'none',
    details TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_device ON events(device_id);
CREATE INDEX IF NOT EXISTS idx_events_started ON events(started_at);

CREATE TABLE IF NOT EXISTS port_baseline (
    device_id TEXT NOT NULL,
    port INTEGER NOT NULL,
    first_seen_open_at INTEGER NOT NULL,
    PRIMARY KEY (device_id, port)
);

CREATE TABLE IF NOT EXISTS device_state (
    device_id TEXT PRIMARY KEY,
    status TEXT NOT NULL DEFAULT 'up',
    consecutive_fail_cycles INTEGER NOT NULL DEFAULT 0,
    open_event_id INTEGER
);
"""


def get_conn():
    conn = sqlite3.connect(DB_PATH, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    conn = get_conn()
    try:
        conn.executescript(SCHEMA)
        conn.commit()
    finally:
        conn.close()


def record_probe(device_id, status, latency_ms, ports_open, ports_closed):
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO probe_history (device_id, ts, status, latency_ms, ports_open, ports_closed) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (device_id, int(time.time()), status, latency_ms,
             json.dumps(ports_open), json.dumps(ports_closed)),
        )
        conn.commit()
    finally:
        conn.close()


def get_device_state(device_id):
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT * FROM device_state WHERE device_id = ?", (device_id,)
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def upsert_device_state(device_id, status, consecutive_fail_cycles, open_event_id):
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO device_state (device_id, status, consecutive_fail_cycles, open_event_id) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(device_id) DO UPDATE SET status=excluded.status, "
            "consecutive_fail_cycles=excluded.consecutive_fail_cycles, "
            "open_event_id=excluded.open_event_id",
            (device_id, status, consecutive_fail_cycles, open_event_id),
        )
        conn.commit()
    finally:
        conn.close()


def open_event(device_id, event_type, alerted, details=""):
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO events (device_id, event_type, started_at, alerted, details) "
            "VALUES (?, ?, ?, ?, ?)",
            (device_id, event_type, int(time.time()), alerted, details),
        )
        conn.commit()
        return cur.lastrowid
    finally:
        conn.close()


def record_instant_event(device_id, event_type, alerted, details=""):
    """For point-in-time events (e.g. port drift) that have no duration."""
    now = int(time.time())
    conn = get_conn()
    try:
        conn.execute(
            "INSERT INTO events (device_id, event_type, started_at, ended_at, duration_s, alerted, details) "
            "VALUES (?, ?, ?, ?, 0, ?, ?)",
            (device_id, event_type, now, now, alerted, details),
        )
        conn.commit()
    finally:
        conn.close()


def close_event(event_id, details=None):
    conn = get_conn()
    try:
        row = conn.execute("SELECT started_at FROM events WHERE id = ?", (event_id,)).fetchone()
        if not row:
            return
        ended_at = int(time.time())
        duration = ended_at - row["started_at"]
        if details is not None:
            conn.execute(
                "UPDATE events SET ended_at=?, duration_s=?, details=? WHERE id=?",
                (ended_at, duration, details, event_id),
            )
        else:
            conn.execute(
                "UPDATE events SET ended_at=?, duration_s=? WHERE id=?",
                (ended_at, duration, event_id),
            )
        conn.commit()
    finally:
        conn.close()


def set_event_alerted(event_id, alerted, details=None):
    conn = get_conn()
    try:
        if details is not None:
            conn.execute("UPDATE events SET alerted=?, details=? WHERE id=?", (alerted, details, event_id))
        else:
            conn.execute("UPDATE events SET alerted=? WHERE id=?", (alerted, event_id))
        conn.commit()
    finally:
        conn.close()


def get_events(limit=200, device_id=None):
    conn = get_conn()
    try:
        if device_id:
            rows = conn.execute(
                "SELECT * FROM events WHERE device_id = ? ORDER BY started_at DESC LIMIT ?",
                (device_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM events ORDER BY started_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_recent_history(device_id, since_ts):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT * FROM probe_history WHERE device_id = ? AND ts >= ? ORDER BY ts ASC",
            (device_id, since_ts),
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


def get_baseline_ports(device_id):
    conn = get_conn()
    try:
        rows = conn.execute(
            "SELECT port FROM port_baseline WHERE device_id = ?", (device_id,)
        ).fetchall()
        return {r["port"] for r in rows}
    finally:
        conn.close()


def add_baseline_port(device_id, port):
    conn = get_conn()
    try:
        conn.execute(
            "INSERT OR IGNORE INTO port_baseline (device_id, port, first_seen_open_at) VALUES (?, ?, ?)",
            (device_id, port, int(time.time())),
        )
        conn.commit()
    finally:
        conn.close()


def has_baseline(device_id):
    conn = get_conn()
    try:
        row = conn.execute(
            "SELECT 1 FROM port_baseline WHERE device_id = ? LIMIT 1", (device_id,)
        ).fetchone()
        return row is not None
    finally:
        conn.close()


def purge_old(days=RETENTION_DAYS):
    cutoff = int(time.time()) - days * 86400
    conn = get_conn()
    try:
        conn.execute("DELETE FROM probe_history WHERE ts < ?", (cutoff,))
        conn.execute("DELETE FROM events WHERE started_at < ? AND ended_at IS NOT NULL", (cutoff,))
        conn.commit()
    finally:
        conn.close()
