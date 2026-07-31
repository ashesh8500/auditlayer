"""Subject-scoped rebuildable Hermes working homes.

These directories are scratch state only. Postgres ledgers remain the system of
record; a deleted or rebuilt home must never change scores, findings,
recommendations, decisions, or Living Brief versions.
"""

from __future__ import annotations

import os
from pathlib import Path
from uuid import UUID

SUBJECTS_ROOT = Path(
    os.getenv("ALM_SUBJECTS_ROOT", "/opt/alm/hermes/subjects")
)
LOCAL_SUBJECTS_ROOT = (
    Path.home() / ".local" / "share" / "auditlayer" / "hermes" / "subjects"
)


class SubjectHomeError(ValueError):
    """Subject home path or identity is invalid."""


def _subject_uuid(subject_id: str) -> str:
    try:
        return str(UUID(str(subject_id)))
    except (ValueError, TypeError, AttributeError) as exc:
        raise SubjectHomeError("subject_id must be a UUID") from exc


def _contained_subject_home(root: Path, subject_id: str) -> Path:
    resolved_root = root.expanduser().resolve()
    home = (resolved_root / subject_id).resolve()
    try:
        home.relative_to(resolved_root)
    except ValueError as exc:
        raise SubjectHomeError(f"subject_id escapes subjects root: {subject_id!r}") from exc
    return home


def ensure_subject_home(
    subject_id: str,
    subjects_root: str | Path | None = None,
) -> Path:
    """Ensure a rebuildable HERMES_HOME exists for this subject UUID.

    The home is intentionally minimal. Production inference remains tool-free
    and does not write Hermes memory as truth. Callers may delete and recreate
    this tree without affecting the Postgres ledger.
    """

    normalized = _subject_uuid(subject_id)
    root = Path(subjects_root) if subjects_root else SUBJECTS_ROOT
    home = _contained_subject_home(root, normalized)
    try:
        home.mkdir(parents=True, exist_ok=True)
    except PermissionError:
        if subjects_root is not None:
            raise
        home = _contained_subject_home(LOCAL_SUBJECTS_ROOT, normalized)
        home.mkdir(parents=True, exist_ok=True)

    marker = home / ".alm-subject-home"
    if not marker.exists():
        marker.write_text(
            "rebuildable working state only; ledger outranks this directory\n",
            encoding="utf-8",
        )
    config = home / "config.yaml"
    if not config.exists():
        config.write_text(
            "# Subject-scoped Hermes scratch home\n"
            "# Never outranks the Postgres intelligence ledger.\n"
            "model:\n"
            "  default: deepseek-v4-flash\n"
            "  provider: deepseek\n"
            "fallback_providers: []\n"
            "agent:\n"
            "  max_turns: 15\n",
            encoding="utf-8",
        )
    for sub in ("sessions", "memories", "logs", "scratch"):
        (home / sub).mkdir(exist_ok=True)
    return home.resolve()


def rebuild_subject_home(
    subject_id: str,
    subjects_root: str | Path | None = None,
) -> Path:
    """Delete and recreate a subject home. Ledger state is untouched."""

    import shutil

    normalized = _subject_uuid(subject_id)
    root = Path(subjects_root) if subjects_root else SUBJECTS_ROOT
    home = _contained_subject_home(root, normalized)
    if home.exists():
        shutil.rmtree(home)
    return ensure_subject_home(normalized, subjects_root=root)


def get_subject_hermes_home(
    subject_id: str,
    subjects_root: str | Path | None = None,
) -> str:
    """Return the absolute HERMES_HOME path for a subject UUID."""

    return str(ensure_subject_home(subject_id, subjects_root))
