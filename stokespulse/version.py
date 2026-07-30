import subprocess

from .config import BASE_DIR


def get_version():
    try:
        result = subprocess.run(
            ["git", "rev-list", "--count", "HEAD"],
            cwd=BASE_DIR, capture_output=True, text=True, timeout=5,
        )
        if result.returncode == 0:
            return result.stdout.strip()
    except Exception:
        pass
    return "0"


def get_changelog(limit=50):
    try:
        result = subprocess.run(
            ["git", "log", f"-n{limit}", "--pretty=format:%h|%ad|%s", "--date=short"],
            cwd=BASE_DIR, capture_output=True, text=True, timeout=5,
        )
    except Exception:
        return []
    if result.returncode != 0:
        return []
    commits = []
    for line in result.stdout.splitlines():
        parts = line.split("|", 2)
        if len(parts) == 3:
            commits.append({"hash": parts[0], "date": parts[1], "message": parts[2]})
    return commits
