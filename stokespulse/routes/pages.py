from flask import Blueprint, current_app, render_template, session

from .. import auth

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index():
    # Mobile User-Agent redirect to /mobile happens in the app-level
    # before_request hook (must run ahead of the login-redirect logic there).
    return render_template(
        "index.html",
        app_name=current_app.config["APP_NAME"],
        accent=current_app.config["ACCENT"],
        is_admin=auth.is_admin(session.get("user")),
    )


@pages_bp.route("/mobile")
def mobile():
    return render_template(
        "mobile.html",
        app_name=current_app.config["APP_NAME"],
        is_admin=auth.is_admin(session.get("user")),
    )
