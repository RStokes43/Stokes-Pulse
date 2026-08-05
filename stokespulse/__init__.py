import re
from datetime import timedelta

from flask import Flask, jsonify, redirect, request, session, url_for

from . import auth
from . import db as db_module
from . import prober, port_drift

APP_NAME = "Stokes-Pulse"
ACCENT = "#a855f7"  # purple/violet

# Endpoints reachable without a session (the Google sign-in page and the
# OAuth callback/handoff routes that establish one, plus Flask's own static
# file server so the login page can load CSS/JS).
PUBLIC_ENDPOINTS = {"auth.login", "auth.google_callback", "auth.token_login", "auth.logout", "static"}

MOBILE_UA_RE = re.compile(r"Android|iPhone|iPod|Windows Phone|BlackBerry", re.I)

# API paths behind the Maintenance/Settings/Allowed Emails tabs — regular
# users don't get these even though they're logged in.
ADMIN_ONLY_PATH_PREFIXES = ("/api/maintenance", "/api/settings", "/api/allowed-emails")


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

        # Anyone on the home LAN gets full, anonymous access — no session,
        # no further checks. This must run before PUBLIC_ENDPOINTS/login so
        # it applies uniformly to every route, matching "no auth required".
        if auth.is_lan_client(request):
            return None

        if request.endpoint in PUBLIC_ENDPOINTS:
            return None

        session_user = session.get("user")
        if session_user and auth.email_role(session_user) is None:
            # Was logged in, but no longer on the allow-list (removed, or a
            # stale pre-cutover session) — don't leave a half-broken zombie
            # session sitting around until it expires on its own.
            session.clear()
            session_user = None

        if not session_user:
            if request.path.startswith("/api/"):
                return jsonify({"error": "unauthorized"}), 401
            return redirect(url_for("auth.login", next=request.path))
        if request.path.startswith(ADMIN_ONLY_PATH_PREFIXES) and not auth.is_admin(session_user):
            return jsonify({"error": "admin access required"}), 403
        return None

    if start_background:
        prober.start_background_loop()
        port_drift.start_background_loop()

    return app
