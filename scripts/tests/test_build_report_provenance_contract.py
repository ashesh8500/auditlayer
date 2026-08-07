#!/usr/bin/env python3
"""Static contract tests for scripts/build_report_provenance_contract.py.

Run:  python3 scripts/tests/test_build_report_provenance_contract.py

Verifies the deterministic, non-secret report-intelligence provenance
artifact contract (ALM-I-025):
- the artifact pins all seven canonical version fields;
- provider_calls = 0 and network_calls = 0 (recording/static fixtures only);
- rerunning the builder produces byte-identical JSON (cmp);
- the JSON is valid (json.tool / json.loads);
- no environment path, wall-clock timestamp, report body, handle, email, URL,
  credential, or storage path appears in the artifact;
- the manifest field vocabulary matches the worker and web canonical modules
  (drift catch), and the migration's intelligence_runs columns.

Fixtures prove the software contract only — never live FK behavior, RLS,
creator efficacy, or business value.
"""

from __future__ import annotations

import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TOOL = ROOT / "scripts" / "build_report_provenance_contract.py"

sys.path.insert(0, str(ROOT / "scripts"))
import build_report_provenance_contract as pc  # noqa: E402

_checks_run = 0


def check(condition: bool, message: str) -> None:
    global _checks_run
    _checks_run += 1
    if not condition:
        raise AssertionError(f"FAILED: {message}")


def run_tool(output: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(TOOL), "--output", str(output)],
        capture_output=True,
        text=True,
        cwd=str(ROOT),
    )


FORBIDDEN = [
    "/home/",
    "/Users/",
    "C:\\",
    "environ",
    "SUPABASE_URL",
    "SERVICE_ROLE",
    "API_KEY",
    "HERMES_API_KEY",
    "@",
    "http://",
    "https://",
    "reports/",
    "storage",
    "token",
    "secret",
]


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="alm-provenance-contract-") as tmp:
        tmp_root = Path(tmp)
        first = tmp_root / "first.json"
        second = tmp_root / "second.json"

        # 1. Deterministic builder: run twice, byte-identical.
        proc1 = run_tool(first)
        proc2 = run_tool(second)
        check(proc1.returncode == 0, f"builder first run failed: {proc1.stderr}")
        check(proc2.returncode == 0, f"builder second run failed: {proc2.stderr}")
        check(first.exists() and second.exists(), "builder did not write output files")
        check(
            first.read_bytes() == second.read_bytes(),
            "artifact is not byte-identical across reruns",
        )

        # 2. Valid JSON.
        data = json.loads(first.read_text(encoding="utf-8"))
        check(isinstance(data, dict), "artifact is not a JSON object")

        # 3. Schema and status.
        check(
            data.get("schema") == "report-intelligence-provenance-contract",
            f"unexpected schema: {data.get('schema')!r}",
        )
        check(
            data.get("manifest_version") == pc.MANIFEST_VERSION,
            "manifest_version mismatch",
        )
        check(data.get("status") == "pinned", "status must be pinned for the fixture run")

        # 4. All seven canonical fields present.
        manifest = data.get("manifest") or {}
        check(
            set(manifest.keys()) == set(pc.REPORT_PROVENANCE_FIELDS),
            f"manifest fields mismatch: {sorted(manifest)}",
        )
        for field in pc.REPORT_PROVENANCE_FIELDS:
            check(
                manifest.get(field) is not None and manifest.get(field) != "",
                f"manifest field {field} missing or empty",
            )

        # 5. Zero provider/network calls.
        check(data.get("provider_calls") == 0, "provider_calls must be 0")
        check(data.get("network_calls") == 0, "network_calls must be 0")

        # 6. No environment path, wall-clock timestamp, report body, handle,
        #    email, URL, credential, or storage path.
        blob = first.read_text(encoding="utf-8")
        for needle in FORBIDDEN:
            check(
                needle not in blob,
                f"artifact contains forbidden content: {needle}",
            )
        check(
            not re.search(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}", blob),
            "artifact contains a wall-clock ISO timestamp",
        )
        check(
            "provider_calls" in blob and "network_calls" in blob,
            "artifact must record call counters",
        )

        # 7. Vocabulary parity with the worker canonical module.
        worker_module = ROOT / "worker" / "auditlayer_worker" / "intelligence" / "report_provenance.py"
        if worker_module.exists():
            worker_src = worker_module.read_text(encoding="utf-8")
            for field in pc.REPORT_PROVENANCE_FIELDS:
                check(
                    field in worker_src,
                    f"worker report_provenance.py missing manifest field {field}",
                )

        # 8. Vocabulary parity with the web canonical module.
        web_module = ROOT / "web" / "src" / "lib" / "report-provenance.ts"
        if web_module.exists():
            web_src = web_module.read_text(encoding="utf-8")
            for field in pc.REPORT_PROVENANCE_FIELDS:
                check(
                    field in web_src,
                    f"web report-provenance.ts missing manifest field {field}",
                )

        # 9. Vocabulary parity with the kernel intelligence_runs columns.
        kernel_migration = (
            ROOT / "supabase" / "migrations"
            / "20260723020611_alm_intelligence_kernel.sql"
        )
        if kernel_migration.exists():
            sql = kernel_migration.read_text(encoding="utf-8").lower()
            for column in ("brief_version", "evidence_snapshot_id", "methodology_version",
                           "expertise_pack_version", "prompt_version", "model_config_hash",
                           "output_schema_version"):
                check(column in sql, f"kernel migration missing intelligence_runs column {column}")

    print(f"REPORT PROVENANCE CONTRACT ARTIFACT PASSED ({_checks_run} assertions)")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as exc:
        print(str(exc))
        raise SystemExit(1)
