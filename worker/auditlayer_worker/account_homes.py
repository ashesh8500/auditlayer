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
import shutil
import tempfile

import yaml

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


def _atomic_copy(source: Path, target: Path) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=target.parent)
    os.close(fd)
    temp = Path(temp_name)
    try:
        shutil.copyfile(source, temp)
        os.replace(temp, target)
    finally:
        temp.unlink(missing_ok=True)


def get_report_bundle_version(bundle_root: str | Path) -> str:
    manifest_path = Path(bundle_root).expanduser().resolve() / "manifest.yaml"
    if not manifest_path.is_file():
        raise FileNotFoundError(f"canonical bundle manifest is missing from {bundle_root}")
    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    version = str(manifest.get("bundle_version") or "").strip()
    if not version:
        raise ValueError("canonical bundle has no bundle_version")
    return version


def _seed_report_bundle(home: Path, bundle_root: Path) -> None:
    """Install the immutable report role while preserving account runtime state."""
    bundle_root = bundle_root.expanduser().resolve()
    manifest_path = bundle_root / "manifest.yaml"
    report_root = bundle_root / "profiles" / "report"
    if not manifest_path.is_file() or not report_root.is_dir():
        raise FileNotFoundError(f"canonical report profile is missing from {bundle_root}")

    manifest = yaml.safe_load(manifest_path.read_text(encoding="utf-8")) or {}
    if "report" not in manifest.get("profiles", []):
        raise ValueError("canonical bundle does not declare the report profile")
    version = str(manifest.get("bundle_version") or "").strip()
    if not version:
        raise ValueError("canonical bundle has no bundle_version")

    config_source = report_root / "config.yaml"
    soul_source = report_root / "SOUL.md"
    if not config_source.is_file() or not soul_source.is_file():
        raise FileNotFoundError(f"canonical report profile is incomplete in {report_root}")
    config = yaml.safe_load(config_source.read_text(encoding="utf-8")) or {}
    if config.get("model", {}).get("provider") != "deepseek" or config.get("model", {}).get("default") != "deepseek-v4-flash":
        raise ValueError("canonical report profile must use deepseek-v4-flash via deepseek")
    if config.get("fallback_providers", []) != []:
        raise ValueError("canonical report profile must not define model fallbacks")

    marker = home / ".alm-bundle-version"
    current_version = marker.read_text(encoding="utf-8").strip() if marker.is_file() else ""
    required = (home / "config.yaml", home / "SOUL.md")
    if current_version == version and all(path.is_file() for path in required):
        return

    _atomic_copy(config_source, home / "config.yaml")
    _atomic_copy(soul_source, home / "SOUL.md")
    for source in sorted((bundle_root / "shared").glob("*.md")):
        _atomic_copy(source, home / "context" / source.name)

    skills_source = bundle_root / "skills"
    if skills_source.is_dir():
        shutil.copytree(skills_source, home / "skills", dirs_exist_ok=True)
    marker.write_text(f"{version}\n", encoding="utf-8")


def ensure_account_home(
    account_id: str,
    accounts_root: str | Path | None = None,
    bundle_root: str | Path | None = None,
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

    if bundle_root is not None:
        _seed_report_bundle(home, Path(bundle_root))
    else:
        config = home / "config.yaml"
        if not config.exists():
            config.write_text(
                "# Account-scoped Hermes config\n"
                "# Memory is isolated to this account's creators.\n"
                "model:\n"
                "  default: deepseek-v4-flash\n"
                "  provider: deepseek\n"
                "fallback_providers: []\n"
                "agent:\n"
                "  max_turns: 15\n"
            )

    # Ensure subdirectories that Hermes expects. These are never replaced by a
    # bundle upgrade because they contain tenant-specific runtime state.
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
