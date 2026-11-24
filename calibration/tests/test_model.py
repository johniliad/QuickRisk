from __future__ import annotations

import hashlib
import json
import math
import random
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "calibration"))

from src.model import (  # noqa: E402
    CLASSES,
    SCENARIOS,
    build_joint_parameter_model,
    build_reference_classes,
    fit_lognormal_quantiles,
    load_evidence,
    sample_joint_posterior,
)
from src.validate import interval_coverage  # noqa: E402


class ModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.evidence = load_evidence(ROOT / "calibration" / "evidence")
        cls.model = build_joint_parameter_model(build_reference_classes(cls.evidence))

    def test_lognormal_fit_recovers_known_parameters(self) -> None:
        quantiles = [
            {"probability": 0.25, "value": math.exp(0.5 + (-0.6744897501960817 * 0.8))},
            {"probability": 0.5, "value": math.exp(0.5)},
            {"probability": 0.9, "value": math.exp(0.5 + (1.2815515655446004 * 0.8))},
            {"probability": 0.95, "value": math.exp(0.5 + (1.6448536269514722 * 0.8))},
        ]
        fitted = fit_lognormal_quantiles(quantiles)
        self.assertAlmostEqual(0.5, fitted["mu"], places=5)
        self.assertAlmostEqual(0.8, fitted["sigma"], places=5)

    def test_reference_classes_are_complete_and_sourced(self) -> None:
        self.assertEqual(set(CLASSES), set(self.model["classes"]))
        for name, reference in self.model["classes"].items():
            self.assertEqual("dsit-csbs-2025-2026", reference["prevalence"]["sourceId"], name)
            self.assertEqual("dsit-csbs-2025-2026", reference["materiality"]["sourceId"], name)
            self.assertGreater(reference["severity"]["mean"], 0.0)
            self.assertGreater(reference["severity"]["sigma"], 0.0)

    def test_joint_draws_share_scenario_weights(self) -> None:
        draws = sample_joint_posterior(self.model, 100, random.Random(1234))
        self.assertEqual(100, draws["drawCount"])
        for name in CLASSES:
            for draw in draws["classes"][name]:
                self.assertAlmostEqual(1.0, sum(draw["scenarioWeights"]), places=12)
                self.assertEqual(len(SCENARIOS), len(draw["scenarioWeights"]))
                self.assertEqual(len(SCENARIOS), len(draw["scenarioFrequencyLogOffsets"]))
                self.assertGreater(draw["attackRate"], 0.0)
                self.assertTrue(0.0 < draw["materialProbability"] <= 1.0)

    def test_interval_coverage_contains_observation(self) -> None:
        coverage = interval_coverage([1.0, 2.0, 3.0, 4.0], [2.5], [0.8, 0.95])
        self.assertEqual(1, coverage["0.8"]["covered"])
        self.assertEqual(1, coverage["0.95"]["covered"])

    def test_exported_package_is_active_hashed_and_non_synthetic(self) -> None:
        package = ROOT / "fairquickmodel" / "inference"
        manifest = json.loads((package / "manifest.json").read_text(encoding="utf-8"))
        self.assertTrue(manifest["active"])
        self.assertFalse(manifest["synthetic"])
        self.assertEqual("reference-posterior-validated", manifest["status"])
        for filename, expected in manifest["hashes"].items():
            digest = hashlib.sha256((package / filename).read_bytes()).hexdigest()
            self.assertEqual(expected, digest, filename)

    def test_evidence_roles_include_the_required_sources(self) -> None:
        ids = {source["id"] for source in self.evidence["manifest"]["sources"]}
        self.assertIn("dsit-csbs-2025-2026", ids)
        self.assertIn("ibm-cost-of-a-data-breach-2025", ids)
        self.assertIn("verizon-dbir-2026", ids)
        self.assertIn("ecb-annual-reference-rates-2025", ids)


if __name__ == "__main__":
    unittest.main()
