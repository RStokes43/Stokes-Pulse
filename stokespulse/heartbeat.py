import urllib.request

from . import config


def ping():
    cfg = config.load_alerting()
    url = cfg.get("heartbeat_url")
    if not url:
        return
    try:
        urllib.request.urlopen(url, timeout=10).read()
    except Exception as exc:
        print(f"[heartbeat] failed to ping {url}: {exc}")
