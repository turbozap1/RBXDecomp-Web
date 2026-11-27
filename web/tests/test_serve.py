import functools
from http.server import ThreadingHTTPServer
from pathlib import Path
import tempfile
import threading
import unittest
from urllib.request import Request, urlopen

from web.serve import Handler


class ServerTests(unittest.TestCase):
    def test_module_mime_types_and_rebuild_caching(self):
        with tempfile.TemporaryDirectory() as directory:
            Path(directory, "module.mjs").write_text("export default 42;", encoding="utf-8")
            Path(directory, "module.wasm").write_bytes(b"\x00asm")
            server = ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=directory))
            thread = threading.Thread(target=server.serve_forever, daemon=True)
            thread.start()
            try:
                for extension, mime in [("mjs", "text/javascript"), ("wasm", "application/wasm")]:
                    url = f"http://127.0.0.1:{server.server_address[1]}/module.{extension}"
                    request = Request(url, headers={"If-Modified-Since": "Wed, 01 Jan 2031 00:00:00 GMT"})
                    with urlopen(request, timeout=3) as response:
                        self.assertEqual(response.status, 200)
                        self.assertEqual(response.headers["Content-Type"], mime)
                        self.assertEqual(response.headers["Cache-Control"], "no-store")
                        self.assertEqual(response.headers["Cross-Origin-Opener-Policy"], "same-origin")
                        self.assertEqual(response.headers["Cross-Origin-Embedder-Policy"], "require-corp")
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
