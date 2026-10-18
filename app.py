"""Placeholder service for Amazon_Devices_RingSection.

Serves two endpoints so the container is verifiable:

    GET /health  -> 200 {"status": "ok"}
    GET /        -> 200 a short description

This is intentionally tiny. It exists so that a merge to main produces a
runnable, health-checkable image on Docker Hub, proving the CI/CD pipeline
works. Replace it with the real Ring service when that code lands.

Run locally:
    python app.py
Then:
    curl http://localhost:8080/health
"""

from __future__ import annotations

import json
import os
from http.server import BaseHTTPRequestHandler, HTTPServer

PORT = int(os.environ.get("PORT", "8080"))

DESCRIPTION = {
    "name": "Amazon_Devices_RingSection",
    "description": (
        "Amazon Ring API hackathon project. Placeholder service - "
        "the real application will replace this."
    ),
    "endpoints": ["/", "/health"],
}


class Handler(BaseHTTPRequestHandler):
    def _send(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:  # noqa: N802 - name required by BaseHTTPRequestHandler
        if self.path.rstrip("/") == "/health":
            self._send(200, {"status": "ok"})
        elif self.path.rstrip("/") in ("", "/"):
            self._send(200, DESCRIPTION)
        else:
            self._send(404, {"error": "not found", "path": self.path})

    def log_message(self, fmt: str, *args) -> None:
        # Default logging writes to stderr, which is what we want in Docker.
        print(f"[http] {fmt % args}", flush=True)


def main() -> None:
    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"listening on 0.0.0.0:{PORT}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
