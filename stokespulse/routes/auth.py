from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer

from flask import Blueprint, current_app, redirect, render_template, request, session, url_for

from .. import auth, google_oauth

auth_bp = Blueprint("auth", __name__)

STATE_SALT = "oauth-state"
STATE_MAX_AGE = 600  # 10 minutes


def _app_name():
    return current_app.config["APP_NAME"]


def _safe_next(value):
    """Only allow same-site relative paths, never an absolute/external URL (open-redirect guard)."""
    if value and value.startswith("/") and not value.startswith("//"):
        return value
    return url_for("pages.index")


def _is_android_app(req):
    return "StokesPulseAndroid" in req.headers.get("User-Agent", "")


def _state_serializer():
    return URLSafeTimedSerializer(current_app.secret_key, salt=STATE_SALT)


def _make_state(next_url, client):
    return _state_serializer().dumps({"next": next_url, "client": client})


def _parse_state(raw_state):
    try:
        return _state_serializer().loads(raw_state, max_age=STATE_MAX_AGE)
    except (BadSignature, SignatureExpired):
        return None


def _google_url_for(next_url, client):
    return google_oauth.build_authorize_url(_make_state(next_url, client))


def _login_error_page(message, client, next_url, status=400):
    google_url = _google_url_for(next_url, client)
    return render_template("login.html", error=message, app_name=_app_name(), google_url=google_url), status


@auth_bp.route("/login")
def login():
    next_url = _safe_next(request.values.get("next", ""))
    client = "android" if _is_android_app(request) else "web"
    google_url = _google_url_for(next_url, client)
    return render_template("login.html", error=None, app_name=_app_name(), google_url=google_url)


@auth_bp.route("/auth/google/callback")
def google_callback():
    state = _parse_state(request.args.get("state", ""))
    # Fall back to a best-guess client/next for the retry link on the error
    # page itself — the state is only untrustworthy/expired at this point,
    # not the request that got us here.
    client = state["client"] if state else ("android" if _is_android_app(request) else "web")
    next_url = state["next"] if state else url_for("pages.index")

    if state is None:
        return _login_error_page("Your sign-in session expired — please try again.", client, next_url)
    if request.args.get("error"):
        return _login_error_page("Sign-in was cancelled.", client, next_url)

    try:
        tokens = google_oauth.exchange_code(request.args.get("code", ""))
        email = google_oauth.get_verified_email(tokens["id_token"])
    except Exception as exc:
        print(f"[auth] Google OAuth callback failed: {exc}")
        return _login_error_page("Sign-in failed — please try again.", client, next_url)

    if auth.email_role(email) is None:
        return _login_error_page(
            f"{email} isn't authorized for this app. Ask an admin to add it.", client, next_url, status=403
        )

    if client == "android":
        token = google_oauth.mint_handoff_token(email)
        return redirect(f"stokespulse://auth-callback?token={token}")

    session.clear()
    session["user"] = email
    session.permanent = True
    return redirect(next_url)


@auth_bp.route("/auth/token-login", methods=["POST"])
def token_login():
    email = google_oauth.consume_handoff_token(request.form.get("token", ""))
    if email is None or auth.email_role(email) is None:
        return _login_error_page("Sign-in link expired — please try again.", "android", url_for("pages.mobile"))
    session.clear()
    session["user"] = email
    session.permanent = True
    return redirect(url_for("pages.mobile"))


@auth_bp.route("/logout", methods=["POST"])
def logout():
    session.clear()
    return redirect(url_for("auth.login"))
