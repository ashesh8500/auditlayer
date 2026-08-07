#!/usr/bin/env python3
"""Static audit-lifecycle vocabulary drift checker (CI-only).

One deterministic projection over the canonical ``audits.status`` lifecycle and
its producers/consumers. It:

* loads a versioned manifest (``scripts/fixtures/alm-lifecycle/manifest.v1.json``)
  declaring the seven canonical audit states, their authoritative owner, the
  declared producers/consumers with expected literal sets, and the separate
  vocabularies (report-attempt, intelligence-run, batch, progress, event-phase,
  refinement, operator, proposal, recommendation, onboarding, runtime-telemetry)
  that are related projections, never aliases of ``audits.status``;
* statically extracts status literals from each declared source;
* fails closed on missing sources, unmapped literals, duplicate/mirror owners,
  vocabulary conflation, unsafe customer projections, and source drift;
* renders genuinely ambiguous ownership as UNKNOWN with the exact path and a
  correction tip - never silently promoted to success;
* emits a byte-deterministic JSON artifact with ``provider_calls=0`` and no
  environment paths or wall-clock timestamps.

This is a CI-only contract. Fixtures prove source/parity behavior only, not
live queue execution, concurrency, recovery, or customer experience.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MANIFEST = ROOT / "scripts" / "fixtures" / "alm-lifecycle" / "manifest.v1.json"

CANONICAL_EXPECTED = (
    "draft",
    "queued",
    "running",
    "ready",
    "needs_review",
    "blocked",
    "failed",
)

EXIT_PASS = 0
EXIT_FAIL = 1
EXIT_USAGE = 2


@dataclass
class Extraction:
    """Result of one deterministic static extraction from a source file."""

    literals: set[str] = field(default_factory=set)
    ok: bool = True
    reason: str = ""
    # Optional split for boundary sources (progress route): the audit-status
    # side and the separate progress-vocabulary side are verified separately.
    audit_literals: set[str] | None = None
    progress_literals: set[str] | None = None


Extractor = Callable[[str, dict], Extraction]


# ---------------------------------------------------------------------------
# Deterministic extractors
# ---------------------------------------------------------------------------


def _quoted(text: str) -> set[str]:
    return set(re.findall(r'"([a-z_]+)"', text))


def _sq(text: str) -> set[str]:
    return set(re.findall(r"'([a-z_]+)'", text))


def _table_block(text: str, table: str) -> str | None:
    match = re.search(
        rf"create\s+table\s+if\s+not\s+exists\s+public\.{re.escape(table)}\s*\((.*?)\n\);",
        text,
        flags=re.DOTALL,
    )
    return match.group(1) if match else None


def extract_markdown_enum(text: str, params: dict) -> Extraction:
    """Fenced code block after a heading, comma-separated literals."""
    heading = params.get("heading", "")
    match = re.search(
        rf"\*\*{re.escape(heading)}\*\*[^\n]*\n```\n(.*?)\n```",
        text,
        flags=re.DOTALL,
    )
    if not match:
        return Extraction(ok=False, reason=f"markdown heading {heading!r} not found")
    literals = {
        part.strip()
        for line in match.group(1).splitlines()
        for part in line.split(",")
        if part.strip()
    }
    return Extraction(literals=literals)


def extract_markdown_phases(text: str, params: dict) -> Extraction:
    """Fenced block of the event-phase timeline (arrow-separated)."""
    match = re.search(r"## Event phases.*?```\n(.*?)\n```", text, flags=re.DOTALL)
    if not match:
        return Extraction(ok=False, reason="event phases fenced block not found")
    raw = match.group(1).replace("\n", " ").replace("\u2192", ",")
    literals = {part.strip() for part in raw.split(",") if part.strip()}
    return Extraction(literals=literals)


def extract_python_enum(text: str, params: dict) -> Extraction:
    """``class NAME(str, Enum):`` with ``NAME = "value"`` members."""
    symbol = params.get("symbol", "")
    match = re.search(
        rf"class\s+{re.escape(symbol)}\(str,\s*Enum\):\n((?:[ \t]+[A-Z_0-9]+\s*=\s*\"[a-z_]+\"\n)+)",
        text,
    )
    if not match:
        return Extraction(ok=False, reason=f"python enum {symbol!r} not found")
    literals = set(re.findall(r'"([a-z_]+)"', match.group(1)))
    return Extraction(literals=literals)


def extract_python_enum_refs(text: str, params: dict) -> Extraction:
    """``AuditStatus.NAME`` / ``AuditStatus.NAME.value`` usages (lowercased)."""
    symbol = params.get("symbol", "")
    names = set(re.findall(rf"{re.escape(symbol)}\.([A-Z_0-9]+)", text))
    return Extraction(literals={name.lower() for name in names})


def extract_python_tuple(text: str, params: dict) -> Extraction:
    """``NAME = ( "a", "b", ... )`` tuple constant."""
    symbol = params.get("symbol", "")
    match = re.search(rf"\b{re.escape(symbol)}\s*=\s*\((.*?)\)", text, flags=re.DOTALL)
    if not match:
        return Extraction(ok=False, reason=f"python tuple {symbol!r} not found")
    return Extraction(literals=_quoted(match.group(1)))


def extract_python_map_keys(text: str, params: dict) -> Extraction:
    """String keys of one or more dict constants, e.g. runtime status maps."""
    symbols = params.get("symbols", [])
    literals: set[str] = set()
    for symbol in symbols:
        match = re.search(rf"\b{re.escape(symbol)}\s*=\s*\{{(.*?)\}}", text, flags=re.DOTALL)
        if not match:
            return Extraction(ok=False, reason=f"python dict {symbol!r} not found")
        # Keys only ("key": value); values are the mapped record vocabularies.
        literals |= set(re.findall(r'"([a-z_]+)"\s*:', match.group(1)))
    return Extraction(literals=literals)


def extract_python_status_strings(text: str, params: dict) -> Extraction:
    """``status = "x"`` / ``status: "x"`` string assignments."""
    return Extraction(literals=set(re.findall(r'\bstatus\s*[:=]\s*"([a-z_]+)"', text)))


def extract_ts_type_union(text: str, params: dict) -> Extraction:
    """``export type NAME = "a" | "b" | ...;`` (multiline or single-line).

    Captures only the quoted-literal run, so a semicolon-less declaration such
    as the generated ``AuditEventPhase`` never overruns into unrelated text.
    """
    symbol = params.get("symbol", "")
    match = re.search(
        rf"export\s+type\s+{re.escape(symbol)}\s*=\s*((?:\s*\|\s*)?\"[a-z_]+\"(?:\s*\|\s*\"[a-z_]+\")*)",
        text,
        flags=re.DOTALL,
    )
    if not match:
        return Extraction(ok=False, reason=f"ts type union {symbol!r} not found")
    return Extraction(literals=_quoted(match.group(1)))


def extract_ts_string_array(text: str, params: dict) -> Extraction:
    """``const NAME: TYPE = [ "a", "b" ];`` array constant."""
    symbol = params.get("symbol", "")
    match = re.search(rf"const\s+{re.escape(symbol)}(?::[^=]*)?=\s*\[(.*?)\]", text, flags=re.DOTALL)
    if not match:
        return Extraction(ok=False, reason=f"ts array {symbol!r} not found")
    return Extraction(literals=_quoted(match.group(1)))


def extract_ts_string_set(text: str, params: dict) -> Extraction:
    """``const NAME = new Set([ "a", "b" ]);`` set constant."""
    symbol = params.get("symbol", "")
    match = re.search(
        rf"const\s+{re.escape(symbol)}\s*=\s*new\s+Set\(\[(.*?)\]\)", text, flags=re.DOTALL
    )
    if not match:
        return Extraction(ok=False, reason=f"ts set {symbol!r} not found")
    return Extraction(literals=_quoted(match.group(1)))


def extract_ts_status_comparisons(text: str, params: dict) -> Extraction:
    """Audit-status receiver comparisons: ``audit.status === "x"``,
    ``decision.status === "x"``, or bare ``status === "x"``.

    The lookbehind excludes UI action-state receivers such as ``state.status``
    (AdminActionState / RefinementState) so action literals (idle/ok/error)
    never leak into the audit-status vocabulary.
    """
    return Extraction(
        literals=set(
            re.findall(
                r'(?<![\w.])(?:audit\.|decision\.)?status\s*(?:===|!==)\s*"([a-z_]+)"',
                text,
            )
        )
    )


def extract_ts_receiver_status_comparisons(text: str, params: dict) -> Extraction:
    """``<receiver>.status === "x"`` comparisons for a named receiver.

    Used where a row object (e.g. a refinement row ``r``) carries its own
    separate-vocabulary status that must stay distinct from audits.status.
    """
    receiver = params.get("receiver", "")
    return Extraction(
        literals=set(
            re.findall(
                rf"{re.escape(receiver)}\.status\s*(?:===|!==)\s*\"([a-z_]+)\"",
                text,
            )
        )
    )


def extract_ts_status_includes(text: str, params: dict) -> Extraction:
    """``["a", "b"].includes(status)`` array literals."""
    literals: set[str] = set()
    for match in re.finditer(r'\[([^\]]*?)\]\.includes\(\s*(?:audit\.)?status\s*\)', text):
        literals |= _quoted(match.group(1))
    return Extraction(literals=literals)


def extract_ts_update_status(text: str, params: dict) -> Extraction:
    """``.update({ status: "x" ... })`` Supabase update calls."""
    literals: set[str] = set()
    for match in re.finditer(r"\.update\(\s*\{([^}]*?)\}", text, flags=re.DOTALL):
        literals |= set(re.findall(r'\bstatus:\s*"([a-z_]+)"', match.group(1)))
    return Extraction(literals=literals)


def extract_ts_object_status_literals(text: str, params: dict) -> Extraction:
    """``.insert({ ... status: "x" ... })`` / ``.update({ ... status: "x" ... })``."""
    literals: set[str] = set()
    for match in re.finditer(r"\.(?:insert|update)\(\s*\{([^}]*?)\}", text, flags=re.DOTALL):
        literals |= set(re.findall(r'\bstatus:\s*"([a-z_]+)"', match.group(1)))
    return Extraction(literals=literals)


def _matrix_block(text: str, symbol: str) -> str | None:
    """Body of ``export const SYMBOL: ... = { ... };`` (between the braces)."""
    match = re.search(
        rf"\b{re.escape(symbol)}(?::[^=]*)?=\s*\{{(.*?)\n\}};",
        text,
        flags=re.DOTALL,
    )
    return match.group(1) if match else None


def extract_ts_matrix_status_keys(text: str, params: dict) -> Extraction:
    """Current-status keys of a typed transition matrix (``action -> status -> spec``).

    Used for the W010 founder transition matrix: the canonical matrix is the
    presentation projection the admin UI acts through (``canTransition``), so
    its status keys are the founder-actionable audit statuses.
    """
    symbol = params.get("symbol", "")
    body = _matrix_block(text, symbol)
    if body is None:
        return Extraction(ok=False, reason=f"ts matrix {symbol!r} not found")
    keys = set(re.findall(r"^\s{4}([a-z_]+):\s*\{", body, flags=re.MULTILINE))
    return Extraction(literals=keys)


def extract_ts_matrix_target_literals(text: str, params: dict) -> Extraction:
    """``target: "x"`` values inside a typed transition matrix (the statuses
    the transition may write)."""
    symbol = params.get("symbol", "")
    body = _matrix_block(text, symbol)
    if body is None:
        return Extraction(ok=False, reason=f"ts matrix {symbol!r} not found")
    return Extraction(literals=set(re.findall(r'\btarget:\s*"([a-z_]+)"', body)))


def extract_sql_rpc_target_status(text: str, params: dict) -> Extraction:
    """``v_target_status := 'x'`` assignments in a compare-and-transition RPC
    (the audit statuses the RPC may write)."""
    return Extraction(
        literals=set(re.findall(r"\bv_target_status\s*:=\s*'([a-z_]+)'", text))
    )


def extract_ts_progress_route(text: str, params: dict) -> Extraction:
    """Progress route: audit-status comparisons + progress-map keys.

    Returns an Extraction carrying ``audit_literals`` (audit-status side) and
    ``progress_literals`` (customer progress-map keys) as separate attributes;
    the checker verifies each against its own declared vocabulary so the
    progress vocabulary can never be conflated with audits.status.
    """
    audit = set(re.findall(r'\bauditStatus\s*===\s*"([a-z_]+)"', text))
    progress: set[str] = set()
    for match in re.finditer(r"(?:terminalMap|phaseMap)[^=]*=\s*\{([^}]*)\}", text, flags=re.DOTALL):
        body = match.group(1)
        for key_match in re.finditer(r"([a-z_]+)\s*:", body):
            progress.add(key_match.group(1))
    return Extraction(
        literals=audit | progress,
        audit_literals=audit,
        progress_literals=progress,
        reason="progress route decoded",
    )


def extract_ts_generated_untyped(text: str, params: dict) -> Extraction:
    """Generated types keep the field as plain ``string`` (no union literal list).

    A literal union here would signal schema drift; fail closed with a
    correction tip pointing at the schema authority.
    """
    field_name = params.get("field", "status")
    # Look for the audits table Row status declaration: status: string
    if not re.search(rf"\b{re.escape(field_name)}:\s*string\b", text):
        return Extraction(
            ok=False,
            reason=(
                f"generated types no longer declare {field_name!r} as plain string; "
                "regenerate from the static migrations (never hand-edit generated types)"
            ),
        )
    if re.search(rf'\b{re.escape(field_name)}:\s*"', text):
        return Extraction(
            ok=False,
            reason=(
                f"generated types now enumerate {field_name!r} as a literal union; "
                "this is schema drift - the SQL migrations are the authority and no "
                "audit-status CHECK may be added without reconciling this manifest"
            ),
        )
    return Extraction(literals=set())


def extract_sql_status_literals(text: str, params: dict) -> Extraction:
    """SQL ``status = 'x'`` plus case-when ``then/else 'x'`` literals."""
    literals = set(re.findall(r"\bstatus\s*=\s*'([a-z_]+)'", text))
    literals |= set(re.findall(r"\bthen\s+'([a-z_]+)'", text))
    literals |= set(re.findall(r"\belse\s+'([a-z_]+)'", text))
    return Extraction(literals=literals)


def extract_sql_default_status(text: str, params: dict) -> Extraction:
    """``<column> text not null default 'x'`` inside a named table block."""
    table = params.get("table", "")
    column = params.get("column", "status")
    block = _table_block(text, table)
    if block is None:
        return Extraction(ok=False, reason=f"table block public.{table} not found")
    match = re.search(rf"\b{re.escape(column)}\s+text\s+not\s+null\s+default\s+'([a-z_]+)'", block)
    if not match:
        return Extraction(ok=False, reason=f"default for {table}.{column} not found")
    return Extraction(literals={match.group(1)})


def extract_sql_check_constraint(text: str, params: dict) -> Extraction:
    """``check (status in ('a','b',...))`` inside a named table block."""
    table = params.get("table", "")
    column = params.get("column", "status")
    if table:
        block = _table_block(text, table)
        if block is None:
            return Extraction(ok=False, reason=f"table block public.{table} not found")
    else:
        block = text
    match = re.search(
        rf"check\s*\(\s*{re.escape(column)}\s+in\s*\(([^)]*)\)", block, flags=re.DOTALL
    )
    if not match:
        return Extraction(
            ok=False, reason=f"check constraint on {column} not found in {table or 'sql'}"
        )
    return Extraction(literals=_sq(match.group(1)))


EXTRACTORS: dict[str, Extractor] = {
    "markdown_enum": extract_markdown_enum,
    "markdown_phases": extract_markdown_phases,
    "python_enum": extract_python_enum,
    "python_enum_refs": extract_python_enum_refs,
    "python_tuple": extract_python_tuple,
    "python_map_keys": extract_python_map_keys,
    "python_status_strings": extract_python_status_strings,
    "ts_type_union": extract_ts_type_union,
    "ts_string_array": extract_ts_string_array,
    "ts_string_set": extract_ts_string_set,
    "ts_status_comparisons": extract_ts_status_comparisons,
    "ts_receiver_status_comparisons": extract_ts_receiver_status_comparisons,
    "ts_status_includes": extract_ts_status_includes,
    "ts_update_status": extract_ts_update_status,
    "ts_object_status_literals": extract_ts_object_status_literals,
    "ts_matrix_status_keys": extract_ts_matrix_status_keys,
    "ts_matrix_target_literals": extract_ts_matrix_target_literals,
    "sql_rpc_target_status": extract_sql_rpc_target_status,
    "ts_progress_route": extract_ts_progress_route,
    "ts_generated_untyped": extract_ts_generated_untyped,
    "sql_status_literals": extract_sql_status_literals,
    "sql_default_status": extract_sql_default_status,
    "sql_check_constraint": extract_sql_check_constraint,
}


# ---------------------------------------------------------------------------
# Contract verification
# ---------------------------------------------------------------------------


class ContractFailure(Exception):
    """A deterministic contract violation."""


@dataclass
class CheckerResult:
    sources: list[dict] = field(default_factory=list)
    vocabularies: list[dict] = field(default_factory=list)
    unknown_cases: list[dict] = field(default_factory=list)
    failures: list[str] = field(default_factory=list)
    projection_coverage: dict[str, list[str]] = field(default_factory=dict)
    assertions: int = 0

    @property
    def passed(self) -> bool:
        return not self.failures


def _check(result: CheckerResult, condition: bool, message: str) -> None:
    result.assertions += 1
    if not condition:
        result.failures.append(message)


def _run_extractor(manifest_source: dict, root: Path) -> tuple[set[str], Extraction, Path]:
    kind = manifest_source["kind"]
    path = root / manifest_source["path"]
    if kind not in EXTRACTORS:
        raise ContractFailure(f"unknown extractor kind {kind!r} for {manifest_source['path']}")
    if not path.exists():
        return set(), Extraction(ok=False, reason="source file missing"), path
    text = path.read_text(encoding="utf-8")
    extraction = EXTRACTORS[kind](text, manifest_source)
    return extraction.literals, extraction, path


def _source_entry(
    manifest_source: dict, literals: set[str], expected: set[str], status: str, note: str = ""
) -> dict:
    entry = {
        "id": manifest_source["id"],
        "path": manifest_source["path"],
        "kind": manifest_source["kind"],
        "extracted": sorted(literals),
        "expected": sorted(expected),
        "status": status,
    }
    if note:
        entry["note"] = note
    return entry


def verify(root: Path, manifest: dict) -> CheckerResult:
    result = CheckerResult()

    canonical = list(manifest.get("canonical_audit_states", []))
    if tuple(canonical) != CANONICAL_EXPECTED:
        result.failures.append(
            "canonical audit states drifted from the declared seven-state set "
            f"(draft|queued|running|ready|needs_review|blocked|failed); got {canonical}"
        )
    result.assertions += 1

    if len(canonical) != len(set(canonical)):
        result.failures.append(f"duplicate literal in canonical audit states: {canonical}")
    result.assertions += 1

    canonical_set = set(canonical)
    guards = set(manifest.get("conflation_guards", []))
    guards_present = guards & canonical_set
    if guards_present:
        result.failures.append(
            "vocabulary conflation: internal/separate-vocabulary literal(s) "
            f"{sorted(guards_present)} appear in the canonical audit states"
        )
    result.assertions += 1

    # -- authoritative owner + mirrors: exactly one owner, mirrors must match
    authority = manifest.get("authoritative_owner", {})
    auth_literals, auth_extraction, auth_path = _run_extractor(authority, root)
    if not auth_extraction.ok:
        result.unknown_cases.append(
            {
                "id": authority.get("id", "authoritative_owner"),
                "path": authority.get("path", ""),
                "reason": auth_extraction.reason,
                "correction_tip": (
                    "restore the authoritative AuditStatus enum at "
                    f"{authority.get('path')} or update the manifest owner"
                ),
            }
        )
        result.failures.append(
            f"authoritative owner {authority.get('path')} cannot be parsed statically"
        )
    else:
        if auth_literals != canonical_set:
            result.failures.append(
                "authoritative owner drift: "
                f"{authority.get('path')}::{authority.get('symbol')} declares "
                f"{sorted(auth_literals)} but the canonical set is {sorted(canonical_set)}"
            )
        result.assertions += 1
    result.sources.append(
        _source_entry(
            {**authority, "id": authority.get("id", "authoritative_owner")},
            auth_literals,
            canonical_set,
            "ok" if auth_extraction.ok and auth_literals == canonical_set else "failed",
        )
    )

    for mirror in manifest.get("mirrors", []):
        literals, extraction, path = _run_extractor(mirror, root)
        if not extraction.ok:
            result.unknown_cases.append(
                {
                    "id": mirror["id"],
                    "path": mirror["path"],
                    "reason": extraction.reason,
                    "correction_tip": (
                        f"restore the declared mirror construct in {mirror['path']} "
                        "or update the manifest; mirrors must equal the canonical set"
                    ),
                }
            )
            result.failures.append(f"mirror {mirror['path']} cannot be parsed statically")
        elif literals != canonical_set:
            result.failures.append(
                "duplicate/mirror owner drift: "
                f"{mirror['path']} declares {sorted(literals)} but the canonical set is "
                f"{sorted(canonical_set)} - exactly one owner is authoritative"
            )
        result.assertions += 1
        result.sources.append(
            _source_entry(
                mirror,
                literals,
                canonical_set,
                "ok" if extraction.ok and literals == canonical_set else "failed",
                note="mirror of the authoritative enum",
            )
        )

    # -- separate vocabularies (must stay distinct, never conflated)
    vocab_literals: dict[str, set[str]] = {}
    vocab_distinctive: dict[str, set[str]] = {}
    for vocab in manifest.get("separate_vocabularies", []):
        vocab_id = vocab["id"]
        declared = set(vocab.get("literals", []))
        vocab_literals[vocab_id] = declared
        vocab_distinctive[vocab_id] = set(vocab.get("distinctive", []))
        collected: set[str] = set()
        vocab_ok = True
        for source in vocab.get("sources", []):
            literals, extraction, path = _run_extractor(source, root)
            if not extraction.ok:
                result.unknown_cases.append(
                    {
                        "id": f"{vocab_id}:{source.get('path')}",
                        "path": source.get("path", ""),
                        "reason": extraction.reason,
                        "correction_tip": (
                            f"restore the declared {source.get('kind')} construct in "
                            f"{source.get('path')} or update the manifest; vocabulary "
                            f"{vocab_id} must stay distinct from audits.status"
                        ),
                    }
                )
                result.failures.append(
                    f"separate vocabulary {vocab_id} source {source.get('path')} "
                    "cannot be parsed statically"
                )
                vocab_ok = False
            else:
                collected |= literals
                result.assertions += 1
                unexpected = literals - declared
                if unexpected:
                    result.failures.append(
                        f"separate vocabulary {vocab_id} source {source.get('path')} "
                        f"contains undeclared literal(s) {sorted(unexpected)}"
                    )
        if vocab_ok:
            if collected != declared:
                result.failures.append(
                    f"separate vocabulary {vocab_id} drift: extracted "
                    f"{sorted(collected)} but declared {sorted(declared)}"
                )
            distinctive_leak = vocab_distinctive[vocab_id] & canonical_set
            if distinctive_leak:
                result.failures.append(
                    f"vocabulary conflation: {vocab_id} distinctive literal(s) "
                    f"{sorted(distinctive_leak)} collide with canonical audit states"
                )
        result.assertions += 1
        result.vocabularies.append(
            {
                "id": vocab_id,
                "owner": vocab.get("owner", ""),
                "literals": sorted(declared),
                "distinctive": sorted(vocab_distinctive[vocab_id]),
                "status": "ok" if vocab_ok and collected == declared and not (
                    vocab_distinctive[vocab_id] & canonical_set
                ) else "failed",
            }
        )

    # -- producers/consumers: one owner, explicit projection, fail closed
    for entry in manifest.get("producers", []) + manifest.get("consumers", []):
        literals, extraction, path = _run_extractor(entry, root)
        expected = set(entry.get("expected", []))
        extra_allowed = set(entry.get("extra_allowed", []))
        role = "producer" if entry in manifest.get("producers", []) else "consumer"

        if not extraction.ok:
            result.unknown_cases.append(
                {
                    "id": entry["id"],
                    "path": entry["path"],
                    "reason": extraction.reason,
                    "correction_tip": (
                        f"restore the declared {entry.get('kind')} construct in "
                        f"{entry['path']} or update the manifest; {role} must map every "
                        "supported literal to exactly one canonical audit state"
                    ),
                }
            )
            result.failures.append(f"{role} {entry['path']} cannot be parsed statically")
            status = "unknown"
        else:
            status = "ok"
            # Boundary source (progress route): audit-status side and progress
            # vocabulary side are verified separately so the progress vocabulary
            # can never become an audits.status literal.
            if extraction.audit_literals is not None:
                expected_audit = set(entry.get("expected_audit", []))
                expected_progress = set(entry.get("expected_progress", []))
                audit = extraction.audit_literals
                progress = extraction.progress_literals or set()
                if audit != expected_audit:
                    result.failures.append(
                        f"source drift: {entry['path']} audit-status side extracted "
                        f"{sorted(audit)} but manifest expects {sorted(expected_audit)}"
                    )
                    status = "drift"
                if progress != expected_progress:
                    result.failures.append(
                        f"source drift: {entry['path']} progress side extracted "
                        f"{sorted(progress)} but manifest expects {sorted(expected_progress)}"
                    )
                    status = "drift"
                unmapped = audit - canonical_set
                for literal in sorted(unmapped):
                    result.failures.append(
                        f"unmapped literal: {literal!r} at {entry['path']} is not a "
                        "canonical audit state and has no declared separate-vocabulary owner"
                    )
                    status = "failed" if status != "drift" else status
                result.assertions += 1
                note = (
                    f"{role}; projection={entry.get('projection', 'none')}; "
                    "progress vocabulary verified separately"
                )
                combined_expected = expected_audit | expected_progress
                result.sources.append(
                    _source_entry(entry, literals, combined_expected, status, note=note)
                )
                # customer projection must never expose internal vocabulary:
                # the progress side must be drawn only from the allowlisted
                # customer progress vocabulary (intelligence_run_progress); any
                # other literal (event phase, attempt status, worker internal)
                # would leak internal vocabulary to the customer.
                if entry.get("projection") == "customer":
                    customer_progress_vocab = set(
                        vocab_literals.get("intelligence_run_progress", set())
                    )
                    leaked = (progress - canonical_set) - customer_progress_vocab
                    if leaked:
                        result.failures.append(
                            f"unsafe customer projection: {entry['path']} maps "
                            f"{sorted(leaked)} (internal/undocumented vocabulary) into "
                            "customer-visible output; only the allowlisted "
                            "intelligence_run_progress customer states may be projected"
                        )
                for literal in audit & canonical_set:
                    if literal not in result.projection_coverage:
                        result.projection_coverage[literal] = []
                    if (
                        entry.get("projection")
                        and entry["projection"] not in result.projection_coverage[literal]
                    ):
                        result.projection_coverage[literal].append(entry["projection"])
                continue

            if literals != expected:
                result.failures.append(
                    f"source drift: {entry['path']} ({role}) extracted "
                    f"{sorted(literals)} but manifest expects {sorted(expected)}"
                )
                status = "drift"
            else:
                status = "ok"
            unmapped = literals - canonical_set - extra_allowed
            if unmapped:
                for literal in sorted(unmapped):
                    if literal in guards:
                        result.failures.append(
                            f"vocabulary conflation: {literal!r} at {entry['path']} is a "
                            "separate/internal vocabulary value used where an audits.status "
                            "literal is required"
                        )
                    else:
                        result.failures.append(
                            f"unmapped literal: {literal!r} at {entry['path']} is not a "
                            "canonical audit state and has no declared separate-vocabulary owner"
                        )
                status = "failed" if status != "drift" else status
            # customer projection must never expose internal vocabulary
            projection = entry.get("projection")
            if projection == "customer" and unmapped:
                result.failures.append(
                    f"unsafe customer projection: {entry['path']} exposes "
                    f"{sorted(unmapped)} which is not a customer-safe canonical audit state"
                )
        result.assertions += 1
        if extraction.audit_literals is None:
            note = f"{role}; projection={entry.get('projection', 'none')}"
            result.sources.append(_source_entry(entry, literals, expected, status, note=note))
            # projection coverage: canonical states referenced by this consumer
            for literal in literals & canonical_set:
                if literal not in result.projection_coverage:
                    result.projection_coverage[literal] = []
                if (
                    entry.get("projection")
                    and entry["projection"] not in result.projection_coverage[literal]
                ):
                    result.projection_coverage[literal].append(entry["projection"])

    # every canonical state must be referenced by at least one declared projection
    for state in canonical:
        if not result.projection_coverage.get(state):
            result.failures.append(
                f"canonical audit state {state!r} has no declared producer/consumer projection"
            )
    result.assertions += 1

    return result


# ---------------------------------------------------------------------------
# Deterministic artifact + CLI
# ---------------------------------------------------------------------------


def build_artifact(manifest: dict, result: CheckerResult) -> dict:
    return {
        "artifact": manifest.get("artifact", "audit-lifecycle-contract"),
        "schema_version": manifest.get("schema_version", "1.0.0"),
        "provider_calls": 0,
        "canonical_audit_states": list(manifest.get("canonical_audit_states", [])),
        "sources": result.sources,
        "separate_vocabularies": result.vocabularies,
        "projection_coverage": {
            state: sorted(projections)
            for state, projections in sorted(result.projection_coverage.items())
        },
        "unknown_cases": result.unknown_cases,
        "failures": result.failures,
        "correction_tips": [
            "missing source: restore the declared construct at the exact manifest path or update the manifest; never drop a producer/consumer silently",
            "unmapped literal: map the literal to a canonical audit state or declare an explicit separate-vocabulary owner with its source path",
            "duplicate owner: exactly one authoritative AuditStatus enum owns the canonical seven-state set; mirrors must equal it exactly",
            "vocabulary conflation: crashed/completed/succeeded/delayed and other separate-vocabulary literals must never appear where an audits.status literal is required",
            "unsafe customer projection: customer-visible surfaces may expose only canonical audit states and the allowlisted intelligence_run_progress customer states",
            "source drift: the extracted literal set diverged from the versioned manifest; reconcile the verified source before updating the manifest",
        ],
        "summary": {
            "sources": len(result.sources),
            "producers": sum(
                1 for entry in result.sources if "producer" in entry.get("note", "")
            ),
            "consumers": sum(
                1 for entry in result.sources if "consumer" in entry.get("note", "")
            ),
            "states": len(manifest.get("canonical_audit_states", [])),
            "separate_vocabularies": len(result.vocabularies),
            "projections": sorted(
                {p for projections in result.projection_coverage.values() for p in projections}
            ),
            "assertions": result.assertions,
            "status": "passed" if result.passed else "failed",
        },
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--manifest",
        default=str(DEFAULT_MANIFEST),
        help="versioned lifecycle manifest JSON (default: scripts/fixtures/alm-lifecycle/manifest.v1.json)",
    )
    parser.add_argument(
        "--root",
        default=str(ROOT),
        help="repository root against which manifest paths resolve",
    )
    parser.add_argument("--output", help="write the deterministic JSON artifact to PATH")
    args = parser.parse_args(argv)

    manifest_path = Path(args.manifest)
    root = Path(args.root)
    if not manifest_path.exists():
        print(f"usage: manifest not found: {manifest_path}", file=sys.stderr)
        return EXIT_USAGE

    try:
        manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        print(f"usage: invalid manifest JSON: {exc}", file=sys.stderr)
        return EXIT_USAGE

    result = verify(root, manifest)
    artifact = build_artifact(manifest, result)

    if args.output:
        out_path = Path(args.output)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(
            json.dumps(artifact, sort_keys=True, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    summary = artifact["summary"]
    if result.passed:
        print(
            "AUDIT LIFECYCLE CONTRACT PASSED: "
            f"assertions={summary['assertions']} sources={summary['sources']} "
            f"states={len(artifact['canonical_audit_states'])} "
            f"producers={summary['producers']} consumers={summary['consumers']} "
            f"separate_vocabularies={summary['separate_vocabularies']} "
            f"provider_calls=0"
        )
        return EXIT_PASS

    print(
        "AUDIT LIFECYCLE CONTRACT FAILED: "
        f"assertions={summary['assertions']} failures={len(result.failures)} "
        f"unknown_cases={len(result.unknown_cases)}"
    )
    for failure in result.failures:
        print(f"  FAIL {failure}", file=sys.stderr)
    for case in result.unknown_cases:
        print(
            f"  UNKNOWN {case['path']}: {case['reason']} -> {case['correction_tip']}",
            file=sys.stderr,
        )
    return EXIT_FAIL


if __name__ == "__main__":
    raise SystemExit(main())
