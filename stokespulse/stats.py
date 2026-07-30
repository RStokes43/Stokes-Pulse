import json
import statistics
import time

from . import config, db

GROUP_ORDER = ["Internet", "VPN", "Firewall", "Network", "Storage", "Hosts", "VMs"]
RANGE_HOURS = {"24h": 24, "7d": 24 * 7, "30d": 24 * 30}


def _uptime_pct(history):
    if not history:
        return None
    up_count = sum(1 for h in history if h["status"] != "down")
    return round(100.0 * up_count / len(history), 2)


def _percentile(values, pct):
    if not values:
        return None
    s = sorted(values)
    k = (len(s) - 1) * (pct / 100)
    f = int(k)
    c = min(f + 1, len(s) - 1)
    if f == c:
        return s[f]
    return s[f] + (s[c] - s[f]) * (k - f)


def device_status_snapshot(device):
    state = db.get_device_state(device["id"]) or {"status": "up"}
    since = int(time.time()) - 24 * 3600
    history = db.get_recent_history(device["id"], since)
    latest = history[-1] if history else None
    return {
        **device,
        "status": state["status"],
        "latency_ms": latest["latency_ms"] if latest else None,
        "ports_open": json.loads(latest["ports_open"]) if latest else [],
        "ports_closed": json.loads(latest["ports_closed"]) if latest else [],
        "uptime_24h_pct": _uptime_pct(history),
        "sparkline": [h["latency_ms"] for h in history[-30:]],
        "muted": config.is_muted(device["id"]),
    }

def all_device_snapshots():
    return [device_status_snapshot(d) for d in config.load_targets()]


def device_analytics_summary(device, hours):
    since = int(time.time()) - hours * 3600
    history = db.get_recent_history(device["id"], since)
    latencies = [h["latency_ms"] for h in history if h["latency_ms"] is not None]
    events = db.get_events(limit=2000, device_id=device["id"])
    incidents = [e for e in events if e["event_type"] == "down" and e["started_at"] >= since]
    durations = [e["duration_s"] for e in incidents if e["duration_s"] is not None]
    return {
        "device_id": device["id"],
        "name": device["name"],
        "category": device["category"],
        "uptime_pct": _uptime_pct(history),
        "avg_latency_ms": round(statistics.mean(latencies), 1) if latencies else None,
        "p95_latency_ms": round(_percentile(latencies, 95), 1) if latencies else None,
        "incidents_count": len(incidents),
        "mttr_seconds": round(statistics.mean(durations)) if durations else None,
    }


def analytics_overview(range_key):
    hours = RANGE_HOURS.get(range_key, 24)
    devices = config.load_targets()
    summaries = [device_analytics_summary(d, hours) for d in devices]
    leaderboard = sorted(
        summaries,
        key=lambda s: (s["incidents_count"], s["mttr_seconds"] or 0),
        reverse=True,
    )[:5]
    return {"range": range_key, "devices": summaries, "leaderboard": leaderboard}


def device_series(device_id, range_key):
    hours = RANGE_HOURS.get(range_key, 24)
    since = int(time.time()) - hours * 3600
    history = db.get_recent_history(device_id, since)
    return [{"ts": h["ts"], "latency_ms": h["latency_ms"], "status": h["status"]} for h in history]


def impact_view():
    devices = config.load_targets()
    by_id = {d["id"]: d for d in devices}
    children_map = {}
    for d in devices:
        parent = d.get("depends_on")
        if parent:
            children_map.setdefault(parent, []).append(d["id"])

    nodes = []
    for d in devices:
        state = db.get_device_state(d["id"]) or {"status": "up"}
        impacted, root_cause = _is_impacted(d, by_id)
        nodes.append({
            "id": d["id"],
            "name": d["name"],
            "category": d["category"],
            "status": state["status"],
            "depends_on": d.get("depends_on"),
            "children": children_map.get(d["id"], []),
            "impacted": impacted,
            "root_cause": root_cause,
        })
    return nodes


def _is_impacted(device, by_id):
    parent_id = device.get("depends_on")
    seen = set()
    while parent_id and parent_id not in seen:
        seen.add(parent_id)
        parent = by_id.get(parent_id)
        if not parent:
            break
        pstate = db.get_device_state(parent_id)
        if pstate and pstate["status"] == "down":
            return True, parent_id
        parent_id = parent.get("depends_on")
    return False, None
