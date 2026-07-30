from flask import Blueprint, render_template, current_app

pages_bp = Blueprint("pages", __name__)


@pages_bp.route("/")
def index():
    return render_template("index.html", app_name=current_app.config["APP_NAME"],
                            accent=current_app.config["ACCENT"])
