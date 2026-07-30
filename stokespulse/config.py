import json
import os
import tempfile
import threading

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG_DIR = os.path.join(BASE_DIR, "config")
DATA_DIR = os.path.join(BASE_DIR, "data")

TARGETS_PATH = os.path.join(CONFIG_DIR, "targets.json")
ALERTING_PATH = os.path.join(CONFIG_DIR, "alerting.json")
MAINTENANCE_PATH = os.path.join(CONFIG_DIR, "maintenance.json")
ALERT_OVERRIDES_PATH = os.path.join(CONFIG_DIR, "alert_overrides.json")

DEFAULT_ALERTING = {
    "smtp_host": "",
    "smtp_port": 587,
    "smtp_security": "starttls",  # none | starttls | ssl
    "smtp_user": "",
    "smtp_password": "",
    "smtp_from": "",
    "recipients": [],
    "send_recovery_emails": True,
    "heartbeat_url": "",
}

DEFAULT_MAINTENANCE = {"windows": []}
DEFAULT_ALERT_OVERRIDES = {"mutes": {}}

os.makedirs(DATA_DIR, exist_ok=True)

_lock = threading.Lock()
_targets_cache = {"mtime": None, "devices": []}


def _atomic_write_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.replace(tmp_path, path)
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)


def _read_json_with_default(path, default):
    if not os.path.exists(path):
        return dict(default)
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    merged = dict(default)
    merged.update(data)
    return merged


def load_targets():
    """Reload config/targets.json only if it changed on disk (git pull updates it)."""
    with _lock:
        try:
            mtime = os.path.getmtime(TARGETS_PATH)
        except OSError:
            return []
        if mtime != _targets_cache["mtime"]:
            with open(TARGETS_PATH, "r", encoding="utf-8") as f:
                raw = json.load(f)
            devices = []
            for d in raw.get("devices", []):
                devices.append({
                    "id": d["id"],
                    "name": d.get("name", d["id"]),
                    "category": d.get("category", "vm"),
                    "group": d.get("group", "VMs"),
                    "ip": d["ip"],
                    "ports": d.get("ports", []),
                    "depends_on": d.get("depends_on"),
                    "icmp_only": d.get("icmp_only", False),
                })
            _targets_cache["mtime"] = mtime
            _targets_cache["devices"] = devices
        return list(_targets_cache["devices"])


def load_alerting():
    return _read_json_with_default(ALERTING_PATH, DEFAULT_ALERTING)


def save_alerting(new_data):
    current = load_alerting()
    # never let a blank/missing password in a save request wipe out the stored one
    if not new_data.get("smtp_password"):
        new_data = dict(new_data)
        new_data["smtp_password"] = current.get("smtp_password", "")
    merged = dict(current)
    merged.update(new_data)
    _atomic_write_json(ALERTING_PATH, merged)
    return merged


def load_maintenance():
    return _read_json_with_default(MAINTENANCE_PATH, DEFAULT_MAINTENANCE)


def save_maintenance(data):
    _atomic_write_json(MAINTENANCE_PATH, data)
    return data


def load_alert_overrides():
    return _read_json_with_default(ALERT_OVERRIDES_PATH, DEFAULT_ALERT_OVERRIDES)


def save_alert_overrides(data):
    _atomic_write_json(ALERT_OVERRIDES_PATH, data)
    return data


def is_muted(device_id):
    return bool(load_alert_overrides().get("mutes", {}).get(device_id))


def set_muted(device_id, muted):
    data = load_alert_overrides()
    data.setdefault("mutes", {})[device_id] = bool(muted)
    save_alert_overrides(data)
    return data
