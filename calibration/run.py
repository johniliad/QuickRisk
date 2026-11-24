from __future__ import annotations

import argparse
import random
from pathlib import Path

from src.export import export_posterior_package, export_treatment_posteriors
from src.model import (
    build_joint_parameter_model,
    build_reference_classes,
    load_json,
    load_evidence,
    sample_joint_posterior,
)
from src.validate import (
    holdout_entries,
    posterior_predictive_check,
    prior_predictive_check,
    validate_holdout_waves,
)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fit and export the QuickRisk reference posterior")
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--draw-count", type=int, default=10000)
    parser.add_argument("--seed", type=int, default=20261124)
    parser.add_argument("--allow-activation", action="store_true")
    parser.add_argument("--synthetic-fixture", action="store_true")
    options = parser.parse_args(argv)

    evidence = load_evidence(options.evidence)
    evidence["treatment-priors"] = load_json(options.evidence / "treatment-priors.json")
    reference = build_reference_classes(evidence)
    model = build_joint_parameter_model(reference)
    rng = random.Random(options.seed)

    prior = prior_predictive_check(model, random.Random(options.seed ^ 0xA11CE))
    posterior = posterior_predictive_check(model, None, random.Random(options.seed ^ 0xB0B))
    historical = load_json(options.evidence / "dsit-2024-2025-holdout.json")
    holdout = validate_holdout_waves(
        model,
        holdout_entries(historical),
        random.Random(options.seed ^ 0xC0FFEE),
    )

    draws = sample_joint_posterior(model, options.draw_count, rng)
    export_treatment_posteriors(evidence, options.output, options.draw_count, options.seed)

    gates = {
        "posteriorPredictive": posterior["status"] == "passed",
        "prevalenceHoldout": holdout["status"] == "passed",
        "nonSynthetic": not options.synthetic_fixture,
        "activationRequested": options.allow_activation,
    }
    validated = all(gates.values())
    report = {
        "status": "reference-posterior-validated" if validated else "reference-posterior-provisional",
        "synthetic": options.synthetic_fixture,
        "validationScope": [
            "lognormal positive-severity quantile calibration",
            "temporal holdout of organisation-size attack prevalence",
            "source-role and prohibited-use enforcement",
            "joint-draw structural validation at load time",
        ],
        "knownValidationGap": "No independent organisation-level prospective loss dataset is available; national aggregate evidence cannot validate individual organisations.",
        "gates": gates,
        "priorPredictive": prior,
        "posteriorPredictive": posterior,
        "prevalenceHoldout": holdout,
        "evidenceSources": evidence["manifest"]["sources"],
        "reviewedAt": "2026-11-24T00:00:00Z",
    }
    metadata = {
        "modelId": "FAIR-QK-2.0",
        "modelVersion": "2.0.0",
        "calibrationVersion": "CAL-2.0",
        "methodologyVersion": "METH-2.0",
        "packageVersion": "PINF-QK-2.0.0",
        "seed": options.seed,
        "generatedAt": "2026-11-24T00:00:00Z",
    }
    export_posterior_package(
        model,
        draws,
        report,
        evidence["manifest"],
        options.output,
        metadata,
    )
    print(f"Posterior package written to {options.output}")
    print(f"Validation status: {report['status']}")
    return 0 if validated or not options.allow_activation else 1


if __name__ == "__main__":
    raise SystemExit(main())
