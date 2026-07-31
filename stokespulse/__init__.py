import re
from datetime import timedelta

from flask import Flask, jsonify, redirect, request, session, url_for

from . import auth
from . import db as db_module
from . import prober, port_drift

APP_NAME = "Stokes-Pulse"
ACCENT = "#a855f7"  # purple/violet

# Endpoints reachable without a session (login/setup pages + their POSTs, and
# Flask's own static file server so the login page can load CSS/JS).
PUBLIC_ENDPOINTS = {"auth.login", "auth.setup", "auth.logout", "static"}

MOBILE_UA_RE = re.compile(r"Android|iPhone|iPod|Windows Phone|BlackBerry", re.I)

# API paths behind the Maintenance/Settings/Users tabs — regular users don't
# get these even though they're logged in.
ADMIN_ONLY_PATH_PREFIXES = ("/api/maintenance", "/api/settings", "/api/users")


def create_app(start_background=True):
    app = Flask(__name__)
    app.config["APP_NAME"] = APP_NAME
    app.config["ACCENT"] = ACCENT
    app.secret_key = auth.get_or_create_secret_key()
    app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=30)
    app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

    db_module.init_db()

    from .routes.pages import pages_bp
    from .routes.api import api_bp
    from .routes.auth import auth_bp
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp, url_prefix="/api")
    app.register_blueprint(auth_bp)

    @app.before_request
    def require_login():
        # Must run before the login-redirect logic below, otherwise an
        # unauthenticated mobile visitor gets bounced to
        # /login?next=/ (desktop) instead of /login?next=/mobile.
        if (
            request.path == "/"
            and request.args.get("desktop") != "1"
            and MOBILE_UA_RE.search(request.headers.get("User-Agent", ""))
        ):
            return redirect(url_for("pages.mobile"))

        if request.endpoint in PUBLIC_ENDPOINTS:
            return None
        if not auth.has_any_users():
            if request.path.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect(url_for("auth.setup", next=request.path))
        if not session.get("user"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect(url_for("auth.login", next=request.path))
        if request.path.startswith(ADMIN_ONLY_PATH_PREFIXES) and not auth.is_admin(session["user"]):
            return jsonify({"error": "admin access required"}), 403
        return None

    if start_background:
        prober.start_background_loop()
        port_drift.start_background_loop()

    return app
