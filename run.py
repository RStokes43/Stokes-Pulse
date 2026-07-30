import os

from waitress import serve

from stokespulse import create_app

if __name__ == "__main__":
    app = create_app()
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", 8420))
    print(f"Stokes-Pulse listening on {host}:{port}")
    serve(app, host=host, port=port)
