import os
import secrets
import time

from werkzeug.security import check_password_hash, generate_password_hash

from .config import CONFIG_DIR, _atomic_write_json, _read_json_with_default

USERS_PATH = os.path.join(CONFIG_DIR, "users.json")
SECRET_KEY_PATH = os.path.join(CONFIG_DIR, "secret_key")
DEFAULT_USERS = {"users": []}
ROLES = ("admin", "user")
# Accounts created before roles existed have no "role" key — treat them as
# admin so nobody who already had full access gets silently locked out.
DEFAULT_ROLE_FOR_EXISTING = "admin"


def load_users():
    return _read_json_with_default(USERS_PATH, DEFAULT_USERS)


def save_users(data):
    _atomic_write_json(USERS_PATH, data)
    return data


def has_any_users():
    return bool(load_users().get("users"))


def find_user(username):
    username = (username or "").strip().lower()
    for u in load_users().get("users", []):
        if u["username"].lower() == username:
            return u
    return None


def create_user(username, password, role="user"):
    username = (username or "").strip()
    if not username or not password:
        raise ValueError("Username and password are required.")
    if len(password) < 8:
        raise ValueError("Password must be at least 8 characters.")
    if role not in ROLES:
        role = "user"
    data = load_users()
    if any(u["username"].lower() == username.lower() for u in data.get("users", [])):
        raise ValueError("That username already exists.")
    data.setdefault("users", []).append({
        "username": username,
        "password_hash": generate_password_hash(password),
        "role": role,
        "created_at": int(time.time()),
    })
    save_users(data)


def verify_user(username, password):
    user = find_user(username)
    if not user:
        return False
    return check_password_hash(user["password_hash"], password)


def delete_user(username):
    data = load_users()
    users = data.get("users", [])
    if len(users) <= 1:
        raise ValueError("Can't delete the last remaining user.")
    target = next((u for u in users if u["username"].lower() == (username or "").strip().lower()), None)
    if target is None:
        raise ValueError("User not found.")
    if _role_of(target) == "admin" and _count_admins(users) <= 1:
        raise ValueError("Can't remove the last remaining admin.")
    data["users"] = [u for u in users if u is not target]
    save_users(data)


def _role_of(user_record):
    role = user_record.get("role")
    return role if role in ROLES else DEFAULT_ROLE_FOR_EXISTING


def _count_admins(users):
    return sum(1 for u in users if _role_of(u) == "admin")


def get_role(username):
    user = find_user(username)
    return _role_of(user) if user else None


def is_admin(username):
    return get_role(username) == "admin"


def set_role(username, role):
    if role not in ROLES:
        raise ValueError("Role must be 'admin' or 'user'.")
    data = load_users()
    users = data.get("users", [])
    target = next((u for u in users if u["username"].lower() == (username or "").strip().lower()), None)
    if target is None:
        raise ValueError("User not found.")
    if _role_of(target) == "admin" and role != "admin" and _count_admins(users) <= 1:
        raise ValueError("Can't demote the last remaining admin.")
    target["role"] = role
    save_users(data)


def list_users():
    return [
        {"username": u["username"], "role": _role_of(u), "created_at": u["created_at"]}
        for u in load_users().get("users", [])
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
