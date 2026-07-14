from __future__ import annotations

import subprocess
import sys

from common import ROOT


def main() -> int:
    scripts = [
        "validate_ontology.py",
        "validate_shapes.py",
        "validate_mappings.py",
        "validate_demo_contracts.py",
        "run_competency_queries.py",
    ]
    for script in scripts:
        subprocess.run([sys.executable, str(ROOT / "scripts" / script)], cwd=ROOT, check=True)
    print("All knowledge engineering validations passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
