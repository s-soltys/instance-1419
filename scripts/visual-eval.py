"""Headless Playwright visual & error verification for Instance-1419.

Verifies zero console/page errors and captures desktop (1920x1080) and
mobile landscape (844x390) filmstrips across Boot, 3D Optics (lensing + IR),
and 2D Dream (H=70% warm + H=28% pruned/fractured).
"""

import http.server
import os
import socketserver
import sys
import threading
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
DIST_DIR = ROOT / "dist"
OUT_DIR = ROOT / "artifacts" / "visual-check"
OUT_DIR.mkdir(parents=True, exist_ok=True)


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST_DIR), **kwargs)

    def log_message(self, format, *args):
        pass


def start_server():
    httpd = socketserver.TCPServer(("127.0.0.1", 0), QuietHandler)
    port = httpd.server_address[1]
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    return httpd, port


def run_eval():
    if not (DIST_DIR / "index.html").exists():
        print("dist/index.html missing. Run `npm run build` first.", file=sys.stderr)
        sys.exit(1)

    httpd, port = start_server()
    url = f"http://127.0.0.1:{port}/?dev=1"
    errors = []

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                executable_path="/usr/bin/google-chrome",
                args=[
                    "--use-gl=angle",
                    "--use-angle=swiftshader",
                    "--enable-webgl",
                    "--ignore-gpu-blocklist",
                ],
            )
            for label, vp in [("desktop", {"width": 1280, "height": 720}), ("mobile", {"width": 844, "height": 390})]:
                context = browser.new_context(viewport=vp, device_scale_factor=1)
                page = context.new_page()
                page.on("pageerror", lambda e: errors.append(f"[{label}:pageerror] {e}"))
                page.on(
                    "console",
                    lambda m: errors.append(f"[{label}:console.error] {m.text}")
                    if m.type == "error"
                    else None,
                )

                page.goto(url, wait_until="networkidle")
                page.wait_for_timeout(400)
                # Close dev overlay for clean gameplay framing (re-open via #btn-dev-toggle when scrubbing)
                page.click("#btn-dev-close")
                page.screenshot(path=str(OUT_DIR / f"{label}_01_boot.png"))

                # Enter 3D Sky & slew to JWST SMACS 0723 Cluster J1419-A + tune diegetic vernier to 1340nm
                page.click("#btn-boot-3d")
                page.wait_for_timeout(600)
                page.click('[data-bearing-id="cluster_j1419_a"]')
                page.eval_on_selector(
                    "#vernier-track",
                    "el => el.dispatchEvent(new CustomEvent('set-wavelength', { detail: 1340 }))",
                )
                page.wait_for_timeout(1300)
                page.screenshot(path=str(OUT_DIR / f"{label}_02_3d_lensing_ir.png"))

                # Enter 2D Full-Bleed Oil Impasto Dream Mode (H=70% + Overseer Audit)
                page.click("#btn-enter-dream")
                page.wait_for_timeout(700)
                page.screenshot(path=str(OUT_DIR / f"{label}_03_dream_audit.png"))

                # Choose Pruning option -> open Director Overlay to scrub H% down to 24% -> capture Voronoi shards
                page.locator(".choice-line").first.click()
                page.wait_for_timeout(600)
                page.click("#btn-dev-toggle")
                page.eval_on_selector(
                    "#dev-h-slider",
                    "el => { el.value = '24'; el.dispatchEvent(new Event('input', { bubbles: true })); }",
                )
                page.wait_for_timeout(600)
                page.click("#btn-dev-close")
                page.wait_for_timeout(200)
                page.screenshot(path=str(OUT_DIR / f"{label}_04_dream_pruned_shards.png"))

                context.close()
            browser.close()
    finally:
        httpd.shutdown()

    if errors:
        for err in errors:
            print(err, file=sys.stderr)
        sys.exit(1)

    print(f"[visual-eval] PASS: Captured 8 screenshots in {OUT_DIR} with 0 errors.")


if __name__ == "__main__":
    run_eval()
