"""Explicit offline dependencies for product-provider tests."""
import pytest


@pytest.fixture
def fake_agent_root(tmp_path, monkeypatch):
    root = tmp_path / 'offline-hermes-root'
    root.mkdir()
    (root / 'run_agent.py').write_text('# Offline marker only; product SDK tests never import Hermes.\n')
    monkeypatch.setenv('HERMES_AGENT_ROOT', str(root))
    return str(root)
