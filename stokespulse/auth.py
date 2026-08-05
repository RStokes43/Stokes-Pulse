import ipaddress
import os
import secrets
import time

from .config import CONFIG_DIR, _atomic_write_json, _read_json_with_default

ALLOWED_EMAILS_PATH = os.path.join(CONFIG_DIR, "allowed_emails.json")
SECRET_KEY_PATH = os.path.join(CONFIG_DIR, "secret_key")
DEFAULT_ALLOWED_EMAILS = {"emails": []}
ROLES = ("admin", "user")

# Only nginx (on a separate host) ever connects to this app directly from a
# position where its X-Real-IP header should be trusted — it's the sole
# reverse proxy in front of the public pulse.stokescloud.net domain, and
# port 8420 itself has no WAN exposure (verified against the router's port
# forwarding rules). Any other direct peer's remote_addr is used as-is,
# since a real TCP connection's source IP can't be spoofed.
TRUSTED_PROXY_IP = "10.10.43.6"
LAN_NETWORK = ipaddress.ip_network("10.10.43.0/24")


def _client_ip(request):
    if request.remote_addr == TRUSTED_PROXY_IP:
        # nginx's vhost sets X-Real-IP from $remote_addr (not spoofable),
        # but X-Forwarded-For from $proxy_add_x_forwarded_for, which
        # *appends* to whatever the client already sent — a WAN client can
        # prepend a fake LAN address there, so it must never be trusted for
        # this decision. Only X-Real-IP is used, and if it's missing or
        # unparseable this fails closed rather than falling back to
        # remote_addr (which would resolve to nginx's own LAN address and
        # silently grant every proxied WAN request the bypass).
        real_ip = request.headers.get("X-Real-IP", "")
        try:
            return ipaddress.ip_address(real_ip)
        except ValueError:
            return None
    try:
        return ipaddress.ip_address(request.remote_addr)
    except (ValueError, TypeError):
        return None


def is_lan_client(request):
    ip = _client_ip(request)
    return ip is not None and ip in LAN_NETWORK


def load_allowed_emails():
    return _read_json_with_default(ALLOWED_EMAILS_PATH, DEFAULT_ALLOWED_EMAILS)


def save_allowed_emails(data):
    _atomic_write_json(ALLOWED_EMAILS_PATH, data)
    return data


def _normalize(email):
    return (email or "").strip().lower()


def find_allowed_email(email):
    email = _normalize(email)
    for e in load_allowed_emails().get("emails", []):
        if e["email"] == email:
            return e
    return None


def email_role(email):
    entry = find_allowed_email(email)
    return entry["role"] if entry else None


def is_admin(email):
    return email_role(email) == "admin"


def effective_role(session_user, is_lan):
    if is_lan:
        return "admin"
    return email_role(session_user) if session_user else None


def effective_is_admin(session_user, is_lan):
    return effective_role(session_user, is_lan) == "admin"


def add_allowed_email(email, role="user"):
    email = _normalize(email)
    if not email or "@" not in email:
        raise ValueError("A valid email address is required.")
    if role not in ROLES:
        role = "user"
    data = load_allowed_emails()
    if any(e["email"] == email for e in data.get("emails", [])):
        raise ValueError("That email is already allowed.")
    data.setdefault("emails", []).append({
        "email": email,
        "role": role,
        "added_at": int(time.time()),
    })
    save_allowed_emails(data)


def remove_allowed_email(email):
    email = _normalize(email)
    data = load_allowed_emails()
    entries = data.get("emails", [])
    if len(entries) <= 1:
        raise ValueError("Can't remove the last remaining email.")
    target = next((e for e in entries if e["email"] == email), None)
    if target is None:
        raise ValueError("Email not found.")
    if target["role"] == "admin" and _count_admins(entries) <= 1:
        raise ValueError("Can't remove the last remaining admin.")
    data["emails"] = [e for e in entries if e is not target]
    save_allowed_emails(data)


def _count_admins(entries):
    return sum(1 for e in entries if e.get("role") == "admin")


def set_role(email, role):
    if role not in ROLES:
        raise ValueError("Role must be 'admin' or 'user'.")
    email = _normalize(email)
    data = load_allowed_emails()
    entries = data.get("emails", [])
    target = next((e for e in entries if e["email"] == email), None)
    if target is None:
        raise ValueError("Email not found.")
    if target["role"] == "admin" and role != "admin" and _count_admins(entries) <= 1:
        raise ValueError("Can't demote the last remaining admin.")
    target["role"] = role
    save_allowed_emails(data)


def list_allowed_emails():
    return [
        {"email": e["email"], "role": e.get("role", "user"), "added_at": e["added_at"]}
        for e in load_allowed_emails().get("emails", [])
    ]


def get_or_create_secret_key():
    """Persist a Flask session signing key so logins survive app restarts/redeploys."""
    if os.path.exists(SECRET_KEY_PATH):
        with open(SECRET_KEY_PATH, "r", encoding="utf-8") as f:
            key = f.read().strip()
            if key:
                return key
    key = secrets.token_hex(32)
    with open(SECRET_KEY_PATH, "w", encoding="utf-8") as f:
        f.write(key)
    return key
