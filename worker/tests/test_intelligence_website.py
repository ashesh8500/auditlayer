from __future__ import annotations

import socket

import pytest

from auditlayer_worker.intelligence import (
    WebsiteCollectionError,
    WebsiteCollector,
    WebsiteResponse,
)


def _resolver(host: str, _port: int, **_kwargs):
    addresses = {
        "example.com": "93.184.216.34",
        "cdn.example.com": "93.184.216.35",
        "private.example.com": "127.0.0.1",
        "linklocal.example.com": "169.254.1.2",
    }
    return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (addresses[host], 0))]


def test_website_collector_rejects_private_link_local_and_credentialed_targets() -> None:
    collector = WebsiteCollector(fetch=lambda *_args, **_kwargs: None, resolver=_resolver)

    for url in (
        "http://127.0.0.1/admin",
        "http://[::1]/admin",
        "https://private.example.com/admin",
        "https://linklocal.example.com/metadata",
        "https://user:password@example.com/private",
    ):
        with pytest.raises(WebsiteCollectionError, match="blocked target"):
            collector.collect(url)


def test_website_collector_validates_every_redirect_before_fetching_it() -> None:
    fetched: list[str] = []

    def fetch(url: str, **_kwargs) -> WebsiteResponse:
        fetched.append(url)
        return WebsiteResponse(
            status_code=302,
            headers={"location": "http://127.0.0.1/internal"},
            body=b"",
            url=url,
        )

    collector = WebsiteCollector(fetch=fetch, resolver=_resolver)

    with pytest.raises(WebsiteCollectionError, match="blocked target"):
        collector.collect("https://example.com")
    assert fetched == ["https://example.com/"]


def test_website_collector_rejects_oversized_and_non_html_responses() -> None:
    oversized = WebsiteCollector(
        fetch=lambda url, **_kwargs: WebsiteResponse(
            status_code=200,
            headers={"content-type": "text/html"},
            body=b"x" * 33,
            url=url,
        ),
        resolver=_resolver,
        max_bytes=32,
    )
    with pytest.raises(WebsiteCollectionError, match="size limit"):
        oversized.collect("https://example.com")

    binary = WebsiteCollector(
        fetch=lambda url, **_kwargs: WebsiteResponse(
            status_code=200,
            headers={"content-type": "application/octet-stream"},
            body=b"binary",
            url=url,
        ),
        resolver=_resolver,
    )
    with pytest.raises(WebsiteCollectionError, match="content type"):
        binary.collect("https://example.com")


def test_website_collector_has_a_total_deadline_and_bounded_redirects() -> None:
    ticks = iter((0.0, 0.0, 1.1))
    deadline_collector = WebsiteCollector(
        fetch=lambda url, **_kwargs: WebsiteResponse(
            status_code=302,
            headers={"location": "https://cdn.example.com/next"},
            body=b"",
            url=url,
        ),
        resolver=_resolver,
        deadline_seconds=1.0,
        clock=lambda: next(ticks),
    )
    with pytest.raises(WebsiteCollectionError, match="deadline"):
        deadline_collector.collect("https://example.com")

    calls = 0

    def loop(url: str, **_kwargs) -> WebsiteResponse:
        nonlocal calls
        calls += 1
        return WebsiteResponse(302, {"location": "/again"}, b"", url)

    redirect_collector = WebsiteCollector(fetch=loop, resolver=_resolver, max_redirects=2)
    with pytest.raises(WebsiteCollectionError, match="redirect limit"):
        redirect_collector.collect("https://example.com")
    assert calls == 3


def test_website_collector_returns_bounded_normalized_evidence_input() -> None:
    collector = WebsiteCollector(
        fetch=lambda url, **_kwargs: WebsiteResponse(
            200,
            {"content-type": "text/html; charset=utf-8"},
            b"<html>\n  <body>Hello   world</body> </html>",
            url,
        ),
        resolver=_resolver,
        max_text_chars=30,
    )

    result = collector.collect("HTTPS://Example.COM:443")

    assert result == {
        "url": "https://example.com/",
        "content_type": "text/html; charset=utf-8",
        "status_code": 200,
        "text": "<html> <body>Hello world</body",
        "truncated": True,
    }


def test_website_collector_rejects_a_slow_drip_that_finishes_after_deadline() -> None:
    now = [0.0]

    def slow_fetch(url: str, **_kwargs) -> WebsiteResponse:
        now[0] = 1.1
        return WebsiteResponse(200, {"content-type": "text/html"}, b"ok", url)

    collector = WebsiteCollector(
        fetch=slow_fetch,
        resolver=_resolver,
        deadline_seconds=1.0,
        clock=lambda: now[0],
    )
    with pytest.raises(WebsiteCollectionError, match="deadline"):
        collector.collect("https://example.com")


def test_website_collector_does_not_fetch_after_dns_exhausts_deadline() -> None:
    now = [0.0]
    fetched: list[str] = []

    def slow_resolver(host: str, port: int, **kwargs):
        now[0] = 1.1
        return _resolver(host, port, **kwargs)

    def fetch(url: str, **_kwargs) -> WebsiteResponse:
        fetched.append(url)
        return WebsiteResponse(200, {"content-type": "text/html"}, b"ok", url)

    collector = WebsiteCollector(
        fetch=fetch,
        resolver=slow_resolver,
        deadline_seconds=1.0,
        clock=lambda: now[0],
    )

    with pytest.raises(WebsiteCollectionError, match="deadline"):
        collector.collect("https://example.com")
    assert fetched == []


def test_website_collector_rejects_fetcher_target_drift_and_content_encoding() -> None:
    drifted = WebsiteCollector(
        fetch=lambda url, **_kwargs: WebsiteResponse(
            200, {"content-type": "text/html"}, b"ok", "http://127.0.0.1/private"
        ),
        resolver=_resolver,
    )
    with pytest.raises(WebsiteCollectionError, match="target mismatch"):
        drifted.collect("https://example.com")

    compressed = WebsiteCollector(
        fetch=lambda url, **_kwargs: WebsiteResponse(
            200,
            {"content-type": "text/html", "content-encoding": "gzip"},
            b"not-decoded",
            url,
        ),
        resolver=_resolver,
    )
    with pytest.raises(WebsiteCollectionError, match="content encoding"):
        compressed.collect("https://example.com")
