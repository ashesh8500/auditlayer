"""Bounded website collection with fail-closed SSRF controls."""

from __future__ import annotations

from dataclasses import dataclass
import http.client
import ipaddress
import socket
import ssl
import time
from typing import Callable, Mapping, Protocol
from urllib.parse import urljoin, urlsplit, urlunsplit

class WebsiteCollectionError(RuntimeError):
    """A website target or response violated a collection safety boundary."""


@dataclass(frozen=True)
class WebsiteResponse:
    status_code: int
    headers: Mapping[str, str]
    body: bytes
    url: str


class WebsiteFetcher(Protocol):
    def __call__(
        self,
        url: str,
        *,
        timeout_seconds: float,
        max_bytes: int,
        approved_addresses: tuple[str, ...],
    ) -> WebsiteResponse: ...


def _is_public(address: str) -> bool:
    try:
        parsed = ipaddress.ip_address(address.split("%", 1)[0])
    except ValueError:
        return False
    return parsed.is_global


def _canonical_target(url: str) -> str:
    try:
        parsed = urlsplit(url.strip())
        port = parsed.port
    except ValueError as exc:
        raise WebsiteCollectionError("blocked target: malformed URL") from exc
    if parsed.scheme.lower() not in {"http", "https"} or not parsed.hostname:
        raise WebsiteCollectionError("blocked target: only absolute HTTP(S) URLs are allowed")
    if parsed.username or parsed.password:
        raise WebsiteCollectionError("blocked target: URL credentials are forbidden")
    scheme = parsed.scheme.lower()
    if port is not None and (scheme, port) not in {("http", 80), ("https", 443)}:
        raise WebsiteCollectionError("blocked target: non-standard ports are forbidden")
    hostname = parsed.hostname.lower().rstrip(".")
    netloc = hostname
    if ":" in hostname:
        netloc = f"[{hostname}]"
    path = parsed.path or "/"
    return urlunsplit((scheme, netloc, path, parsed.query, ""))


def fetch_website_response(
    url: str,
    *,
    timeout_seconds: float,
    max_bytes: int,
    approved_addresses: tuple[str, ...],
) -> WebsiteResponse:
    """Fetch through a pre-approved IP, eliminating DNS-rebinding TOCTOU."""

    started = time.monotonic()
    deadline = started + timeout_seconds

    def remaining() -> float:
        value = deadline - time.monotonic()
        if value <= 0:
            raise WebsiteCollectionError("website collection deadline exceeded")
        return value

    if not approved_addresses:
        raise WebsiteCollectionError("blocked target: no approved address")
    parsed = urlsplit(url)
    hostname = parsed.hostname or ""
    port = 443 if parsed.scheme == "https" else 80
    address = approved_addresses[0]

    class PinnedHTTPConnection(http.client.HTTPConnection):
        def connect(self) -> None:
            self.sock = socket.create_connection(
                (address, port), remaining(), getattr(self, "source_address", None)
            )

    class PinnedHTTPSConnection(http.client.HTTPSConnection):
        def connect(self) -> None:
            raw = socket.create_connection(
                (address, port), remaining(), getattr(self, "source_address", None)
            )
            self.sock = self._context.wrap_socket(raw, server_hostname=hostname)

    connection: http.client.HTTPConnection
    if parsed.scheme == "https":
        connection = PinnedHTTPSConnection(
            hostname,
            port,
            timeout=timeout_seconds,
            context=ssl.create_default_context(),
        )
    else:
        connection = PinnedHTTPConnection(hostname, port, timeout=timeout_seconds)
    path = urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
    try:
        connection.timeout = remaining()
        connection.request(
            "GET",
            path,
            headers={
                "Host": hostname,
                "Accept": "text/html,application/xhtml+xml,text/plain;q=0.8",
                "User-Agent": "AuditLayerEvidenceCollector/1.0",
                "Connection": "close",
            },
        )
        if connection.sock is not None:
            connection.sock.settimeout(remaining())
        response = connection.getresponse()
        headers = {key.lower(): value for key, value in response.getheaders()}
        declared = headers.get("content-length")
        if declared:
            try:
                if int(declared) > max_bytes:
                    raise WebsiteCollectionError("response exceeds size limit")
            except ValueError:
                pass
        body = bytearray()
        while True:
            if connection.sock is not None:
                connection.sock.settimeout(remaining())
            chunk = response.read(min(64 * 1024, max_bytes + 1 - len(body)))
            if not chunk:
                break
            body.extend(chunk)
            if len(body) > max_bytes:
                raise WebsiteCollectionError("response exceeds size limit")
        return WebsiteResponse(response.status, headers, bytes(body), url)
    finally:
        connection.close()


class WebsiteCollector:
    """Collect one public website page under strict redirect/size/time bounds."""

    def __init__(
        self,
        *,
        fetch: WebsiteFetcher = fetch_website_response,
        resolver: Callable[..., object] = socket.getaddrinfo,
        max_bytes: int = 1_000_000,
        max_text_chars: int = 50_000,
        max_redirects: int = 3,
        deadline_seconds: float = 15.0,
        per_request_timeout_seconds: float = 8.0,
        clock: Callable[[], float] = time.monotonic,
    ) -> None:
        if min(max_bytes, max_text_chars, deadline_seconds, per_request_timeout_seconds) <= 0:
            raise ValueError("website collector bounds must be positive")
        if max_redirects < 0 or max_redirects > 5:
            raise ValueError("max_redirects must be between zero and five")
        self._fetch = fetch
        self._resolver = resolver
        self.max_bytes = max_bytes
        self.max_text_chars = max_text_chars
        self.max_redirects = max_redirects
        self.deadline_seconds = deadline_seconds
        self.per_request_timeout_seconds = per_request_timeout_seconds
        self._clock = clock

    def _validate_target(self, url: str) -> tuple[str, tuple[str, ...]]:
        target = _canonical_target(url)
        parsed = urlsplit(target)
        host = parsed.hostname or ""
        port = 443 if parsed.scheme == "https" else 80
        try:
            literal = ipaddress.ip_address(host.split("%", 1)[0])
        except ValueError:
            literal = None
        if literal is not None:
            addresses = [str(literal)]
        else:
            try:
                records = self._resolver(host, port, type=socket.SOCK_STREAM)
                addresses = [str(record[4][0]) for record in records]  # type: ignore[index]
            except Exception as exc:
                raise WebsiteCollectionError("blocked target: DNS resolution failed") from exc
        if not addresses or any(not _is_public(address) for address in addresses):
            raise WebsiteCollectionError("blocked target: address is not globally routable")
        return target, tuple(addresses)

    def collect(self, url: str) -> dict[str, object]:
        started = self._clock()
        current = url
        redirects = 0
        while True:
            elapsed = self._clock() - started
            if elapsed >= self.deadline_seconds:
                raise WebsiteCollectionError("website collection deadline exceeded")
            target, approved_addresses = self._validate_target(current)
            remaining = self.deadline_seconds - elapsed
            response = self._fetch(
                target,
                timeout_seconds=min(self.per_request_timeout_seconds, remaining),
                max_bytes=self.max_bytes,
                approved_addresses=approved_addresses,
            )
            if self._clock() - started >= self.deadline_seconds:
                raise WebsiteCollectionError("website collection deadline exceeded")
            if len(response.body) > self.max_bytes:
                raise WebsiteCollectionError("response exceeds size limit")
            if response.status_code in {301, 302, 303, 307, 308}:
                location = response.headers.get("location") or response.headers.get("Location")
                if not location:
                    raise WebsiteCollectionError("redirect response has no location")
                if redirects >= self.max_redirects:
                    raise WebsiteCollectionError("website redirect limit exceeded")
                redirects += 1
                # The next loop resolves and validates the redirect before fetch.
                current = urljoin(target, location)
                continue
            if response.status_code < 200 or response.status_code >= 300:
                raise WebsiteCollectionError("website returned a non-success status")
            content_type = str(response.headers.get("content-type") or response.headers.get("Content-Type") or "").lower()
            if not (
                content_type.startswith("text/html")
                or content_type.startswith("application/xhtml+xml")
                or content_type.startswith("text/plain")
            ):
                raise WebsiteCollectionError("website response content type is not allowed")
            encoding = "utf-8"
            if "charset=" in content_type:
                encoding = content_type.partition("charset=")[2].partition(";")[0].strip()
            try:
                raw_text = response.body.decode(encoding, errors="replace")
            except LookupError:
                raw_text = response.body.decode("utf-8", errors="replace")
            normalized = " ".join(raw_text.split())
            return {
                "url": target,
                "content_type": str(response.headers.get("content-type") or response.headers.get("Content-Type") or ""),
                "status_code": response.status_code,
                "text": normalized[: self.max_text_chars],
                "truncated": len(normalized) > self.max_text_chars,
            }
