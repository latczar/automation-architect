"""Tests for the headers that keep a deployed page from going stale.

Built on a throwaway front end with the same shape as the real one, because
the real build only exists after `npm run build` and these have to run
without it.
"""

import os

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.fresh import IMMUTABLE, FreshPages

# The date Vercel stamps on every deployed file, which is what made every
# version of the page look identical to a browser.
DEPLOYED = 1540000000


@pytest.fixture
def site(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>today</html>", encoding="utf-8")
    (tmp_path / "assets" / "index-abc123.js").write_text("console.log(1)", encoding="utf-8")
    for file in (tmp_path / "index.html", tmp_path / "assets" / "index-abc123.js"):
        os.utime(file, (DEPLOYED, DEPLOYED))

    app = FastAPI()

    @app.get("/api/health")
    def health() -> dict:
        return {"ok": True}

    app.frontend("/", directory=str(tmp_path), fallback="index.html")
    app.add_middleware(FreshPages)
    return TestClient(app), tmp_path


def test_a_page_the_browser_already_has_is_sent_again_in_full(site):
    """The bug itself: yesterday's ETag, today's page, and a 304 in between."""

    client, root = site
    yesterday = FastAPI()
    yesterday.frontend("/", directory=str(root), fallback="index.html")
    stale_etag = TestClient(yesterday).get("/").headers["etag"]

    # Same size, same stamped date: the ETag Starlette would give today's page
    # is the one the browser is holding for yesterday's.
    (root / "index.html").write_text("<html>newer</html>", encoding="utf-8")
    os.utime(root / "index.html", (DEPLOYED, DEPLOYED))

    response = client.get("/", headers={"If-None-Match": stale_etag})

    assert response.status_code == 200
    assert "newer" in response.text


def test_the_page_says_to_check_every_time_and_gives_nothing_to_compare(site):
    client, _ = site
    response = client.get("/")

    assert response.headers["cache-control"] == "no-cache"
    assert "etag" not in response.headers
    assert "last-modified" not in response.headers


def test_a_shared_link_gets_the_same_fresh_page(site):
    client, _ = site
    response = client.get("/s/abc123", headers={"Accept": "text/html"})

    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-cache"


def test_a_hashed_bundle_is_cached_for_good(site):
    client, _ = site
    response = client.get("/assets/index-abc123.js")

    assert response.status_code == 200
    assert response.headers["cache-control"] == IMMUTABLE


def test_a_missing_bundle_is_not_cached_for_good(site):
    """A 404 remembered for a year would outlive the deploy that fixes it."""

    client, _ = site
    response = client.get("/assets/index-gone.js")

    assert response.status_code == 404
    assert response.headers.get("cache-control") != IMMUTABLE


def test_the_api_is_left_alone(site):
    client, _ = site
    response = client.get("/api/health")

    assert response.json() == {"ok": True}
    assert "cache-control" not in response.headers
