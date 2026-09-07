from auditlayer_worker.observability import (
    WORKER_SENTRY_OPERATIONS,
    capture_worker_failure,
    init_sentry,
    log_event,
    scrub_sentry_event,
)


def test_reconnect_state_transition_has_a_distinct_safe_sentry_operation() -> None:
    assert "connection_state_transition" in WORKER_SENTRY_OPERATIONS


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


def test_scrubber_retains_only_http_urls_and_allowlisted_application_sources() -> None:
    canary = "PRIVATE_LOCAL_PATH_CANARY"
    locations = [
        f"https://user:password@example.com/static/app.py?token={canary}#private",
        f"auditlayer_worker/pipeline.py?token={canary}#private",
        f"/opt/auditlayer/customer/{canary}/app.py",
        f"~/{canary}/app.py",
        f"C:\\Users\\customer\\{canary}\\app.py",
        f"\\\\server\\customer\\{canary}\\app.py",
        f"../../customer/{canary}/app.py",
        f"site-packages/customer-{canary}/module.py",
        f"customers/{canary}/app.py",
        f"//customer-host/{canary}/app.py",
        f"data:text/plain,{canary}",
        f"blob:https://example.com/{canary}",
        f"file:///home/customer/{canary}/app.py",
        f"javascript:{canary}",
        f"custom-scheme:{canary}",
    ]
    scrubbed = scrub_sentry_event(
        {
            "exception": {
                "values": [
                    {
                        "type": "RuntimeError",
                        "stacktrace": {
                            "frames": [{"filename": location} for location in locations]
                        },
                    }
                ]
            }
        },
        {},
    )

    frames = scrubbed["exception"]["values"][0]["stacktrace"]["frames"]
    assert frames == [
        {"filename": "https://example.com/static/app.py"},
        {"filename": "auditlayer_worker/pipeline.py"},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
        {},
    ]
    assert canary not in __import__("json").dumps(scrubbed)
    assert "user:password" not in __import__("json").dumps(scrubbed)


def test_error_log_sentry_grouping_is_bounded_to_allowlisted_diagnostics(
    monkeypatch, capsys
) -> None:
    captured: list[dict[str, object]] = []
    tags: dict[str, str] = {}

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
        def capture_message(message: str, *, level: str) -> None:
            captured.append(
                scrub_sentry_event(
                    {"message": message, "level": level, "tags": dict(tags)},
                    {},
                )
            )

    monkeypatch.setitem(__import__("sys").modules, "sentry_sdk", FakeSentry)
    log_event(
        "audit_finalization_failed",
        level="error",
        error_type="RuntimeError",
        creator_handle="private_creator",
        access_token="secret",
        arbitrary_message="customer report failed",
    )
    output = capsys.readouterr().out
    assert captured == [
        {
            "level": "error",
            "tags": {
                "service": "auditlayer-worker",
                "surface": "audit_finalization",
                "operation": "audit_finalization_failed",
                "error_class": "RuntimeError",
                "status": "failed",
            },
            "fingerprint": [
                "{{ default }}",
                "auditlayer-worker",
                "audit_finalization",
                "audit_finalization_failed",
                "RuntimeError",
            ],
        }
    ]
    assert scope.fingerprint == captured[0]["fingerprint"]
    assert "customer report failed" not in str(captured)
    assert "private_creator" not in output
    assert "secret" not in output
    assert "[Filtered]" in output


def test_error_log_rejects_unknown_events_and_unapproved_error_classes(
    monkeypatch, capsys
) -> None:
    captured: list[dict[str, object]] = []
    current_tags: dict[str, str] = {}

    class Scope:
        fingerprint: list[str] = []

        def set_tag(self, key: str, value: str) -> None:
            current_tags[key] = value

    class ScopeContext:
        def __enter__(self):
            current_tags.clear()
            return Scope()

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
        def capture_message(message: str, *, level: str) -> None:
            captured.append(
                scrub_sentry_event(
                    {"message": message, "level": level, "tags": dict(current_tags)},
                    {},
                )
            )

    monkeypatch.setitem(__import__("sys").modules, "sentry_sdk", FakeSentry)
    cases = [
        (
            "audit_finalization_outcome_unknown",
            "audit_finalization",
            "AuditFinalizationOutcomeUnknown",
        ),
        ("audit_finalization_failed", "audit_finalization", "AuditFinalizationError"),
        ("worker_loop_failed", "worker_runtime", "WorkerLoopError"),
        ("refinement_failed", "report_projection", "RefinementError"),
    ]
    for event, _surface, _error_class in cases:
        log_event(event, level="error", error_type="PRIVATE_CUSTOMER_CANARY")
    log_event(
        "PRIVATE_CUSTOMER_EVENT",
        level="error",
        error_type="RuntimeError",
        creator_handle="private_creator",
    )
    capsys.readouterr()

    assert [event["tags"] for event in captured] == [
        {
            "service": "auditlayer-worker",
            "surface": surface,
            "operation": operation,
            "error_class": error_class,
            "status": "failed",
        }
        for operation, surface, error_class in cases
    ]
    assert "PRIVATE_CUSTOMER_CANARY" not in str(captured)
    assert "PRIVATE_CUSTOMER_EVENT" not in str(captured)


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
