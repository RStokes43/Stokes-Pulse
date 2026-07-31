from flask import Blueprint, current_app, redirect, render_template, request, session, url_for

from .. import auth

auth_bp = Blueprint("auth", __name__)


def _app_name():
    return current_app.config["APP_NAME"]


def _safe_next(value):
    """Only allow same-site relative paths, never an absolute/external URL (open-redirect guard)."""
    if value and value.startswith("/") and not value.startswith("//"):
        return value
    return url_for("pages.index")


@auth_bp.route("/login", methods=["GET", "POST"])
def login():
    next_url = _safe_next(request.values.get("next", ""))

    if not auth.has_any_users():
        return redirect(url_for("auth.setup", next=next_url))

    error = None
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        if auth.verify_user(username, password):
            session.clear()
            session["user"] = username
            session.permanent = True
            return redirect(next_url)
        error = "Invalid username or password."

    return render_template("login.html", error=error, app_name=_app_name(), next=next_url)


@auth_bp.route("/setup", methods=["GET", "POST"])
def setup():
    if auth.has_any_users():
        return redirect(url_for("auth.login"))

    next_url = _safe_next(request.values.get("next", ""))
    error = None
    if request.method == "POST":
        username = request.form.get("username", "")
        password = request.form.get("password", "")
        confirm = request.form.get("confirm", "")
        if password != confirm:
            error = "Passwords do not match."
        else:
            try:
                auth.create_user(username, password, role="admin")
                session.clear()
                session["user"] = username
                session.permanent = True
                return redirect(next_url)
            except ValueError as exc:
                error = str(exc)

    return render_template("setup.html", error=error, app_name=_app_name(), next=next_url)


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("auth.login"))
