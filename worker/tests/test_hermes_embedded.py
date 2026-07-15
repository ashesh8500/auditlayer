"""Tests for hermes_embedded.py — embedded Hermes runtime."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from auditlayer_worker.config import WorkerSettings
from auditlayer_worker.hermes_embedded import (
    BudgetExhausted,
    EmbeddedHermes,
    diagnose_embedded,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def fake_agent_root(tmp_path) -> str:
    """Create a minimal fake Hermes agent root with run_agent.py."""
    agent_root = tmp_path / "hermes-agent"
    agent_root.mkdir()
    (agent_root / "run_agent.py").write_text(
        "class AIAgent: pass\nclass IterationBudget:\n    def __init__(self, max_total):\n        self.max_total = max_total\n        self.used = 0\n",
        encoding="utf-8",
    )
    return str(agent_root)


@pytest.fixture
def settings(fake_agent_root) -> WorkerSettings:
    return WorkerSettings.from_env()


@pytest.fixture
def settings_inprocess(fake_agent_root, monkeypatch) -> WorkerSettings:
    monkeypatch.setattr("auditlayer_worker.config.load_env_files", lambda: None)
    monkeypatch.setenv("HERMES_MODE", "inprocess")
    monkeypatch.setenv("HERMES_AGENT_ROOT", fake_agent_root)
    return WorkerSettings.from_env()


# ---------------------------------------------------------------------------
# diagnose_embedded()
# ---------------------------------------------------------------------------


def test_diagnose_embedded_with_installed_agent() -> None:
    """Should pass when Hermes is installed and skip on clean CI runners."""
    result = diagnose_embedded()
    if not result.agent_root_exists:
        pytest.skip(f"optional Hermes Agent checkout is not installed: {result.error}")
    if not result.ok and "No module named" in result.error:
        pytest.skip(f"optional embedded Hermes dependencies are not installed: {result.error}")
    assert result.ok, f"Expected ok=True with hermes-agent installed; got error={result.error}"
    assert result.aiagent_importable
    assert result.iterationbudget_importable
    assert not result.error


def test_diagnose_embedded_with_fake_agent_root(tmp_path) -> None:
    """A fake run_agent.py should let diagnose pass."""
    agent_root = tmp_path / "hermes-agent"
    agent_root.mkdir()
    (agent_root / "run_agent.py").write_text(
        "class AIAgent: pass\nclass IterationBudget:\n    def __init__(self, max_total):\n        self.max_total = max_total\n        self.used = 0\n",
        encoding="utf-8",
    )

    with patch(
        "auditlayer_worker.hermes_embedded.resolve_agent_root",
        return_value=agent_root,
    ):
        result = diagnose_embedded()

    assert result.ok
    assert result.aiagent_importable
    assert result.iterationbudget_importable


# ---------------------------------------------------------------------------
# EmbeddedHermes instantiation
# ---------------------------------------------------------------------------


def test_embedded_hermes_init(settings_inprocess) -> None:
    """Creating EmbeddedHermes should resolve agent root without error."""
    embedded = EmbeddedHermes(settings_inprocess, max_iterations=15)
    assert embedded.max_iterations == 15
    assert embedded.settings is settings_inprocess


def test_embedded_hermes_init_resolves_root(settings_inprocess) -> None:
    """Should set _agent_root from settings."""
    embedded = EmbeddedHermes(settings_inprocess)
    assert embedded._agent_root is not None
    assert embedded._agent_root.exists()


def test_embedded_hermes_budget_exhausted_raised(settings_inprocess) -> None:
    """When AIAgent runs out of iterations, BudgetExhausted should be raised."""
    embedded = EmbeddedHermes(settings_inprocess, max_iterations=1)

    fake_agent = MagicMock()
    fake_budget = MagicMock()
    fake_budget.used = 1  # exhausted

    with (
        patch.object(embedded, "_run_agent", return_value="some content") as run,
        patch("auditlayer_worker.hermes_embedded.extract_html", return_value="<html/>"),
    ):
        result = embedded.generate(
            MagicMock(id="test-audit", handle="testuser", goal="growth"),
            progress=MagicMock(),
        )

    assert result["budget_exhausted"] is False  # BudgetExhausted is caught inside _run_agent
    assert result["html"] is not None
    # _run_agent was called (and doesn't raise BudgetExhausted in mock mode)


# ---------------------------------------------------------------------------
# generate() interface
# ---------------------------------------------------------------------------


def test_generate_returns_all_keys(settings_inprocess) -> None:
    """generate() should return all expected keys."""
    embedded = EmbeddedHermes(settings_inprocess, max_iterations=5)
    mock_audit = MagicMock(id="audit-1", handle="testuser", goal="growth",
                            milestone_label="10K", limitations=[])
    mock_progress = MagicMock()

    with patch.object(embedded, "_run_agent", return_value="research notes ... "):
        result = embedded.generate(mock_audit, mock_progress)

    assert "html" in result
    assert "tokens_in" in result
    assert "tokens_out" in result
    assert "model" in result
    assert "estimated" in result
    assert "research_cache" in result
    assert "budget_exhausted" in result
    assert "error" in result


def test_generate_with_research_cache(settings_inprocess) -> None:
    """When research_cache is provided, it should skip Stage 1 and go straight to compose."""
    embedded = EmbeddedHermes(settings_inprocess, max_iterations=5)
    mock_audit = MagicMock(id="audit-1", handle="testuser", goal="growth",
                            milestone_label="10K", limitations=[])
    mock_progress = MagicMock()

    with patch.object(embedded, "_run_agent", return_value="<html></html>") as run:
        result = embedded.generate(
            mock_audit, mock_progress,
            research_cache="cached research here",
        )

    assert result["research_cache"] == "cached research here"
    # _run_agent should have been called once (compose only)
    assert run.call_count == 1


# ---------------------------------------------------------------------------
# refine() interface
# ---------------------------------------------------------------------------


def test_refine_returns_all_keys(settings_inprocess) -> None:
    """refine() should return all expected keys."""
    embedded = EmbeddedHermes(settings_inprocess, max_iterations=5)
    mock_audit = MagicMock(id="audit-1", handle="testuser", goal="growth",
                            milestone_label="10K", limitations=[])

    with (
        patch("run_agent.AIAgent") as mock_agent_cls,
        patch("auditlayer_worker.hermes_embedded.extract_fragment", return_value="<section>refined</section>"),
    ):
        mock_agent = MagicMock()
        mock_agent.run_conversation.return_value = {"final_response": "<section>refined</section>"}
        mock_agent_cls.return_value = mock_agent
        result = embedded.refine(
            mock_audit,
            "<html><body><section>original</section></body></html>",
            "strengths",
            "Make it stronger",
            MagicMock(),
        )

    assert "fragment" in result
    assert "tokens_in" in result
    assert "tokens_out" in result
    assert "model" in result
    assert result["fragment"] is not None


# ---------------------------------------------------------------------------
# BudgetExhausted exception
# ---------------------------------------------------------------------------


def test_budget_exhausted_is_exception() -> None:
    """BudgetExhausted should be a proper Exception subclass."""
    exc = BudgetExhausted("out of budget")
    assert isinstance(exc, Exception)
    assert "out of budget" in str(exc)


# ---------------------------------------------------------------------------
# Edge cases
# ---------------------------------------------------------------------------


def test_embedded_hermes_default_max_iterations(settings_inprocess) -> None:
    """Default max_iterations should be 30."""
    embedded = EmbeddedHermes(settings_inprocess)
    assert embedded.max_iterations == 30
