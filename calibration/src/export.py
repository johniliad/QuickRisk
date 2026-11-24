"""Deterministic export of Bayesian posterior packages for the PHP runtime."""

from __future__ import annotations

import hashlib
import json
import math
import random
from pathlib import Path


def canonical_json(value: object) -> bytes:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True).encode("utf-8")


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _write_json(path: Path, value: object, compact: bool = False) -> None:
    if compact:
        text = json.dumps(value, separators=(",", ":"), ensure_ascii=True)
    else:
        text = json.dumps(value, indent=2, ensure_ascii=False)
    path.write_text(text + "\n", encoding="utf-8")


def _beta_parameters(mean: float, variance: float) -> tuple[float, float]:
    mean = min(0.98, max(0.01, mean))
    variance = max(1.0e-8, min(variance, mean * (1.0 - mean) * 0.95))
    common = mean * (1.0 - mean) / variance - 1.0
    common = max(0.05, common)
    return mean * common, (1.0 - mean) * common


def _treatment_posterior(treatment: dict, rng: random.Random, count: int) -> dict:
    output = {}
    for lever in ("frequency", "magnitude"):
        estimate = treatment.get(lever)
        if not estimate:
            output[lever] = None
            continue
        minimum = float(estimate["min"])
        mode = float(estimate["mostLikely"])
        maximum = float(estimate["max"])
        mean = (minimum + 4.0 * mode + maximum) / 6.0
        half_range = max((maximum - minimum) / 4.0, 0.005)
        alpha, beta = _beta_parameters(mean, half_range * half_range)
        draws = [min(0.99, max(0.0, rng.betavariate(alpha, beta))) for _ in range(count)]
        ordered = sorted(draws)
        output[lever] = {
            "alpha": alpha,
            "beta": beta,
            "mean": sum(draws) / count,
            "q025": ordered[int(0.025 * (count - 1))],
            "q975": ordered[int(0.975 * (count - 1))],
            "draws": draws,
        }
    return output


def export_treatment_posteriors(evidence: dict, output_directory: Path, draw_count: int, seed: int) -> dict:
    source = evidence["treatment-priors"]
    rng = random.Random(seed ^ 0x5A17)
    treatments = {}
    for treatment in source["treatments"]:
        treatments[treatment["id"]] = {
            "version": treatment["version"],
            "name": treatment["name"],
            "status": "assumption-only",
            "evidenceIds": [source["source"]],
            **{
                lever: value
                for lever, value in _treatment_posterior(treatment, rng, draw_count).items()
            },
        }
    package = {
        "schemaVersion": "1.0.0",
        "drawCount": draw_count,
        "status": "assumption-only",
        "treatments": treatments,
    }
    _write_json(output_directory / "treatment-posteriors.json", package, compact=True)
    return package


def export_posterior_package(
    reference_classes: dict,
    draws: dict,
    validation: dict,
    evidence_manifest: dict,
    output_directory: Path,
    model_metadata: dict,
) -> None:
    output_directory.mkdir(parents=True, exist_ok=True)
    _write_json(output_directory / "reference-classes.json", reference_classes)
    class_files = {}
    for class_name, class_draws in draws["classes"].items():
        filename = f"posterior-{class_name}.json"
        _write_json(output_directory / filename, {
            "drawCount": draws["drawCount"],
            "class": class_name,
            "draws": class_draws,
        }, compact=True)
        class_files[class_name] = filename
    _write_json(output_directory / "calibration-report.json", validation)
    files = [
        "reference-classes.json",
        "calibration-report.json",
        "treatment-posteriors.json",
        *class_files.values(),
    ]
    hashes = {name: sha256_file(output_directory / name) for name in files}
    activation_passed = validation.get("status") == "reference-posterior-validated"
    manifest = {
        "schemaVersion": "1.0.0",
        "modelId": model_metadata["modelId"],
        "modelVersion": model_metadata["modelVersion"],
        "calibrationVersion": model_metadata["calibrationVersion"],
        "methodologyVersion": model_metadata["methodologyVersion"],
        "packageVersion": model_metadata["packageVersion"],
        "evidencePackageVersion": evidence_manifest["packageVersion"],
        "active": bool(activation_passed),
        "status": validation.get("status", "not-validated"),
        "synthetic": False,
        "drawCount": draws["drawCount"],
        "seed": model_metadata["seed"],
        "files": {
            "referenceClasses": "reference-classes.json",
            "calibrationReport": "calibration-report.json",
            "treatmentPosteriors": "treatment-posteriors.json",
            "posteriorDraws": class_files,
        },
        "hashes": hashes,
        "validationReport": "calibration-report.json",
        "generatedAt": model_metadata["generatedAt"],
    }
    _write_json(output_directory / "manifest.json", manifest)
