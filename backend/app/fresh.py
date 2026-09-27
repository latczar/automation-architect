"""Make sure a browser always gets the page from the latest deploy.

The page and its bundle are served as static files, and Starlette labels each
one with an ETag worked out from the file's modified time and size. On Vercel
every deployed file carries the same modified time, 20 October 2018, and the
page is the same size on every deploy, because only the hash in the bundle's
name changes and the hash is always the same length. So every version of the
page had the same ETag. A browser holding yesterday's page asked whether it
had changed, was told it had not, and kept showing yesterday's page: the
reason a deploy could be live and look as though it was not.

The fix is split by what the file is:

  - The page itself is about 3KB. It is always sent whole, with no ETag to
    compare against, and marked no-cache so the browser checks every time.
  - Everything under /assets has a hash of its contents in its name, so a
    name can never point at different contents. Those are cached for a year
    and never checked again, which the old headers were not doing either.

The API is left alone.
"""

from __future__ import annotations

from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

# Request headers that let a server answer "not modified". Dropped for the
# page, because the answer is computed from the ETag that cannot be trusted.
CONDITIONAL = {b"if-none-match", b"if-modified-since"}

IMMUTABLE = "public, max-age=31536000, immutable"


class FreshPages:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["path"].startswith("/api"):
            await self.app(scope, receive, send)
            return

        assets = scope["path"].startswith("/assets/")
        if not assets:
            scope = {
                **scope,
                "headers": [(k, v) for k, v in scope["headers"] if k.lower() not in CONDITIONAL],
            }

        async def send_fresh(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                if assets:
                    if message["status"] == 200:
                        headers["cache-control"] = IMMUTABLE
                elif headers.get("content-type", "").startswith("text/html"):
                    headers["cache-control"] = "no-cache"
                    del headers["etag"]
                    del headers["last-modified"]
            await send(message)

        await self.app(scope, receive, send_fresh)
