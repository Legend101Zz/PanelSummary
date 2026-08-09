"""Export deterministic JSON Schemas from canonical Pydantic models."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from app.contracts.registry import CONTRACT_MODELS


REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_OUTPUT = REPOSITORY_ROOT / "packages" / "contracts" / "schema"


def export_contracts(output_dir: Path, *, check: bool = False) -> list[Path]:
    output_dir.mkdir(parents=True, exist_ok=True)
    changed: list[Path] = []

    expected_names: set[str] = set()
    for contract_name, model in sorted(CONTRACT_MODELS.items()):
        filename = f"{contract_name}.schema.json"
        expected_names.add(filename)
        schema = model.model_json_schema(
            by_alias=False,
            mode="validation",
            ref_template="#/$defs/{model}",
        )
        schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
        schema["$id"] = f"https://scrollstack.dev/contracts/{filename}"
        payload = json.dumps(schema, indent=2, sort_keys=True, ensure_ascii=False) + "\n"
        path = output_dir / filename
        if not path.exists() or path.read_text(encoding="utf-8") != payload:
            changed.append(path)
            if not check:
                path.write_text(payload, encoding="utf-8")

    stale = sorted(
        path for path in output_dir.glob("*.schema.json") if path.name not in expected_names
    )
    if stale:
        changed.extend(stale)
        if not check:
            for path in stale:
                path.unlink()

    return changed


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    changed = export_contracts(args.output, check=args.check)
    if args.check and changed:
        print("Contract schemas are out of date:")
        for path in changed:
            print(path)
        return 1
    print(f"Contract schemas are current ({len(CONTRACT_MODELS)} schemas).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
