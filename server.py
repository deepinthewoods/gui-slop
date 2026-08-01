#!/usr/bin/env python3
import base64
import json
import mimetypes
import os
import re
import shutil
import subprocess
import tempfile
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path


MAX_UPLOAD_BYTES = 24 * 1024 * 1024
ANSI_RE = re.compile(r"\x1b\[[0-9;]*m")
APP_ROOT = Path(__file__).resolve().parent

PRESETS = {
    "fastAverage": ["inpaint[0]", "[1],0,1"],
    "fastMedian": ["inpaint[0]", "[1],0,3"],
    "patchSmall": ["inpaint[0]", "[1],5,15,0.5,1,3,0"],
    "patchStrong": ["inpaint[0]", "[1],7,24,0.5,1,7,0"],
    "matchPatch": ["inpaint_matchpatch[0]", "[1],0,7,8,4,1,0"],
    "pdeSmooth": ["inpaint_pde[0]", "[1],75%,1,20"],
    "morphological": ["inpaint_morpho[0]", "[1]"],
}


def json_bytes(payload):
    return json.dumps(payload).encode("utf-8")


def decode_png_data_url(value):
    if not isinstance(value, str) or "," not in value:
        raise ValueError("Expected a PNG data URL.")
    header, data = value.split(",", 1)
    if "image/png" not in header or "base64" not in header:
        raise ValueError("Expected a base64 PNG data URL.")
    raw = base64.b64decode(data, validate=True)
    if len(raw) > MAX_UPLOAD_BYTES:
        raise ValueError("PNG payload is too large.")
    return raw


def gmic_version(gmic_path):
    try:
        completed = subprocess.run(
            [gmic_path, "-v", "-1", "-version"],
            check=False,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True,
            timeout=5,
        )
    except Exception as exc:
        return str(exc)
    return ANSI_RE.sub("", completed.stdout).strip()


class Handler(SimpleHTTPRequestHandler):
    server_version = "FramePatchLab/1.0"

    def end_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        # Never let the browser serve a stale app.js / styles.css from cache.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def send_json(self, code, payload):
        body = json_bytes(payload)
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/api/images":
            images = sorted(
                entry.name
                for entry in APP_ROOT.iterdir()
                if entry.is_file() and entry.suffix.lower() == ".png"
            )
            self.send_json(200, {"images": images})
            return
        if self.path == "/api/gmic/status":
            gmic_path = shutil.which("gmic")
            self.send_json(200, {
                "available": bool(gmic_path),
                "path": gmic_path,
                "version": gmic_version(gmic_path) if gmic_path else None,
                "presets": list(PRESETS.keys()),
            })
            return
        super().do_GET()

    def do_POST(self):
        if self.path != "/api/gmic/inpaint":
            self.send_error(404)
            return

        gmic_path = shutil.which("gmic")
        if not gmic_path:
            self.send_json(503, {"error": "Could not find the gmic executable in PATH."})
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_UPLOAD_BYTES * 2:
                raise ValueError("Request body is empty or too large.")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            preset = payload.get("preset")
            if preset not in PRESETS:
                raise ValueError("Unknown GMIC preset.")
            image = decode_png_data_url(payload.get("image"))
            mask = decode_png_data_url(payload.get("mask"))
        except Exception as exc:
            self.send_json(400, {"error": str(exc)})
            return

        with tempfile.TemporaryDirectory(prefix="frame_patch_gmic_") as tmp:
            input_path = os.path.join(tmp, "input.png")
            mask_path = os.path.join(tmp, "mask.png")
            output_path = os.path.join(tmp, "output.png")
            with open(input_path, "wb") as handle:
                handle.write(image)
            with open(mask_path, "wb") as handle:
                handle.write(mask)

            command = [
                gmic_path,
                "-v",
                "-1",
                input_path,
                mask_path,
                *PRESETS[preset],
                "remove[1]",
                "output[0]",
                output_path,
            ]
            try:
                completed = subprocess.run(
                    command,
                    check=False,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    timeout=120,
                )
            except subprocess.TimeoutExpired:
                self.send_json(504, {"error": "GMIC timed out while processing this slice."})
                return

            if completed.returncode != 0 or not os.path.exists(output_path):
                self.send_json(500, {
                    "error": "GMIC failed for this preset.",
                    "details": completed.stdout[-4000:],
                })
                return

            with open(output_path, "rb") as handle:
                encoded = base64.b64encode(handle.read()).decode("ascii")
            self.send_json(200, {"image": f"data:image/png;base64,{encoded}"})


def main():
    mimetypes.add_type("application/javascript", ".js")
    port = int(os.environ.get("PORT", "8765"))
    server = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Frame Patch Lab running at http://127.0.0.1:{port}/")
    print("Press Ctrl+C to stop.")
    server.serve_forever()


if __name__ == "__main__":
    main()
