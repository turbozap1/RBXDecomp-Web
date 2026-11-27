import argparse
import functools
import os
from pathlib import Path
import subprocess
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {
        **SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".wasm": "application/wasm",
    }

    def send_head(self):
        for header in ("If-Modified-Since", "If-None-Match"):
            if header in self.headers:
                del self.headers[header]
        return super().send_head()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        super().end_headers()


def main():
    parser = argparse.ArgumentParser(description="Serve the compiled browser runtime with explicit JavaScript and WebAssembly MIME types.")
    parser.add_argument("--directory", default=str(ROOT / "build-web" / "web"))
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--game-server", action="store_true", help="Also run the included local engine game server (requires npm install --prefix web)")
    parser.add_argument("--game-port", type=int, default=53640)
    args = parser.parse_args()
    handler = functools.partial(Handler, directory=args.directory)
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        game = None
        try:
            if args.game_server:
                environment = os.environ.copy()
                environment["NODE_PATH"] = os.pathsep.join(filter(None, [str(ROOT / "web" / "node_modules"), environment.get("NODE_PATH")]))
                startup = None
                if os.name == "nt":
                    startup = subprocess.STARTUPINFO()
                    startup.dwFlags |= subprocess.STARTF_USESHOWWINDOW
                    startup.wShowWindow = subprocess.SW_HIDE
                game = subprocess.Popen(["node", str(ROOT / "web" / "server-runtime.mjs"), str(args.game_port)], env=environment, stdin=subprocess.DEVNULL, startupinfo=startup)
            print(f"Browser engine: http://{args.bind}:{args.port}", flush=True)
            server.serve_forever()
        except KeyboardInterrupt:
            pass
        finally:
            if game is not None:
                game.terminate()
                try:
                    game.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    game.kill()
                    game.wait()


if __name__ == "__main__":
    main()
