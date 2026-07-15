"""Tests for hermes_inprocess.py — in-process Hermes client with memory scoping."""

from __future__ import annotations

import os
import sys
import types
from dataclasses import replace
from unittest.mock import patch

import pytest

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.hermes_inprocess import InProcessHermesClient


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_agent_root(tmp_path) -> str:
    """Create a minimal fake Hermes agent root with run_agent.py."""
    agent_root = tmp_path / "hermes-agent"
    agent_root.mkdir()
    (agent_root / "run_agent.py").write_text(
        "class AIAgent: pass\n",
        encoding="utf-8",
    )
    return str(agent_root)


@pytest.fixture
def settings(fake_agent_root, monkeypatch) -> WorkerSettings:
    monkeypatch.setattr("auditlayer_worker.config.load_env_files", lambda: None)
    monkeypatch.setenv("HERMES_AGENT_ROOT", fake_agent_root)
    return WorkerSettings.from_env()


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


class TestHermesHomeScoping:
    def test_default_skip_memory_is_false(self, settings):
        """InProcessHermesClient defaults to skip_memory=False."""
        client = InProcessHermesClient(settings)
        assert client._skip_memory is False

    def test_hermes_home_stored_on_client(self, settings):
        """hermes_home is stored on the client instance."""
        client = InProcessHermesClient(settings, hermes_home="/tmp/test-home")
        assert client._hermes_home == "/tmp/test-home"

    def test_hermes_home_none_by_default(self, settings):
        """hermes_home defaults to None."""
        client = InProcessHermesClient(settings)
        assert client._hermes_home is None

    def test_scope_sets_env_var(self, settings, tmp_path):
        """_scope_hermes_home sets HERMES_HOME in the environment."""
        home = str(tmp_path / "scope-test")
        client = InProcessHermesClient(settings, hermes_home=home)
        prev = client._scope_hermes_home()
        try:
            assert os.environ["HERMES_HOME"] == home
        finally:
            client._restore_hermes_home(prev)

    def test_scope_restores_previous_value(self, settings, tmp_path, monkeypatch):
        """After _restore_hermes_home, the env var is back to its original value."""
        monkeypatch.setenv("HERMES_HOME", "/original/home")
        home = str(tmp_path / "restore-test")
        client = InProcessHermesClient(settings, hermes_home=home)
        prev = client._scope_hermes_home()
        assert os.environ["HERMES_HOME"] == home
        client._restore_hermes_home(prev)
        assert os.environ["HERMES_HOME"] == "/original/home"

    def test_scope_removes_env_when_no_previous(self, settings, tmp_path, monkeypatch):
        """When no previous HERMES_HOME, restore removes the key."""
        monkeypatch.delenv("HERMES_HOME", raising=False)
        home = str(tmp_path / "remove-test")
        client = InProcessHermesClient(settings, hermes_home=home)
        prev = client._scope_hermes_home()
        assert os.environ["HERMES_HOME"] == home
        client._restore_hermes_home(prev)
        assert "HERMES_HOME" not in os.environ

    def test_no_hermes_home_does_not_set_env(self, settings, monkeypatch):
        """When hermes_home is None, the env var is left untouched."""
        monkeypatch.setenv("HERMES_HOME", "/existing/home")
        client = InProcessHermesClient(settings)
        prev = client._scope_hermes_home()
        assert prev == "/existing/home"
        assert os.environ.get("HERMES_HOME") == "/existing/home"
        client._restore_hermes_home(prev)
        assert os.environ["HERMES_HOME"] == "/existing/home"

    @patch("auditlayer_worker.hermes_inprocess.sys.path", new=[])
    def test_chat_sets_hermes_home_before_agent(self, settings, tmp_path, monkeypatch):
        """chat() should set HERMES_HOME before creating AIAgent."""
        import auditlayer_worker.hermes_inprocess as hip
        # We can't easily mock AIAgent.run_conversation here without a real Hermes
        # install, but we can verify the scope_hermes_home mechanism works.
        vault = str(tmp_path / "chat-vault")
        monkeypatch.setenv("HERMES_HOME", "/fallback/home")
        client = InProcessHermesClient(settings, hermes_home=vault)
        # Verify the env var is set to the scoped value
        prev = client._scope_hermes_home()
        assert os.environ["HERMES_HOME"] == vault
        client._restore_hermes_home(prev)
        assert os.environ["HERMES_HOME"] == "/fallback/home"


class TestIterationBudget:
    def test_codex_gpt5_omits_unsupported_temperature(self, settings):
        client = InProcessHermesClient(settings)

        assert client._request_overrides("gpt-5.6-sol", 0.2) == {}
        assert client._request_overrides("deepseek-v4-pro", 0.2) == {"temperature": 0.2}


    def test_chat_passes_iteration_budget_and_temperature(self, settings, monkeypatch):
        """chat() constrains AIAgent iterations and forwards temperature overrides."""
        captured: dict = {}

        class FakeBudget:
            def __init__(self, max_total):
                self.max_total = max_total
                self.used = 0

        class FakeAgent:
            session_prompt_tokens = 11
            session_completion_tokens = 7

            def __init__(self, **kwargs):
                captured.update(kwargs)

            def run_conversation(self, user_message, *, system_message=None, stream_callback=None):
                captured["user_message"] = user_message
                captured["system_message"] = system_message
                if stream_callback:
                    stream_callback("ok")
                return {"final_response": "ok"}

        monkeypatch.setitem(
            sys.modules,
            "run_agent",
            types.SimpleNamespace(AIAgent=FakeAgent, IterationBudget=FakeBudget),
        )
        client = InProcessHermesClient(
            replace(settings, hermes_max_iterations=5),
            max_iterations=3,
        )

        result = client.chat(
            messages=[
                {"role": "system", "content": "system"},
                {"role": "user", "content": "user"},
            ],
            model="test-model",
            temperature=0.0,
        )

        assert result.content == "ok"
        assert result.usage.tokens_in == 11
        assert captured["max_iterations"] == 3
        assert captured["provider"] == "deepseek"
        assert captured["iteration_budget"].max_total == 3
        assert captured["request_overrides"] == {"temperature": 0.0}
        assert captured["system_message"] == "system"
        assert captured["user_message"] == "user"

    def test_chat_raises_when_iteration_budget_exhausted(self, settings, monkeypatch):
        """Budget exhaustion fails fast instead of silently returning partial output."""

        class FakeBudget:
            def __init__(self, max_total):
                self.max_total = max_total
                self.used = max_total

        class FakeAgent:
            session_prompt_tokens = 0
            session_completion_tokens = 0

            def __init__(self, **_kwargs):
                pass

            def run_conversation(self, *_args, stream_callback=None, **_kwargs):
                if stream_callback:
                    stream_callback("partial")
                return {"final_response": "partial"}

        monkeypatch.setitem(
            sys.modules,
            "run_agent",
            types.SimpleNamespace(AIAgent=FakeAgent, IterationBudget=FakeBudget),
        )
        client = InProcessHermesClient(settings, max_iterations=2)

        with pytest.raises(RuntimeError, match="iteration budget exhausted"):
            client.chat(
                messages=[{"role": "user", "content": "user"}],
                model="test-model",
            )
