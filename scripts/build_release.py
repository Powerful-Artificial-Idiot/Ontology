from __future__ import annotations

import hashlib
import json
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

from common import ROOT


def copy_tree(source, target) -> None:
    shutil.copytree(source, target, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__", "*.pyc"))


def main() -> int:
    dist = ROOT / "dist"
    frontend_is_raw = (dist / "index.html").exists()
    frontend_is_packaged = (dist / "frontend-demo" / "index.html").exists()
    if not frontend_is_raw and not frontend_is_packaged:
        raise AssertionError("Frontend bundle missing. Run npm run build before building the release.")
    versions = json.loads((ROOT / "packages" / "demo-data" / "manifest.json").read_text())
    git_commit = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
    git_dirty = bool(subprocess.check_output(["git", "status", "--porcelain"], cwd=ROOT, text=True).strip())

    if frontend_is_raw:
        with tempfile.TemporaryDirectory() as temporary:
            frontend = shutil.copytree(dist, f"{temporary}/frontend-demo")
            shutil.rmtree(dist)
            dist.mkdir()
            copy_tree(frontend, dist / "frontend-demo")

    copy_tree(ROOT / "ontology", dist / "ontology-release")
    copy_tree(ROOT / "shapes", dist / "ontology-release" / "shapes")
    copy_tree(ROOT / "packages" / "demo-data", dist / "demo-data")
    copy_tree(ROOT / "packages" / "knowledge-contracts", dist / "contracts")

    manifest = {
        **{key: versions[key] for key in ("demoAppVersion", "ontologyVersion", "demoDataVersion", "contractVersion")},
        "gitCommit": git_commit,
        "gitDirty": git_dirty,
        "buildTime": datetime.now(timezone.utc).isoformat(),
        "files": [],
    }
    for path in sorted(item for item in dist.rglob("*") if item.is_file()):
        manifest["files"].append(path.relative_to(dist).as_posix())
    (dist / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")

    checksum_lines = []
    for path in sorted(item for item in dist.rglob("*") if item.is_file() and item.name != "checksums.txt"):
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        checksum_lines.append(f"{digest}  {path.relative_to(dist).as_posix()}")
    (dist / "checksums.txt").write_text("\n".join(checksum_lines) + "\n")
    print(f"Release built at {dist} with {len(manifest['files'])} files.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
