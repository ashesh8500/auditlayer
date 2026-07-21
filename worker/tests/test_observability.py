from auditlayer_worker.observability import log_event, scrub_sentry_event


def test_scrub_sentry_event_removes_private_creator_and_secret_data() -> None:
    event = {
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
    }
    scrubbed = scrub_sentry_event(event, {})
    assert "user" not in scrubbed
    assert scrubbed["request"]["headers"] == {"user-agent": "worker"}
    assert scrubbed["request"]["data"] == "[Filtered]"
    assert "url" not in scrubbed["request"]
    assert "cookies" not in scrubbed["request"]
    assert "message" not in scrubbed
    assert "breadcrumbs" not in scrubbed
    assert scrubbed["exception"] == {
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
    }
    assert scrubbed["extra"] == {
        "access_token": "[Filtered]",
        "creator_handle": "[Filtered]",
        "safe_counter": 3,
    }


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
    capsys.readouterr()
    assert captured == [("audit_finalization_failed", "error")]
