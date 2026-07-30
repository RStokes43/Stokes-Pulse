from flask import Flask

from . import db as db_module
from . import prober, port_drift

APP_NAME = "Stokes-Pulse"
ACCENT = "#a855f7"  # purple/violet


def create_app(start_background=True):
    app = Flask(__name__)
    app.config["APP_NAME"] = APP_NAME
    app.config["ACCENT"] = ACCENT

    db_module.init_db()

    from .routes.pages import pages_bp
    from .routes.api import api_bp
    app.register_blueprint(pages_bp)
    app.register_blueprint(api_bp, url_prefix="/api")

    if start_background:
        prober.start_background_loop()
        port_drift.start_background_loop()

    return app
