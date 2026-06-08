from __future__ import annotations

import argparse
import json
import time

from .factory import create_service
from .config import Settings
from .web import main as web_main


def main() -> None:
    parser = argparse.ArgumentParser(prog="auditlayer")
    subcommands = parser.add_subparsers(dest="command")
    subcommands.add_parser("serve", help="Run the local WSGI portal")
    subcommands.add_parser("run-next", help="Run the oldest queued audit once")
    worker = subcommands.add_parser("worker", help="Continuously run queued audits")
    worker.add_argument("--interval", type=float, default=15.0, help="Seconds to sleep when idle")
    subcommands.add_parser("check-config", help="Validate runtime configuration")
    subcommands.add_parser("diagnose-hermes", help="Check local Hermes Gateway reachability without spending model tokens")
    subcommands.add_parser("validate-hermes", help="Validate Hermes chat-completions connectivity")
    args = parser.parse_args()
    if args.command == "check-config":
        settings = Settings.from_env()
        settings.ensure_dirs()
        errors = settings.validation_errors()
        if errors:
            for error in errors:
                print(f"ERROR: {error}")
            raise SystemExit(1)
        print("configuration ok")
        return
    if args.command == "run-next":
        audit = create_service().run_next_audit()
        if audit is None:
            print("idle")
        else:
            print(f"{audit.id} {audit.status}")
        return
    if args.command == "validate-hermes":
        result = create_service().validate_hermes()
        print(result)
        if not result["ok"]:
            raise SystemExit(1)
        return
    if args.command == "diagnose-hermes":
        result = create_service().diagnose_hermes()
        print(json.dumps(result, indent=2, sort_keys=True))
        if not result["ok"]:
            raise SystemExit(1)
        return
    if args.command == "worker":
        service = create_service()
        print(f"AuditLayer worker polling every {args.interval:g}s")
        while True:
            audit = service.run_next_audit()
            if audit is None:
                time.sleep(args.interval)
            else:
                print(f"{audit.id} {audit.status}")
    web_main()


if __name__ == "__main__":
    main()
