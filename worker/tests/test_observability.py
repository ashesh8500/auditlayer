from auditlayer_worker.observability import (
    capture_worker_failure,
    init_sentry,
    log_event,
    scrub_sentry_event,
)


def test_scrub_sentry_event_removes_private_creator_and_secret_data() -> None:
    event = {
        "environment": "production",
        "release": "3548ec4004fe6796d479108c53683077834dc863",
        "level": "error",
        "tags": {
            "service": "auditlayer-worker",
            "surface": "instagram_graph",
            "operation": "metrics_fetch",
            "error_class": "InstagramTransientError",
            "status": "retrying",
            "handle": "private_creator",
        },
        "user": {"id": "user-id", "email": "person@example.com"},
        "request": {
            "url": "https://auditlayermedia.com/report?token=secret",
            "headers": {"authorization": "Bearer secret", "user-agent": "worker"},
            "data": {"report_html": "private"},
        },
        "message": "failed for private_creator",
        "exception": {
            "values": [
                {
                    "type": "RuntimeError",
                    "value": "private report failed",
                    "stacktrace": {
                        "frames": [
                            {
                                "filename": "auditlayer_worker/pipeline.py",
                                "function": "run",
                                "lineno": 444,
                                "in_app": True,
                                "vars": {"creator": "private_creator"},
                                "context_line": "raise RuntimeError(private_report)",
                            }
                        ]
                    },
                }
            ]
        },
        "breadcrumbs": [{"message": "private_creator"}],

        "extra": {
            "access_token": "ig-secret",
            "creator_handle": "private_creator",
            "safe_counter": 3,
        },
        "arbitrary": "must not survive",
    }
    scrubbed = scrub_sentry_event(event, {})
    assert scrubbed == {
        "environment": "production",
        "release": "3548ec4004fe6796d479108c53683077834dc863",
        "level": "error",
        "tags": {
            "service": "auditlayer-worker",
            "surface": "instagram_graph",
            "operation": "metrics_fetch",
            "error_class": "InstagramTransientError",
            "status": "retrying",
        },
        "fingerprint": [
            "{{ default }}",
            "auditlayer-worker",
            "instagram_graph",
            "metrics_fetch",
            "InstagramTransientError",
        ],
        "exception": {
            "values": [
                {
                    "type": "RuntimeError",
                    "value": "[Filtered]",
                    "stacktrace": {
                        "frames": [
                            {
                                "filename": "auditlayer_worker/pipeline.py",
                                "function": "run",
                                "lineno": 444,
                                "in_app": True,
                            }
                        ]
                    },
                }
            ]
        },
    }


def test_scrubber_drops_malformed_source_url_with_embedded_credentials() -> None:
    scrubbed = scrub_sentry_event(
        {
            "exception": {
                "values": [
                    {
                        "type": "RuntimeError",
                        "stacktrace": {
                            "frames": [
                                {
                                    "abs_path": "https://user:password@example.com:bad/app.py?token=secret",
                                    "function": "run",
                                }
                            ]
                        },
                    }
                ]
            }
        },
        {},
    )

    assert "user:password" not in str(scrubbed)
    assert "abs_path" not in scrubbed["exception"]["values"][0]["stacktrace"]["frames"][0]


def test_scrubber_drops_data_and_blob_frame_locations_with_private_canary() -> None:
    canary = "CANARY_PRIVATE_TOKEN_123"
    scrubbed = scrub_sentry_event(
        {
            "exception": {
                "values": [
                    {
                        "type": "RuntimeError",
                        "stacktrace": {
                            "frames": [
                                {"filename": f"data:text/plain,{canary}"},
                                {"abs_path": f"blob:https://example.com/{canary}"},
                            ]
                        },
                    }
                ]
            }
        },
        {},
    )

    serialized = __import__("json").dumps(scrubbed)
    assert canary not in serialized
    frames = scrubbed["exception"]["values"][0]["stacktrace"]["frames"]
    assert frames == [{}, {}]


def test_error_log_captures_only_controlled_event_name(monkeypatch, capsys) -> None:
    captured: list[tuple[str, str]] = []

    class FakeSentry:
        @staticmethod
        def is_initialized() -> bool:
            return True

        @staticmethod
        def capture_message(message: str, *, level: str) -> None:
            captured.append((message, level))

    monkeypatch.setitem(__import__("sys").modules, "sentry_sdk", FakeSentry)
    log_event(
        "audit_finalization_failed",
        level="error",
        creator_handle="private_creator",
        access_token="secret",
    )
    output = capsys.readouterr().out
    assert captured == [("audit_finalization_failed", "error")]
    assert "private_creator" not in output
    assert "secret" not in output
    assert "[Filtered]" in output


def test_capture_worker_failure_uses_only_safe_grouping_dimensions(monkeypatch) -> None:
    tags: dict[str, str] = {}
    captured: list[BaseException] = []

    class Scope:
        fingerprint: list[str] = []

        def set_tag(self, key: str, value: str) -> None:
            tags[key] = value

    scope = Scope()

    class ScopeContext:
        def __enter__(self):
            return scope

        def __exit__(self, *_args):
            return False

    class FakeSentry:
        @staticmethod
        def is_initialized() -> bool:
            return True

        @staticmethod
        def isolation_scope() -> ScopeContext:
            return ScopeContext()

        @staticmethod
        def capture_exception(error: BaseException) -> None:
            captured.append(error)

    monkeypatch.setitem(__import__("sys").modules, "sentry_sdk", FakeSentry)
    error = RuntimeError("private creator and token must be scrubbed")

    assert capture_worker_failure(
        error,
        surface="instagram_graph",
        operation="metrics_fetch",
        status="retrying",
    )
    assert tags == {
        "service": "auditlayer-worker",
        "surface": "instagram_graph",
        "operation": "metrics_fetch",
        "error_class": "RuntimeError",
        "status": "retrying",
    }
    assert scope.fingerprint == [
        "{{ default }}",
        "auditlayer-worker",
        "instagram_graph",
        "metrics_fetch",
        "RuntimeError",
    ]
    assert captured == [error]


def test_init_sentry_requires_exact_release_and_disables_context_collection(monkeypatch) -> None:
    initialized: list[dict[str, object]] = []
    tags: dict[str, str] = {}

    class FakeSentry:
        @staticmethod
        def init(**options) -> None:
            initialized.append(options)

        @staticmethod
        def set_tag(key: str, value: str) -> None:
            tags[key] = value

    monkeypatch.setitem(__import__("sys").modules, "sentry_sdk", FakeSentry)
    monkeypatch.setenv("SENTRY_DSN", "https://public@example.ingest.sentry.io/1")
    monkeypatch.setenv("SENTRY_ENVIRONMENT", "production")
    monkeypatch.setenv("SENTRY_RELEASE", "3548ec4004fe6796d479108c53683077834dc863")

    assert init_sentry()
    assert len(initialized) == 1
    options = initialized[0]
    assert options["environment"] == "production"
    assert options["release"] == "3548ec4004fe6796d479108c53683077834dc863"
    assert options["send_default_pii"] is False
    assert options["traces_sample_rate"] == 0.0
    assert options["max_breadcrumbs"] == 0
    assert options["max_request_body_size"] == "never"
    assert options["include_local_variables"] is False
    assert options["include_source_context"] is False
    assert "initial_scope" not in options
    assert tags == {
        "service": "auditlayer-worker",
        "surface": "worker_runtime",
        "operation": "worker_loop",
        "error_class": "Error",
        "status": "failed",
    }

    initialized.clear()
    monkeypatch.delenv("SENTRY_RELEASE")
    assert not init_sentry()
    assert initialized == []


def test_init_sentry_failure_never_interrupts_worker_startup(monkeypatch) -> None:
    class FakeSentry:
        @staticmethod
        def init(**_options) -> None:
            raise ValueError("invalid private DSN")

    monkeypatch.setitem(__import__("sys").modules, "sentry_sdk", FakeSentry)
    monkeypatch.setenv("SENTRY_DSN", "not-a-valid-dsn")
    monkeypatch.setenv("SENTRY_RELEASE", "3548ec4004fe6796d479108c53683077834dc863")

    assert not init_sentry()


def test_structured_log_scrubs_user_ids_api_keys_and_tracebacks(capsys) -> None:
    log_event(
        "worker_failed",
        user_id="private-user",
        api_key="private-key",
        deepseek_api_key="provider-key",
        traceback_tail="trace with creator data",
        safe_counter=2,
    )
    output = capsys.readouterr().out
    assert "private-user" not in output
    assert "private-key" not in output
    assert "provider-key" not in output
    assert "creator data" not in output
    assert '"safe_counter": 2' in output
