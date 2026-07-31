#!/usr/bin/env python3
"""Validate ALM ontology TTL + SHACL without a graph database.

Usage (from repo root or worktree):
  python docs/implementation/alm-intelligence-v1/ontology/validate_ontology.py

Creates a local .venv under this directory when rdflib/owlrl/pyshacl are missing.
"""

from __future__ import annotations

import importlib
import importlib.util
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOMAIN = ROOT / "domain.ttl"
SHACL = ROOT / "domain.shacl.ttl"
FIXTURE = ROOT / "fixtures" / "valid-instance.ttl"
VENV = ROOT / ".venv"
DEPS = ("rdflib", "owlrl", "pyshacl")


def _venv_python() -> Path:
    if os.name == "nt":
        return VENV / "Scripts" / "python.exe"
    return VENV / "bin" / "python"


def _in_ontology_venv() -> bool:
    """True when this interpreter's prefix is the ontology local .venv."""
    try:
        return Path(sys.prefix).resolve() == VENV.resolve()
    except OSError:
        return False


def _ensure_deps() -> None:
    if _in_ontology_venv():
        missing = [name for name in DEPS if importlib.util.find_spec(name) is None]
        if missing:
            print(f"Installing ontology validation deps: {', '.join(missing)}")
            subprocess.check_call([sys.executable, "-m", "pip", "install", "--quiet", *missing])
        return

    py = _venv_python()
    if not py.exists():
        print(f"Creating ontology venv at {VENV}")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV)])

    print(f"Installing ontology validation deps into {VENV}: {', '.join(DEPS)}")
    subprocess.check_call([str(py), "-m", "pip", "install", "--quiet", "pip", "wheel"])
    subprocess.check_call([str(py), "-m", "pip", "install", "--quiet", *DEPS])
    os.execv(str(py), [str(py), str(Path(__file__).resolve()), *sys.argv[1:]])


def main() -> int:
    _ensure_deps()
    from rdflib import Graph
    from owlrl import DeductiveClosure, OWLRL_Semantics
    from pyshacl import validate

    for path in (DOMAIN, SHACL, FIXTURE):
        if not path.exists():
            print(f"FAIL missing file: {path}")
            return 1

    ontology = Graph()
    ontology.parse(DOMAIN, format="turtle")
    print(f"OK parsed domain.ttl ({len(ontology)} triples)")

    DeductiveClosure(OWLRL_Semantics).expand(ontology)
    print(f"OK owlrl expansion ({len(ontology)} triples)")

    data = Graph()
    data.parse(DOMAIN, format="turtle")
    data.parse(FIXTURE, format="turtle")

    shapes = Graph()
    shapes.parse(SHACL, format="turtle")

    conforms, _results_graph, results_text = validate(
        data_graph=data,
        shacl_graph=shapes,
        ont_graph=ontology,
        inference="rdfs",
        abort_on_first=False,
        meta_shacl=False,
        advanced=True,
        inplace=False,
    )
    if not conforms:
        print("FAIL SHACL validation:")
        print(results_text)
        return 1

    print("OK SHACL validation against fixtures/valid-instance.ttl")
    print("ALL ONTOLOGY CHECKS PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
