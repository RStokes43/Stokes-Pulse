import smtplib
from datetime import datetime, time as dtime
from email.message import EmailMessage

from . import db, config


def _in_maintenance(device_id, maintenance):
    now = datetime.now()
    for w in maintenance.get("windows", []):
        target = w.get("device_id")
        if target not in (None, "all", device_id):
            continue
        try:
            if w["type"] == "one_time":
                start = datetime.fromisoformat(w["start"])
                end = datetime.fromisoformat(w["end"])
                if start <= now <= end:
                    return True
            elif w["type"] == "daily":
                if now.weekday() not in w.get("days_of_week", list(range(7))):
                    continue
                start_t = dtime.fromisoformat(w["start_time"])
                end_t = dtime.fromisoformat(w["end_time"])
                if start_t <= now.time() <= end_t:
                    return True
        except (KeyError, ValueError):
            continue
    return False


def process_transitions(newly_down, newly_recovered):
    alerting_cfg = config.load_alerting()
    maintenance = config.load_maintenance()
    overrides = config.load_alert_overrides()
    mutes = overrides.get("mutes", {})

    to_alert_down = []
    for device, event_id in newly_down:
        if mutes.get(device["id"]):
            db.set_event_alerted(event_id, "muted")
            continue
        if _in_maintenance(device["id"], maintenance):
            db.set_event_alerted(event_id, "maintenance")
            continue
        parent_id = device.get("depends_on")
        if parent_id:
            parent_state = db.get_device_state(parent_id)
            if parent_state and parent_state["status"] == "down":
                db.set_event_alerted(event_id, "suppressed")
                continue
        to_alert_down.append((device, event_id))

    if to_alert_down:
        sent = _send_down_digest(alerting_cfg, to_alert_down)
        status = "sent" if sent else "failed"
        for _, event_id in to_alert_down:
            db.set_event_alerted(event_id, status)

    if newly_recovered and alerting_cfg.get("send_recovery_emails", True):
        to_notify = [(d, eid) for d, eid in newly_recovered if not mutes.get(d["id"])]
        if to_notify:
            _send_recovery_digest(alerting_cfg, to_notify)


def _auth_and_send(smtp_obj, cfg, msg):
    if cfg.get("smtp_user"):
        smtp_obj.login(cfg["smtp_user"], cfg.get("smtp_password", ""))
    smtp_obj.send_message(msg)


def _send_email(cfg, subject, body):
    if not cfg.get("smtp_host") or not cfg.get("recipients"):
        print(f"[alerting] SMTP not configured, skipping email: {subject}")
        return False
    msg = EmailMessage()
    msg["Subject"] = subject
    msg["From"] = cfg.get("smtp_from") or cfg.get("smtp_user") or "stokes-pulse@localhost"
    msg["To"] = ", ".join(cfg["recipients"])
    msg.set_content(body)
    try:
        security = cfg.get("smtp_security", "starttls")
        port = int(cfg.get("smtp_port", 587))
        if security == "ssl":
            with smtplib.SMTP_SSL(cfg["smtp_host"], port, timeout=10) as s:
                _auth_and_send(s, cfg, msg)
        else:
            with smtplib.SMTP(cfg["smtp_host"], port, timeout=10) as s:
                if security == "starttls":
                    s.starttls()
                _auth_and_send(s, cfg, msg)
        return True
    except Exception as exc:
        print(f"[alerting] failed to send email: {exc}")
        return False


def _format_duration(seconds):
    seconds = int(seconds or 0)
    if seconds < 60:
        return f"{seconds}s"
    minutes, s = divmod(seconds, 60)
    if minutes < 60:
        return f"{minutes}m {s}s"
    hours, m = divmod(minutes, 60)
    return f"{hours}h {m}m"


def _send_down_digest(cfg, items):
    if len(items) == 1:
        device, _ = items[0]
        subject = f"[Stokes-Pulse] DOWN: {device['name']}"
        body = f"{device['name']} ({device['ip']}) is DOWN.\n\nCategory: {device['category']}\n"
    else:
        subject = f"[Stokes-Pulse] DOWN: {len(items)} devices"
        lines = [f"- {d['name']} ({d['ip']})" for d, _ in items]
        body = "Multiple devices went down in the same check cycle:\n\n" + "\n".join(lines)
    return _send_email(cfg, subject, body)


def _send_recovery_digest(cfg, items):
    lines = []
    for device, event_id in items:
        conn = db.get_conn()
        try:
            row = conn.execute("SELECT duration_s FROM events WHERE id=?", (event_id,)).fetchone()
        finally:
            conn.close()
        dur_str = _format_duration(row["duration_s"]) if row and row["duration_s"] is not None else "unknown"
        lines.append(f"- {device['name']} ({device['ip']}) recovered after {dur_str}")

    if len(items) == 1:
        subject = f"[Stokes-Pulse] RECOVERED: {items[0][0]['name']}"
    else:
        subject = f"[Stokes-Pulse] RECOVERED: {len(items)} devices"
    return _send_email(cfg, subject, "\n".join(lines))


def send_port_drift_alert(device, new_ports):
    cfg = config.load_alerting()
    subject = f"[Stokes-Pulse] Port drift: {device['name']}"
    body = (
        f"New port(s) opened on {device['name']} ({device['ip']}) that weren't in the baseline:\n\n"
        + "\n".join(f"- {p}" for p in new_ports)
        + "\n\nThis may be expected (a service you just enabled) or worth investigating."
    )
    return _send_email(cfg, subject, body)


def send_test_email(cfg):
    return _send_email(
        cfg,
        "[Stokes-Pulse] Test alert",
        "This is a test email from Stokes-Pulse. If you received this, SMTP is configured correctly.",
    )
