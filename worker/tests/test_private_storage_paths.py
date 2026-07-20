from types import SimpleNamespace
from typing import Any, cast

from auditlayer_worker.supabase_client import SupabaseGateway


class _Store:
    def __init__(self) -> None:
        self.uploads: list[dict] = []

    def upload(self, **kwargs):
        self.uploads.append(kwargs)

    def create_signed_url(self, *_args, **_kwargs):  # pragma: no cover - must never run
        raise AssertionError("worker must not mint signed URLs")


class _Storage:
    def __init__(self, store: _Store) -> None:
        self.store = store
        self.bucket: str | None = None

    def from_(self, bucket: str) -> _Store:
        self.bucket = bucket
        return self.store


class _Client:
    def __init__(self, store: _Store) -> None:
        self.storage = _Storage(store)


def _gateway() -> tuple[SupabaseGateway, _Store]:
    store = _Store()
    gateway = object.__new__(SupabaseGateway)
    gateway.client = _Client(store)
    gateway.settings = cast(Any, SimpleNamespace(reports_bucket="reports"))
    return gateway, store


def test_report_upload_returns_private_path_without_signed_url() -> None:
    gateway, store = _gateway()

    path, url = gateway.upload_report("audit-123", "<html></html>")

    assert path.startswith("audit-123/revisions/")
    assert path.endswith(".html")
    assert url == ""
    assert store.uploads[0]["file_options"]["content-type"] == "text/html"
    assert store.uploads[0]["file_options"]["upsert"] == "false"


def test_versioned_report_upload_uses_immutable_revision_path() -> None:
    gateway, store = _gateway()

    path, url = gateway.upload_report("audit-123", "<html></html>", version=2)

    assert path.startswith("audit-123/revisions/")
    assert path.endswith(".html")
    assert url == ""
    assert store.uploads[0]["path"] == path


def test_report_upload_paths_never_collide() -> None:
    gateway, _store = _gateway()

    first, _ = gateway.upload_report("audit-123", "one")
    second, _ = gateway.upload_report("audit-123", "two")

    assert first != second
