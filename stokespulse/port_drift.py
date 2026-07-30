import threading
import time

from . import config, db
from .prober import tcp_check

SCAN_INTERVAL_S = 1800

NOTABLE_PORTS = [
    21, 22, 23, 25, 53, 80, 110, 139, 143, 443, 445, 465, 587, 993, 995,
    1433, 1521, 2049, 2375, 3000, 3306, 3389, 5000, 5001, 5432, 5900, 5985,
    6379, 7000, 7001, 7777, 8000, 8006, 8080, 8081, 8096, 8123, 8443, 8888,
    9000, 9090, 9100, 9987, 10011, 25565, 25575, 27015, 27017, 28015, 32400,
]


def scan_device(device):
    open_ports = set()
    for port in NOTABLE_PORTS:
        is_open, _ = tcp_check(device["ip"], port, timeout=0.6)
        if is_open:
            open_ports.add(port)
    return open_ports


def run_scan():
    devices = config.load_targets()
    for device in devices:
        if device.get("icmp_only"):
            continue
        try:
            current_open = scan_device(device)
        except Exception as exc:
            print(f"[port_drift] error scanning {device['id']}: {exc}")
            continue

        if not db.has_baseline(device["id"]):
            for port in current_open | set(device.get("ports", [])):
                db.add_baseline_port(device["id"], port)
            continue

        baseline = db.get_baseline_ports(device["id"])
        new_ports = sorted(current_open - baseline)
        if new_ports:
            from . import alerting
            alerting.send_port_drift_alert(device, new_ports)
            db.record_instant_event(
                device["id"], "security", "sent",
                details=f"New port(s) opened: {new_ports}",
            )
            for port in new_ports:
                db.add_baseline_port(device["id"], port)


def _loop():
    while True:
        try:
            run_scan()
        except Exception as exc:
            print(f"[port_drift] scan error: {exc}")
        time.sleep(SCAN_INTERVAL_S)


def start_background_loop():
    thread = threading.Thread(target=_loop, daemon=True, name="port_drift")
    thread.start()
    return thread
