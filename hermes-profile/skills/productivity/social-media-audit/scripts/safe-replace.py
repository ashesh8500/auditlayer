#!/usr/bin/env python3
"""Safe bulk find-and-replace for HTML/markdown reports.
Avoids the "Dr Dr" double-replacement problem that chained sed commands cause.
Usage: python3 safe-replace.py <file> <replacements_json>

replacements_json is a JSON list of [old_string, new_string] pairs.
Order matters — longer/more-specific patterns should come first.
"""

import sys
import json

def safe_replace(filepath, replacements):
    with open(filepath, "r") as f:
        content = f.read()

    for old, new in replacements:
        count = content.count(old)
        if count > 0:
            content = content.replace(old, new)
            print(f"Replaced {count}x: {old[:60]}")

    with open(filepath, "w") as f:
        f.write(content)

    print("Done.")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python3 safe-replace.py <file> '<json_replacements>'")
        sys.exit(1)

    filepath = sys.argv[1]
    replacements = json.loads(sys.argv[2])
    safe_replace(filepath, replacements)
