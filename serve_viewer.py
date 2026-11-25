#!/usr/bin/env python3
"""Serve docs/ locally with CTS-style passage URL rewrites."""

import argparse
import re
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import quote, unquote, urlsplit


LATIN_QUOTES = Path("/Users/gcrane/github/idi-latin/docs/quotes")


class ViewerHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        pathname = unquote(urlsplit(path).path)
        if pathname == "/latin-data" or pathname.startswith("/latin-data/"):
            relative = Path(pathname[len("/latin-data/") :].lstrip("/"))
            if ".." not in relative.parts:
                return str(LATIN_QUOTES / relative)
        return super().translate_path(path)

    def _redirect_passage(self):
        pathname = urlsplit(self.path).path
        cts_route = re.match(
            r"^(.*?/quotes/)urn:cts:(?:greekLit|latinLit):((?:tlg|phi|stoa)\d+)\.((?:tlg|phi|stoa)\d+)(?:\.[^:&/]+)?:([^&/]+)(?:&(.*))?$",
            pathname,
        )
        short_route = re.match(
            r"^(.*?/quotes/((?:tlg|phi|stoa)\d+)/)((?:tlg|phi|stoa)\d+)\.([^&/]+)(?:&(.*))?$",
            pathname,
        )
        if cts_route:
            prefix, author, work, passage, query = cts_route.groups()
            directory = f"{prefix}{author}/{work}/"
        elif short_route:
            directory, author, work, passage, query = short_route.groups()
        else:
            return False

        if cts_route or short_route:
            passage_key = "section" if author == "tlg0086" and work == "tlg034" else "line"
            fragment = f"{passage_key}={quote(passage)}"
            if query:
                fragment += f"&{query}"
            self.send_response(302)
            self.send_header("Location", f"{directory}?v=cts-urn#{fragment}")
            self.end_headers()
            return True

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
