#!/usr/bin/env python3
"""Validate the ALM semantic contract: OWL/RDFS projection, SHACL invariants,
competency SQL-twin drift, and a deterministic machine-readable report.

Usage (from repo root or worktree):
  python3 docs/implementation/alm-intelligence-v1/ontology/validate_ontology.py

Creates a local gitignored .venv under this directory when rdflib/owlrl/pyshacl
are missing (the ontology-local dependency environment). Once present, all
checks run offline.

Postgres (Supabase) and the typed application contracts remain the system of
record. This ontology is a CI-only semantic projection and never a runtime
graph authority. Fixtures verify semantic/software consistency only — never
customer efficacy, calibration, or production database state.
"""

from __future__ import annotations

import importlib
import importlib.util
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DOMAIN = ROOT / "domain.ttl"
SHACL = ROOT / "domain.shacl.ttl"
COMPETENCY = ROOT / "competency-questions.md"

# docs/architecture-contract.md is the authoritative drift reference. Resolve it
# defensively: when the ontology dir sits at the canonical depth
# docs/implementation/alm-intelligence-v1/ontology, it is ROOT.parents[2]; from a
# shallow copy the checker must fail cleanly rather than crash.
ARCHITECTURE: Path | None = None
try:
    _candidate = ROOT.parents[2] / "architecture-contract.md"
    if _candidate.exists():
        ARCHITECTURE = _candidate
except IndexError:
    ARCHITECTURE = None
FIXTURES = ROOT / "fixtures"
VALID_FIXTURES = ("valid-instance.ttl",)
REPORT = ROOT / "semantic-contract-report.json"
VENV = ROOT / ".venv"
DEPS = ("rdflib", "owlrl", "pyshacl")

ALM_NS = "https://auditlayer.com/ontology/alm#"

# Contract thresholds (from the ALM-I-011 card).
MAX_CORE_CLASSES = 24
MIN_COMPETENCY_QUERIES = 5
MIN_INVALID_FIXTURES = 6

# Authoritative shipped kernel/compat table names from docs/architecture-contract.md
# ("ALM intelligence kernel (additive)" core + AI storage tables, plus the
# compatibility tables the competency twins reference). The drift reference:
# a SQL twin that references a name outside this set is stale; a manifest name
# missing from the contract is also drift.
KERNEL_TABLES = {
    "subjects", "subject_channels", "living_brief_versions",
    "context_update_proposals", "audit_batches", "batch_audits",
    "intelligence_runs", "evidence_snapshots", "evidence",
    "evidence_snapshot_members", "scores", "findings", "recommendations",
    "decisions", "intelligence_run_progress", "embedding_models",
    "evidence_embeddings", "accounts", "audits",
}

# Closed-world invariants enforced at the SQL layer (not SHACL-expressible).
# The validator drift-asserts that the authoritative contract still documents
# them; the report lists them as UNKNOWN-in-SHACL limitations.
SQL_ENFORCED_INVARIANTS = {
    "living_brief_versions_immutable": {
        "table": "living_brief_versions",
        "keywords": ("UPDATE/DELETE rejected", "rejects UPDATE/DELETE"),
    },
    "evidence_snapshots_immutable": {
        "table": "evidence_snapshots",
        "keywords": ("UPDATE/DELETE rejected", "rejects UPDATE/DELETE"),
    },
    "evidence_append_only": {
        "table": "evidence",
        "keywords": ("UPDATE/DELETE rejected", "rejects UPDATE/DELETE"),
    },
}

# Negative fixtures, each attributable to exactly one named fail-closed invariant.
INVALID_FIXTURES = {
    "invalid-managed-observed.ttl": {
        "invariant": "managed_vs_observed",
        "shape": "ObservedTargetShape",
        "summary": (
            "An ObservedTarget asserted as a ManagedRelationship — one-off public "
            "audit targets must never appear as managed workspace property."
        ),
    },
    "invalid-channel-as-subject.ttl": {
        "invariant": "channel_as_subject",
        "shape": "ChannelShape",
        "summary": (
            "A Channel asserted as a Subject — a channel is one presence of a "
            "durable Subject and must never itself be the Subject."
        ),
    },
    "invalid-unpinned-run.ttl": {
        "invariant": "unpinned_run",
        "shape": "IntelligenceRunShape",
        "summary": (
            "An IntelligenceRun without brief/evidence-snapshot/version pins — "
            "every run pins all contract versions."
        ),
    },
    "invalid-evidence-provenance.ttl": {
        "invariant": "evidence_provenance",
        "shape": "EvidenceItemShape",
        "summary": (
            "Evidence missing observed_at and carrying an undersized content hash — "
            "every EvidenceItem needs full provenance."
        ),
    },
    "invalid-recommendation-decision.ttl": {
        "invariant": "recommendation_decision",
        "shape": "RecommendationShape",
        "summary": (
            "A Recommendation in a decided state (accepted) with no backing "
            "ClientDecision — decided recommendations must be resolved by exactly "
            "one decision via alm:decidesOn; rejected advice must not revive "
            "without new evidence (temporal policy, SQL twin Q3)."
        ),
    },
    "invalid-immutable-projection.ttl": {
        "invariant": "immutable_projection",
        "shape": "ReportVersionShape",
        "summary": (
            "A ReportVersion asserted as an Audit — reports are immutable audience "
            "projections of a pinned run, never the queue/billing unit."
        ),
    },
}


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

    # Current interpreter already has the deps — run directly, fully offline.
    if all(importlib.util.find_spec(name) is not None for name in DEPS):
        return

    py = _venv_python()
    if not py.exists():
        print(f"Creating ontology venv at {VENV}")
        subprocess.check_call([sys.executable, "-m", "venv", str(VENV)])

    print(f"Installing ontology validation deps into {VENV}: {', '.join(DEPS)}")
    subprocess.check_call([str(py), "-m", "pip", "install", "--quiet", "pip", "wheel"])
    subprocess.check_call([str(py), "-m", "pip", "install", "--quiet", *DEPS])
    os.execv(str(py), [str(py), str(Path(__file__).resolve()), *sys.argv[1:]])


def _parse_competency_questions() -> tuple[list[dict], set[str], int]:
    """Return (questions, all_twin_tables, sparql_block_count).

    Each question: {id, title, sql_tables: [..], sql_blocks: N}.
    A question counts as a competency query only when it has >= 1 SQL twin.
    """
    text = COMPETENCY.read_text(encoding="utf-8")
    sections = re.split(r"(?m)^## (Q\d+\.)", text)
    questions: list[dict] = []
    all_tables: set[str] = set()
    sparql_blocks = 0
    # sections = ["", "Q1.", "title+body", "Q2.", ...]
    for i in range(1, len(sections), 2):
        qid = sections[i].rstrip(".")
        body = sections[i + 1]
        title = body.splitlines()[0].strip() if body.splitlines() else ""
        sql_blocks = re.findall(r"```sql\n(.*?)```", body, flags=re.DOTALL)
        sparql_blocks += len(re.findall(r"```sparql\n(.*?)```", body, flags=re.DOTALL))
        tables: set[str] = set()
        for block in sql_blocks:
            for m in re.finditer(
                r"\b(?:from|join|into|update|delete\s+from)\s+(?:public\.)?([a-z_]+)",
                block,
                flags=re.IGNORECASE,
            ):
                tables.add(m.group(1).lower())
        questions.append(
            {
                "id": qid,
                "title": title,
                "sql_tables": sorted(tables),
                "sql_blocks": len(sql_blocks),
            }
        )
        all_tables.update(tables)
    return questions, all_tables, sparql_blocks


def main() -> int:
    _ensure_deps()
    from rdflib import Graph, Namespace, RDF, OWL
    from owlrl import DeductiveClosure, OWLRL_Semantics
    from pyshacl import validate

    ALM = Namespace(ALM_NS)
    SH = Namespace("http://www.w3.org/ns/shacl#")

    checks_ok = True
    problems: list[str] = []

    def fail(msg: str) -> None:
        nonlocal checks_ok
        checks_ok = False
        problems.append(msg)
        print(f"FAIL {msg}")

    for path in (DOMAIN, SHACL, COMPETENCY):
        if not path.exists():
            fail(f"missing file: {path}")
            return 1
    if ARCHITECTURE is None:
        fail("missing architecture contract: docs/architecture-contract.md not reachable from ontology dir")
        return 1
    for name in VALID_FIXTURES:
        if not (FIXTURES / name).exists():
            fail(f"missing valid fixture: {name}")
            return 1
    for name in INVALID_FIXTURES:
        if not (FIXTURES / name).exists():
            fail(f"missing invalid fixture: {name}")
            return 1

    # --- ontology parse + core vocabulary boundary -------------------------
    ontology = Graph()
    ontology.parse(DOMAIN, format="turtle")
    parsed_triples = len(ontology)
    print(f"OK parsed domain.ttl ({parsed_triples} triples)")

    declared_classes = set(ontology.subjects(RDF.type, OWL.Class))
    core_classes = set(ontology.objects(ALM[""], ALM.coreClass))
    non_core_classes = set(ontology.objects(ALM[""], ALM.nonCoreClass))

    if not core_classes:
        fail("no core vocabulary designated (alm:coreClass empty)")
    if core_classes & non_core_classes:
        fail(f"core/non-core overlap: {sorted(x.split('#')[-1] for x in core_classes & non_core_classes)}")
    unclassified = declared_classes - core_classes - non_core_classes
    if unclassified:
        fail(
            "declared classes not designated core or non-core: "
            + ", ".join(sorted(x.split("#")[-1] for x in unclassified))
        )
    phantom_core = core_classes - declared_classes
    if phantom_core:
        fail(
            "core designations that are not declared classes: "
            + ", ".join(sorted(x.split("#")[-1] for x in phantom_core))
        )
    phantom_non_core = non_core_classes - declared_classes
    if phantom_non_core:
        fail(
            "non-core designations that are not declared classes: "
            + ", ".join(sorted(x.split("#")[-1] for x in phantom_non_core))
        )
    if len(core_classes) > MAX_CORE_CLASSES:
        fail(f"core_classes={len(core_classes)} exceeds max {MAX_CORE_CLASSES}")
    if len(core_classes) + len(non_core_classes) != len(declared_classes):
        fail(
            f"core({len(core_classes)}) + non-core({len(non_core_classes)}) != "
            f"declared classes({len(declared_classes)})"
        )
    if checks_ok:
        print(
            f"OK core vocabulary boundary: {len(core_classes)} core / "
            f"{len(non_core_classes)} non-core classes (declared={len(declared_classes)}, "
            f"core<={MAX_CORE_CLASSES})"
        )

    DeductiveClosure(OWLRL_Semantics).expand(ontology)
    print(f"OK owlrl expansion ({len(ontology)} triples)")

    # --- SHACL shapes ------------------------------------------------------
    shapes = Graph()
    shapes.parse(SHACL, format="turtle")
    shape_count = len(set(shapes.subjects(RDF.type, SH.NodeShape)))

    # --- competency SQL twins + drift --------------------------------------
    questions, twin_tables, sparql_blocks = _parse_competency_questions()
    competency_queries = sum(1 for q in questions if q["sql_blocks"] > 0)
    if competency_queries < MIN_COMPETENCY_QUERIES:
        fail(f"competency_queries={competency_queries} below min {MIN_COMPETENCY_QUERIES}")
    else:
        print(
            f"OK competency questions: {competency_queries} with SQL twins "
            f"({sum(q['sql_blocks'] for q in questions)} SQL blocks, {sparql_blocks} SPARQL sketches)"
        )

    sql_drift_names = sorted(twin_tables - KERNEL_TABLES)
    if sql_drift_names:
        fail(f"SQL twin references stale table name(s): {sql_drift_names}")
    else:
        print(f"OK SQL name drift: twin tables inside kernel manifest (sql_drift=0)")

    # ARCHITECTURE is guaranteed non-None here (early return above); the local
    # alias with an assert keeps the type checker honest and the failure clean.
    architecture = ARCHITECTURE
    assert architecture is not None
    contract_text = architecture.read_text(encoding="utf-8")
    contract_names = set(re.findall(r"`([a-z][a-z0-9_]+)`", contract_text))
    missing_from_contract = sorted(KERNEL_TABLES - contract_names)
    if missing_from_contract:
        fail(
            "kernel manifest tables missing from docs/architecture-contract.md: "
            + ", ".join(missing_from_contract)
        )

    sql_drift_ok = not sql_drift_names and not missing_from_contract
    if sql_drift_ok:
        print(
            "OK contract drift: kernel manifest and SQL-enforced invariant tables "
            "still documented in docs/architecture-contract.md"
        )

    sql_enforced_results = []
    for name, spec in SQL_ENFORCED_INVARIANTS.items():
        table = spec["table"]
        documented = table in contract_names and any(kw in contract_text for kw in spec["keywords"])
        sql_enforced_results.append(
            {
                "name": name,
                "table": table,
                "shacl_expressible": False,
                "drift_checked": True,
                "documented_in_contract": documented,
            }
        )
        if not documented:
            fail(f"SQL-enforced invariant {name} no longer documented in architecture contract")

    # --- SHACL valid fixture ------------------------------------------------
    valid_conforms = False
    valid_results_text = ""
    data = Graph()
    data.parse(DOMAIN, format="turtle")
    data.parse(FIXTURES / VALID_FIXTURES[0], format="turtle")
    valid_conforms, _, valid_results_text = validate(
        data_graph=data,
        shacl_graph=shapes,
        ont_graph=ontology,
        inference="rdfs",
        abort_on_first=False,
        meta_shacl=False,
        advanced=True,
        inplace=False,
    )
    if not valid_conforms:
        fail(f"SHACL validation against fixtures/{VALID_FIXTURES[0]} did not conform:\n{valid_results_text}")
    else:
        print(f"OK SHACL validation against fixtures/{VALID_FIXTURES[0]}")

    # --- SHACL invalid fixtures (fail closed) -------------------------------
    invalid_results = []
    for filename, spec in INVALID_FIXTURES.items():
        dg = Graph()
        dg.parse(DOMAIN, format="turtle")
        dg.parse(FIXTURES / filename, format="turtle")
        conforms, _, results_text = validate(
            data_graph=dg,
            shacl_graph=shapes,
            ont_graph=ontology,
            inference="rdfs",
            abort_on_first=False,
            meta_shacl=False,
            advanced=True,
            inplace=False,
        )
        invalid_results.append(
            {
                "file": filename,
                "invariant": spec["invariant"],
                "shape": spec["shape"],
                "conforms": bool(conforms),
                "expected_conforms": False,
                "summary": spec["summary"],
            }
        )
        if conforms:
            fail(f"invalid fixture {filename} CONFORMED (expected rejection for {spec['invariant']})")
        else:
            print(f"REJECT fixture fixtures/{filename} -> {spec['invariant']} (expected rejection)")

    invalid_fixtures_total = len(invalid_results)
    if invalid_fixtures_total < MIN_INVALID_FIXTURES:
        fail(f"invalid_fixtures={invalid_fixtures_total} below min {MIN_INVALID_FIXTURES}")

    # --- deterministic machine-readable report ------------------------------
    report = {
        "artifact": "alm-semantic-contract-report",
        "ontology_version": "1.1",
        "authority": "postgres_supabase",
        "authority_note": (
            "Supabase Postgres and typed application contracts remain the system of "
            "record. This ontology is a CI-only semantic projection; it never acts "
            "as a runtime graph authority and no graph service is introduced."
        ),
        "counts": {
            "declared_classes": len(declared_classes),
            "core_classes": len(core_classes),
            "non_core_classes": len(non_core_classes),
            "shacl_invariants": shape_count,
            "competency_queries": competency_queries,
            "sql_twin_blocks": sum(q["sql_blocks"] for q in questions),
            "sparql_blocks": sparql_blocks,
            "valid_fixtures": 1,
            "invalid_fixtures": invalid_fixtures_total,
            "sql_drift": len(sql_drift_names),
        },
        "core_classes": sorted(x.split("#")[-1] for x in core_classes),
        "non_core_classes": sorted(x.split("#")[-1] for x in non_core_classes),
        "competency_questions": [
            {"id": q["id"], "title": q["title"], "sql_tables": q["sql_tables"]} for q in questions
        ],
        "sql_twin_tables": sorted(twin_tables),
        "sql_drift_names": sql_drift_names,
        "invalid_fixtures": invalid_results,
        "sql_enforced_invariants": sql_enforced_results,
        "limitations": [
            "Postgres (Supabase) remains system of record; this projection is CI-only documentation, never a runtime graph authority.",
            "Immutability and append-only enforcement (UPDATE/DELETE rejection) are SQL-enforced closed-world policies; SHACL cannot express them, so they are drift-asserted against docs/architecture-contract.md and reported UNKNOWN-in-SHACL.",
            "Rejected recommendation non-revival is temporal SQL/application policy; SHACL covers only the typed decision-on-recommendation relationship.",
            "Fixtures verify semantic/software consistency only; they do not prove customer efficacy, model calibration, or production database state.",
        ],
        "passed": checks_ok,
    }
    REPORT.write_text(
        json.dumps(report, indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
    )
    print("OK wrote semantic-contract-report.json")

    if not checks_ok:
        print("SEMANTIC CONTRACT CHECKS FAILED")
        return 1

    print(
        f"ALL SEMANTIC CONTRACT CHECKS PASSED core_classes={len(core_classes)} "
        f"competency_queries={competency_queries} invalid_fixtures={invalid_fixtures_total} "
        f"sql_drift=0"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
