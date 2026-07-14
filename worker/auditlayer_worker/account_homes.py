"""Provision and manage per-account HERMES_HOME directories.

Each paying account gets its own scoped HERMES_HOME so that Hermes memory
persists per-account across audits of the same creator.  The directory layout::

    {accounts_root}/{account_id}/
        config.yaml       # account-scoped Hermes config (optional)
        sessions/         # per-audit session logs
        memories/         # MEMORY.md persists here across audits
        logs/             # runtime / debug logs
"""

from __future__ import annotations

import os
from pathlib import Path

ACCOUNTS_ROOT = Path(
    os.getenv("ALM_ACCOUNTS_ROOT", "/opt/alm/hermes/accounts")
)
LOCAL_ACCOUNTS_ROOT = Path.home() / ".local" / "share" / "auditlayer" / "hermes" / "accounts"


def _contained_account_home(root: Path, account_id: str) -> Path:
    """Return the resolved account home, rejecting traversal outside root."""
    resolved_root = root.expanduser().resolve()
    home = (resolved_root / account_id).resolve()
    try:
        home.relative_to(resolved_root)
    except ValueError as exc:
        raise ValueError(f"account_id escapes accounts root: {account_id!r}") from exc
    return home


def ensure_account_home(
    account_id: str,
    accounts_root: str | Path | None = None,
) -> Path:
    """Ensure a scoped HERMES_HOME exists for this account.

    Creates the directory structure and a minimal ``config.yaml`` that
    isolates memory per account.

    Parameters
    ----------
    account_id : str
        The account/tenant identifier (e.g. the Supabase user_id).
    accounts_root : str or Path or None
        Root directory under which account homes are created.  When ``None``,
        uses :data:`ACCOUNTS_ROOT` (from ``ALM_ACCOUNTS_ROOT`` env var or
        ``/opt/alm/hermes/accounts``).

    Returns
    -------
    Path
        Absolute path to the account's HERMES_HOME directory.
    """
    root = Path(accounts_root) if accounts_root else ACCOUNTS_ROOT
    home = _contained_account_home(root, account_id)
    try:
        home.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        if accounts_root is not None:
            raise
        home = _contained_account_home(LOCAL_ACCOUNTS_ROOT, account_id)
        home.mkdir(parents=True, exist_ok=True)

    config = home / "config.yaml"
    if not config.exists():
        config.write_text(
            "# Account-scoped Hermes config\n"
            "# Memory is isolated to this account's creators.\n"
            "model:\n"
            "  default: deepseek-v4-flash\n"
            "agent:\n"
            "  max_turns: 15\n"
        )

    # Ensure subdirectories that Hermes expects
    for sub in ("sessions", "memories", "logs"):
        (home / sub).mkdir(exist_ok=True)

    return home.resolve()


def get_account_hermes_home(
    account_id: str,
    accounts_root: str | Path | None = None,
) -> str:
    """Return the absolute ``HERMES_HOME`` path for this account.

    The returned string is suitable for setting the ``HERMES_HOME``
    environment variable before creating an :class:`AIAgent` instance.

    Parameters
    ----------
    account_id : str
        The account/tenant identifier.
    accounts_root : str or Path or None
        Root directory under which account homes are created.  See
        :func:`ensure_account_home`.

    Returns
    -------
    str
        Absolute path to the account's HERMES_HOME directory.
    """
    return str(ensure_account_home(account_id, accounts_root))
