import re

from flask import Blueprint, current_app, redirect, render_template, request, session, url_for

from .. import auth

pages_bp = Blueprint("pages", __name__)

MOBILE_UA_RE = re.compile(r"Android|iPhone|iPod|Windows Phone|BlackBerry", re.I)


@pages_bp.route("/")
def index():
    ua = request.headers.get("User-Agent", "")
    if MOBILE_UA_RE.search(ua) and request.args.get("desktop") != "1":
        return redirect(url_for("pages.mobile"))
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
