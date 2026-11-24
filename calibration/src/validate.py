"""Calibration diagnostics for the offline QuickRisk reference model."""

from __future__ import annotations

import math
from bisect import bisect_left, bisect_right
from statistics import NormalDist


def _mean(values: list[float]) -> float:
    return sum(values) / len(values) if values else 0.0


def _quantile(sorted_values: list[float], probability: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = min(1.0, max(0.0, probability)) * (len(sorted_values) - 1)
    lower = int(math.floor(position))
    upper = int(math.ceil(position))
    if lower == upper:
        return sorted_values[lower]
    fraction = position - lower
    return sorted_values[lower] + fraction * (sorted_values[upper] - sorted_values[lower])


def interval_coverage(
    samples: list[float],
    observations: list[float],
    levels: list[float],
) -> dict:
    ordered = sorted(float(value) for value in samples)
    output = {}
    for level in levels:
        if not 0.0 < level < 1.0:
            raise ValueError("Coverage levels must lie between zero and one")
        lower = _quantile(ordered, (1.0 - level) / 2.0)
        upper = _quantile(ordered, (1.0 + level) / 2.0)
        covered = sum(1 for value in observations if lower <= float(value) <= upper)
        output[str(level)] = {
            "lower": lower,
            "upper": upper,
            "covered": covered,
            "total": len(observations),
            "coverage": covered / len(observations) if observations else 0.0,
        }
    return output


def probability_integral_transform(samples: list[float], observations: list[float]) -> list[float]:
    ordered = sorted(float(value) for value in samples)
    total = len(ordered)
    if total == 0:
        return []
    transformed = []
    for observation in observations:
        lower = bisect_left(ordered, float(observation))
        upper = bisect_right(ordered, float(observation))
        transformed.append((lower + 0.5 * (upper - lower)) / total)
    return transformed


def brier_score(probabilities: list[float], outcomes: list[int]) -> float:
    if len(probabilities) != len(outcomes) or not outcomes:
        raise ValueError("Brier inputs must be non-empty and equal length")
    return _mean([
        (min(1.0, max(0.0, float(probability))) - float(outcome)) ** 2
        for probability, outcome in zip(probabilities, outcomes)
    ])


def log_score(samples: list[float], observations: list[float], bandwidth: float = 0.05) -> float:
    ordered = sorted(float(value) for value in samples)
    if not ordered or not observations:
        raise ValueError("Log-score inputs must be non-empty")
    scores = []
    for observation in observations:
        target = float(observation)
        density = 0.0
        for value in ordered:
            z = (target - value) / bandwidth
            density += math.exp(-0.5 * z * z)
        density /= len(ordered) * bandwidth * math.sqrt(2.0 * math.pi)
        scores.append(math.log(max(density, 1.0e-300)))
    return -_mean(scores)


def crps(samples: list[float], observations: list[float]) -> list[float]:
    ordered = sorted(float(value) for value in samples)
    if not ordered or not observations:
        raise ValueError("CRPS inputs must be non-empty")
    values = []
    for observation in observations:
        target = float(observation)
        first = _mean([abs(float(value) - target) for value in ordered])
        second = 0.0
        for left in range(len(ordered)):
            for right in range(len(ordered)):
                second += abs(ordered[left] - ordered[right])
        second /= 2.0 * len(ordered) ** 2
        values.append(first - second)
    return values


def prior_predictive_check(model: dict, rng) -> dict:
    classes = {}
    for name, reference in model["classes"].items():
        prevalence = reference["prevalence"]
        materiality = reference["materiality"]
        severity = reference["severity"]
        p_attack = rng.betavariate(prevalence["alpha"], prevalence["beta"])
        p_material = rng.betavariate(materiality["alpha"], materiality["beta"])
        classes[name] = {
            "attackProbability": p_attack,
            "materialProbability": p_material,
            "materialLossRate": -math.log(max(1.0e-12, 1.0 - p_attack)) * p_material,
            "severityMedianEUR": math.exp(float(severity["mu"]) + float(reference["severityMeanLogOffset"])),
            "severity95thEUR": math.exp(
                float(severity["mu"])
                + float(reference["severityMeanLogOffset"])
                + NormalDist().inv_cdf(0.95) * float(severity["sigma"])
            ),
            "sourceEstimate": prevalence["sourceEstimate"],
            "sourceBase": prevalence["sourceBase"],
        }
    return {"classes": classes}


def posterior_predictive_check(model: dict, observations: dict | None, rng) -> dict:
    normal = NormalDist()
    classes = {}
    all_passed = True
    for name, reference in model["classes"].items():
        severity = reference["severity"]
        # The fitted quantiles describe the source reference class. Any explicit
        # large-organisation log offset is a separate assumption and must not be
        # scored as if it were part of the source fit.
        mu = float(severity["mu"])
        sigma = float(severity["sigma"])
        fitted_quantiles = severity.get("fittedQuantiles", [])
        errors = []
        calibration_errors = []
        for probability, log_value in fitted_quantiles:
            predicted_value = math.exp(mu + normal.inv_cdf(float(probability)) * sigma)
            observed_value = math.exp(float(log_value))
            errors.append(abs(math.log(predicted_value / observed_value)))
            predicted_probability = normal.cdf((math.log(observed_value) - mu) / sigma)
            calibration_errors.append(abs(predicted_probability - float(probability)))
        if not fitted_quantiles:
            classes[name] = {
                "status": "not-applicable",
                "meanAbsoluteLogQuantileError": None,
                "meanAbsoluteCalibrationError": None,
                "source": severity.get("classification", ""),
                "passed": True,
                "note": "The source publishes a mean but no quantiles, so quantile calibration is not applicable.",
            }
            continue
        mean_log_error = _mean(errors)
        mean_calibration_error = _mean(calibration_errors)
        passed = mean_log_error <= 0.35 and mean_calibration_error <= 0.08
        all_passed = all_passed and passed
        classes[name] = {
            "status": "calibrated",
            "meanAbsoluteLogQuantileError": mean_log_error,
            "meanAbsoluteCalibrationError": mean_calibration_error,
            "source": severity.get("classification", ""),
            "passed": passed,
        }
    return {
        "status": "passed" if all_passed else "failed",
        "classes": classes,
        "observationsSupplied": observations is not None,
    }


def validate_holdout_waves(model: dict, holdouts: list[dict], rng) -> dict:
    results = []
    passed = True
    for entry in holdouts:
        class_name = entry["sizeClass"]
        reference = model["classes"].get(class_name)
        if reference is None:
            raise ValueError(f"Unknown holdout class {class_name}")
        samples = [
            rng.betavariate(reference["prevalence"]["alpha"], reference["prevalence"]["beta"])
            for _ in range(4000)
        ]
        coverage = interval_coverage(samples, [float(entry["estimate"])], [0.8, 0.95])
        entry_passed = coverage["0.8"]["coverage"] == 1.0
        passed = passed and entry_passed
        results.append({
            "sizeClass": class_name,
            "observed": float(entry["estimate"]),
            "source": entry.get("source", ""),
            "coverage": coverage,
            "passed": entry_passed,
        })
    return {"status": "passed" if passed else "failed", "holdouts": results}


def holdout_entries(dsit_previous: dict) -> list[dict]:
    entries = []
    for item in dsit_previous.get("prevalence", {}).get("classes", []):
        entries.append({
            "sizeClass": item["sizeClass"],
            "estimate": float(item["estimate"]),
            "source": dsit_previous.get("sourceId", ""),
        })
    return entries
