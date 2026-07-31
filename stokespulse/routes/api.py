import uuid

from flask import Blueprint, jsonify, request, session

from .. import alerting, auth, config, db, stats, version

api_bp = Blueprint("api", __name__)


def _device_map():
    return {d["id"]: d for d in config.load_targets()}


@api_bp.route("/meta")
def meta():
    return jsonify({
        "app_name": "Stokes-Pulse",
        "accent": "#a855f7",
        "version": version.get_version(),
        "groups_order": stats.GROUP_ORDER,
        "current_user": session.get("user"),
        "role": auth.get_role(session.get("user")),
    })


@api_bp.route("/users", methods=["GET", "POST"])
def users_endpoint():
    if request.method == "GET":
        return jsonify({"users": auth.list_users(), "current_user": session.get("user")})
    body = request.get_json(force=True) or {}
    try:
        auth.create_user(body.get("username", ""), body.get("password", ""), role=body.get("role", "user"))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"users": auth.list_users()})


@api_bp.route("/users/<username>", methods=["PATCH"])
def update_user_role_endpoint(username):
    body = request.get_json(force=True) or {}
    try:
        auth.set_role(username, body.get("role", ""))
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    return jsonify({"users": auth.list_users()})


@api_bp.route("/users/<username>", methods=["DELETE"])
def delete_user_endpoint(username):
    try:
        auth.delete_user(username)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 400
    if session.get("user", "").lower() == (username or "").lower():
        session.clear()
    return jsonify({"users": auth.list_users()})


@api_bp.route("/changelog")
def changelog():
    return jsonify({"commits": version.get_changelog()})


@api_bp.route("/devices")
def devices():
    return jsonify({"groups_order": stats.GROUP_ORDER, "devices": stats.all_device_snapshots()})


@api_bp.route("/topology")
def topology():
    return jsonify({"groups_order": stats.GROUP_ORDER, "devices": stats.all_device_snapshots()})


@api_bp.route("/analytics")
def analytics():
    range_key = request.args.get("range", "24h")
    return jsonify(stats.analytics_overview(range_key))


@api_bp.route("/analytics/series")
def analytics_series():
    device_id = request.args.get("device")
    range_key = request.args.get("range", "24h")
    if not device_id or device_id not in _device_map():
        return jsonify({"error": "unknown device"}), 404
    return jsonify({"device_id": device_id, "series": stats.device_series(device_id, range_key)})


@api_bp.route("/events")
def events():
    limit = int(request.args.get("limit", 200))
    dev_map = _device_map()
    rows = db.get_events(limit=limit)
    for r in rows:
        dev = dev_map.get(r["device_id"])
        r["device_name"] = dev["name"] if dev else r["device_id"]
    return jsonify({"events": rows})


@api_bp.route("/impact")
def impact():
    return jsonify({"nodes": stats.impact_view()})


@api_bp.route("/maintenance", methods=["GET", "POST"])
def maintenance():
    data = config.load_maintenance()
    if request.method == "GET":
        return jsonify(data)
    body = request.get_json(force=True) or {}
    window = {
        "id": uuid.uuid4().hex[:8],
        "label": body.get("label", ""),
        "device_id": body.get("device_id") or "all",
        "type": body.get("type", "one_time"),
    }
    if window["type"] == "one_time":
        window["start"] = body["start"]
        window["end"] = body["end"]
    else:
        window["start_time"] = body["start_time"]
        window["end_time"] = body["end_time"]
        window["days_of_week"] = body.get("days_of_week", list(range(7)))
    data.setdefault("windows", []).append(window)
    config.save_maintenance(data)
    return jsonify(data)


@api_bp.route("/maintenance/<window_id>", methods=["DELETE"])
def delete_maintenance(window_id):
    data = config.load_maintenance()
    data["windows"] = [w for w in data.get("windows", []) if w["id"] != window_id]
    config.save_maintenance(data)
    return jsonify(data)


@api_bp.route("/settings", methods=["GET", "POST"])
def settings():
    if request.method == "GET":
        cfg = config.load_alerting()
        redacted = dict(cfg)
        redacted["has_password"] = bool(redacted.pop("smtp_password", ""))
        return jsonify(redacted)
    body = request.get_json(force=True) or {}
    saved = config.save_alerting(body)
    redacted = dict(saved)
    redacted["has_password"] = bool(redacted.pop("smtp_password", ""))
    return jsonify(redacted)


@api_bp.route("/settings/test-email", methods=["POST"])
def test_email():
    cfg = config.load_alerting()
    ok = alerting.send_test_email(cfg)
    return jsonify({"success": ok})


@api_bp.route("/mute", methods=["POST"])
def mute():
    body = request.get_json(force=True) or {}
    device_id = body.get("device_id")
    muted = bool(body.get("muted"))
    if not device_id or device_id not in _device_map():
        return jsonify({"error": "unknown device"}), 404
    data = config.set_muted(device_id, muted)
    return jsonify(data)
