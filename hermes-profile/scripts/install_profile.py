#!/usr/bin/env python3
"""Materialize canonical AuditLayer Hermes profiles without copying secrets/state."""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import shutil
import tempfile
from typing import Iterable

import yaml

MANAGED_FILES = ("config.yaml", "SOUL.md")


def _load_manifest(bundle_root: Path) -> dict:
    return yaml.safe_load((bundle_root / "manifest.yaml").read_text(encoding="utf-8")) or {}


def _runtime_name(bundle_root: Path, profile: str) -> str:
    manifest = _load_manifest(bundle_root)
    if profile not in manifest.get("profiles", []):
        raise ValueError(f"unknown canonical profile: {profile}")
    try:
        return str(manifest["runtime_names"][profile])
    except KeyError as exc:
        raise ValueError(f"missing runtime name for canonical profile: {profile}") from exc


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


def _managed_pairs(bundle_root: Path, target: Path, profile: str) -> Iterable[tuple[Path, Path]]:
    source = bundle_root / "profiles" / profile
    for name in MANAGED_FILES:
        yield source / name, target / name
    for source_path in sorted((bundle_root / "shared").glob("*.md")):
        yield source_path, target / "context" / source_path.name


def _skill_pairs(bundle_root: Path, target: Path, profile: str) -> Iterable[tuple[Path, Path]]:
    if profile not in {"operator", "report"}:
        return
    skills_root = bundle_root / "skills"
    if not skills_root.is_dir():
        return
    for source_path in sorted(path for path in skills_root.rglob("*") if path.is_file()):
        yield source_path, target / "skills" / source_path.relative_to(skills_root)


def materialize(bundle_root: Path, hermes_home: Path, profile: str) -> Path:
    """Install managed profile files while preserving secrets and runtime state."""
    bundle_root = bundle_root.resolve()
    hermes_home = hermes_home.expanduser().resolve()
    runtime_name = _runtime_name(bundle_root, profile)
    target = hermes_home / "profiles" / runtime_name
    target.mkdir(parents=True, exist_ok=True)

    for source, destination in _managed_pairs(bundle_root, target, profile):
        if not source.is_file():
            raise FileNotFoundError(f"missing managed bundle file: {source}")
        _atomic_copy(source, destination)
    for source, destination in _skill_pairs(bundle_root, target, profile):
        _atomic_copy(source, destination)

    manifest = _load_manifest(bundle_root)
    (target / ".alm-bundle-version").write_text(
        f"{manifest['bundle_version']}\n", encoding="utf-8"
    )
    return target


def check_drift(bundle_root: Path, hermes_home: Path, profile: str) -> list[str]:
    """Return managed relative paths whose deployed content differs or is missing."""
    bundle_root = bundle_root.resolve()
    runtime_name = _runtime_name(bundle_root, profile)
    target = hermes_home.expanduser().resolve() / "profiles" / runtime_name
    drift: list[str] = []
    pairs = [
        *_managed_pairs(bundle_root, target, profile),
        *_skill_pairs(bundle_root, target, profile),
    ]
    for source, destination in pairs:
        relative = str(destination.relative_to(target))
        if not destination.is_file() or destination.read_bytes() != source.read_bytes():
            drift.append(relative)
    return drift


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("profiles", nargs="*", help="operator, dev, ops, or report")
    parser.add_argument("--all", action="store_true", help="materialize every profile")
    parser.add_argument("--check", action="store_true", help="report drift without writing")
    parser.add_argument(
        "--hermes-home",
        type=Path,
        default=Path(os.environ.get("HERMES_HOME", Path.home() / ".hermes")),
    )
    args = parser.parse_args()

    bundle_root = Path(__file__).resolve().parents[1]
    manifest = _load_manifest(bundle_root)
    profiles = list(manifest["profiles"]) if args.all else args.profiles
    if not profiles:
        parser.error("provide a profile name or --all")

    failed = False
    for profile in profiles:
        if args.check:
            drift = check_drift(bundle_root, args.hermes_home, profile)
            if drift:
                failed = True
                print(f"{profile}: drift: {', '.join(drift)}")
            else:
                print(f"{profile}: clean")
        else:
            target = materialize(bundle_root, args.hermes_home, profile)
            print(f"{profile}: installed at {target}")
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
