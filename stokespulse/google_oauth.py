import json
import secrets
import threading
import time
import urllib.parse
import urllib.request

from . import config

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"
TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"

# Hardcoded rather than derived from request headers — the redirect_uri must
# exactly match what's registered in the Google Cloud OAuth client, and must
# never be attacker-influenced.
REDIRECT_URI = "https://pulse.stokescloud.net/auth/google/callback"

HANDOFF_TOKEN_TTL_SECONDS = 120

_handoff_lock = threading.Lock()
_handoff_tokens = {}  # token -> (email, expires_at)


def build_authorize_url(state):
    client_id = config.load_oauth().get("client_id", "")
    params = {
        "client_id": client_id,
        "redirect_uri": REDIRECT_URI,
        "response_type": "code",
        "scope": "openid email",
        "state": state,
        "prompt": "select_account",
    }
    return f"{AUTHORIZE_URL}?{urllib.parse.urlencode(params)}"


def exchange_code(code):
    """POST the authorization code for tokens. Raises on any failure."""
    cfg = config.load_oauth()
    body = urllib.parse.urlencode({
        "code": code,
        "client_id": cfg.get("client_id", ""),
        "client_secret": cfg.get("client_secret", ""),
        "redirect_uri": REDIRECT_URI,
        "grant_type": "authorization_code",
    }).encode()
    req = urllib.request.Request(TOKEN_URL, data=body, method="POST")
    with urllib.request.urlopen(req, timeout=10) as resp:
        return json.loads(resp.read())


def verify_id_token(id_token):
    """Validate the id_token via Google's tokeninfo endpoint and return its claims.

    This isn't local JWKS/RS256 verification — a conscious trade-off to avoid
    adding google-auth/pyjwt/cryptography as new dependencies. It's a
    reasonable one here because the id_token only ever reaches this function
    after a code->token exchange that already happened over a direct,
    client-secret-authenticated TLS connection to Google; tokeninfo is really
    just a convenient claims parser plus a defensive recheck at this point,
    not the sole trust anchor.
    """
    url = f"{TOKENINFO_URL}?{urllib.parse.urlencode({'id_token': id_token})}"
    with urllib.request.urlopen(url, timeout=10) as resp:
        return json.loads(resp.read())


def get_verified_email(id_token):
    """Return the verified, lowercased email from an id_token, or raise ValueError."""
    claims = verify_id_token(id_token)
    client_id = config.load_oauth().get("client_id", "")
    if claims.get("aud") != client_id:
        raise ValueError("Token audience mismatch.")
    if claims.get("email_verified") != "true":
        raise ValueError("Google account email is not verified.")
    email = claims.get("email", "").strip().lower()
    if not email:
        raise ValueError("No email in token claims.")
    return email


def _purge_expired_handoff_tokens(now):
    expired = [t for t, (_, exp) in _handoff_tokens.items() if exp <= now]
    for t in expired:
        _handoff_tokens.pop(t, None)


def mint_handoff_token(email):
    """Create a short-lived, single-use token for the Android Custom Tabs -> WebView handoff."""
    token = secrets.token_urlsafe(32)
    now = time.time()
    with _handoff_lock:
        _purge_expired_handoff_tokens(now)
        _handoff_tokens[token] = (email, now + HANDOFF_TOKEN_TTL_SECONDS)
    return token


def consume_handoff_token(token):
    """Pop and return the email for a valid, unexpired token, or None. Single-use."""
    now = time.time()
    with _handoff_lock:
        entry = _handoff_tokens.pop(token, None)
    if entry is None:
        return None
    email, expires_at = entry
    if expires_at <= now:
        return None
    return email
