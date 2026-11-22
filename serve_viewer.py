#!/usr/bin/env python3
"""Serve docs/ locally with CTS-style passage URL rewrites."""

import argparse
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, urlsplit


class ViewerHandler(SimpleHTTPRequestHandler):
    def _redirect_passage(self):
        pathname = urlsplit(self.path).path
        route = re.match(r"^(.*?/quotes/(tlg\d{4})/)(tlg\d+)\.([^&/]+)(?:&(.*))?$", pathname)
        if route:
            prefix, author, work, passage, query = route.groups()
            passage_key = "section" if author == "tlg0086" and work == "tlg034" else "line"
            fragment = f"{passage_key}={quote(passage)}"
            if query:
                fragment += f"&{query}"
            self.send_response(302)
            self.send_header("Location", f"{prefix}{work}/#{fragment}")
            self.end_headers()
            return True
        return False

    def do_GET(self):
        if not self._redirect_passage():
            super().do_GET()

    def do_HEAD(self):
        if not self._redirect_passage():
            super().do_HEAD()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8766)
    args = parser.parse_args()
    docs = Path(__file__).resolve().parent / "docs"
    handler = partial(ViewerHandler, directory=str(docs))
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler)
    print(f"Serving {docs} at http://127.0.0.1:{args.port}")
    server.serve_forever()


if __name__ == "__main__":
    main()
