"""Synthetic data sources the agents consult: credit standards (policy as data), the trade registry, the credit bureau,
the bank's internal exposures, sanctions lists and reference-rate snapshots. Every file under fixtures/credit is fictional.
Agents store each lookup they rely on as a source document of the case, so evidence can cite it like any upload."""
import json
from datetime import date
from functools import lru_cache
from pathlib import Path


class Sources:
    def __init__(self, fixtures_dir: str | Path):
        self.root = Path(fixtures_dir) / "credit"

    def _json(self, *parts):
        return _load(str(self.root.joinpath(*parts)))

    def standards(self, on: date) -> dict:
        """The credit standards version in force on a date (latest effective_from not after it)."""
        versions = sorted((_load(str(p)) for p in (self.root / "standards").glob("*.json")), key=lambda s: s["effective_from"])
        active = [s for s in versions if s["effective_from"] <= on.isoformat()]
        if not active:
            raise LookupError("No credit standards in force on the evaluation date")
        return active[-1]

    def registry(self) -> dict:
        return self._json("sources", "registry.json")

    def company(self, cui: str) -> dict | None:
        return next((c for c in self.registry()["companies"] if c["cui"] == cui), None)

    def bureau(self, cui: str) -> dict | None:
        data = self._json("sources", "bureau.json")
        report = data["reports"].get(cui)
        return {"source": data["source"], **report} if report else None

    def exposures(self) -> dict:
        return self._json("sources", "exposures.json")

    def sanctions(self) -> dict:
        return self._json("sources", "sanctions.json")

    def market_seed(self, index: str = "ROBOR3M") -> dict:
        return self._json("market", f"{index}.json")

    def baseline(self) -> dict:
        path = self.root / "baseline.json"
        return _load(str(path)) if path.is_file() else {"manual_baseline_seconds": None}

    def case_dir(self, slug: str) -> Path:
        path = (self.root / "cases" / slug).resolve()
        if path.parent != (self.root / "cases").resolve():
            raise ValueError("Invalid case fixture")
        return path

    def case_manifest(self, slug: str) -> dict:
        return json.loads((self.case_dir(slug) / "manifest.json").read_text(encoding="utf-8"))


def _load(path: str):
    # Keyed on the modification time, so a newly published standards file is picked up without a restart.
    return _parse(path, Path(path).stat().st_mtime_ns)


@lru_cache(maxsize=64)
def _parse(path: str, mtime: int):
    return json.loads(Path(path).read_text(encoding="utf-8"))
