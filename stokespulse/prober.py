import re
import socket
import subprocess
import sys
import threading
import time

from . import db, config

CYCLE_SECONDS = 45
DOWN_AFTER_CYCLES = 2
PING_TIMEOUT_S = 1.5
TCP_TIMEOUT_S = 2.0

_PING_TIME_RE = re.compile(r"time[=<]([\d.]+)\s*ms", re.IGNORECASE)

_last_purge = 0


def ping_host(ip, timeout=PING_TIMEOUT_S):
    """Returns latency in ms (float) if the host answers ICMP, else None."""
    if sys.platform.startswith("win"):
        cmd = ["ping", "-n", "1", "-w", str(int(timeout * 1000)), ip]
    else:
        cmd = ["ping", "-c", "1", "-W", str(max(1, int(round(timeout)))), ip]
    try:
        result = subprocess.run(
            cmd, capture_output=True, text=True, timeout=timeout + 2
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    match = _PING_TIME_RE.search(result.stdout)
    if match:
        return float(match.group(1))
    return 0.1  # answered but couldn't parse latency (e.g. "time<1ms" locales)


def tcp_check(ip, port, timeout=TCP_TIMEOUT_S):
    """Returns (is_open, latency_ms)."""
    start = time.monotonic()
    try:
        with socket.create_connection((ip, port), timeout=timeout):
            return True, (time.monotonic() - start) * 1000
    except OSError:
        return False, None


def probe_device(device):
    """Returns dict: {status: up|degraded|fail, latency_ms, ports_open, ports_closed}"""
    ping_latency = ping_host(device["ip"])

    if device.get("icmp_only"):
        status = "up" if ping_latency is not None else "fail"
        return {"status": status, "latency_ms": ping_latency, "ports_open": [], "ports_closed": []}

    ports_open, ports_closed = [], []
    port_latencies = []
    for port in device.get("ports", []):
        is_open, latency = tcp_check(device["ip"], port)
        if is_open:
            ports_open.append(port)
            if latency is not None:
                port_latencies.append(latency)
        else:
            ports_closed.append(port)

    has_ports = bool(device.get("ports"))
    reachable = ping_latency is not None or bool(ports_open)

    if not reachable:
        status = "fail"
    elif ping_latency is not None and (not has_ports or not ports_closed):
        status = "up"
    else:
        status = "degraded"

    latency_ms = ping_latency if ping_latency is not None else (
        min(port_latencies) if port_latencies else None
    )
    return {"status": status, "latency_ms": latency_ms, "ports_open": ports_open, "ports_closed": ports_closed}


def _topo_sort(devices):
    by_id = {d["id"]: d for d in devices}

    def depth(dev, seen=None):
        seen = seen or set()
        parent_id = dev.get("depends_on")
        if not parent_id or parent_id not in by_id or parent_id in seen:
            return 0
        return 1 + depth(by_id[parent_id], seen | {dev["id"]})

    return sorted(devices, key=depth)


def run_cycle():
    from . import alerting, heartbeat

    devices = _topo_sort(config.load_targets())
    newly_down = []
    newly_recovered = []

    for device in devices:
        try:
            result = probe_device(device)
        except Exception as exc:  # a single bad device must not kill the cycle
            result = {"status": "fail", "latency_ms": None, "ports_open": [], "ports_closed": []}
            print(f"[prober] error probing {device['id']}: {exc}")

        state = db.get_device_state(device["id"]) or {
            "status": "up", "consecutive_fail_cycles": 0, "open_event_id": None
        }

        if result["status"] == "fail":
            fail_cycles = state["consecutive_fail_cycles"] + 1
            new_status = "down" if fail_cycles >= DOWN_AFTER_CYCLES else state["status"]
        else:
            fail_cycles = 0
            new_status = result["status"]

        was_down = state["status"] == "down"
        now_down = new_status == "down"
        open_event_id = state["open_event_id"]

        if now_down and not was_down:
            open_event_id = db.open_event(device["id"], "down", "pending",
                                           details=f"{device['name']} unreachable")
            newly_down.append((device, open_event_id))
        elif was_down and not now_down:
            if open_event_id:
                newly_recovered.append((device, open_event_id))
                db.close_event(open_event_id, details="recovered")
            open_event_id = None

        db.upsert_device_state(device["id"], new_status, fail_cycles, open_event_id)
        db.record_probe(device["id"], new_status, result["latency_ms"],
                         result["ports_open"], result["ports_closed"])

    if newly_down or newly_recovered:
        try:
            alerting.process_transitions(newly_down, newly_recovered)
        except Exception as exc:
            print(f"[prober] alerting error: {exc}")

    global _last_purge
    if time.time() - _last_purge > 3600:
        db.purge_old()
        _last_purge = time.time()

    try:
        heartbeat.ping()
    except Exception as exc:
        print(f"[prober] heartbeat error: {exc}")


def _loop():
    while True:
        started = time.monotonic()
        try:
            run_cycle()
        except Exception as exc:
            print(f"[prober] cycle error: {exc}")
        elapsed = time.monotonic() - started
        time.sleep(max(1.0, CYCLE_SECONDS - elapsed))


def start_background_loop():
    thread = threading.Thread(target=_loop, daemon=True, name="prober")
    thread.start()
    return thread
