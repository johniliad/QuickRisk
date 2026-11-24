"""Reference-class Bayesian model for QuickRisk 2.0.

The model is fitted offline from versioned public aggregate evidence. The runtime
receives posterior draws only; it does not fit, fetch evidence or run MCMC.
"""

from __future__ import annotations

import json
import math
import random
from pathlib import Path
from statistics import NormalDist

SCENARIOS = ("S1", "S2", "S3", "S4", "S5")
CLASSES = ("micro", "small", "medium", "large", "large_enterprise", "unknown")

CLASS_MAP = {
    "LT10M": "micro",
    "10_50M": "small",
    "50_250M": "medium",
    "250M_1B": "large",
    "GT1B": "large_enterprise",
    "UNKNOWN": "unknown",
}

SEVERITY_CLASS = {
    "micro": "micro_small",
    "small": "micro_small",
    "medium": "medium_large",
    "large": "medium_large",
    "large_enterprise": "all",
    "unknown": "all",
}


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8-sig") as handle:
        value = json.load(handle)
    if not isinstance(value, dict):
        raise ValueError(f"Expected a JSON object in {path}")
    return value


def load_evidence(directory: Path) -> dict:
    manifest = load_json(directory / "manifest.json")
    loaded = {"manifest": manifest}
    for source in manifest["sources"]:
        loaded[source["id"]] = load_json(directory / source["file"])
    return loaded


def beta_from_count(successes: float, trials: float, prior_strength: float = 1.0) -> dict:
    successes = min(max(float(successes), 0.0), float(trials))
    trials = max(float(trials), successes + 1.0e-9)
    alpha = prior_strength * 0.5 + successes
    beta = prior_strength * 0.5 + trials - successes
    return {
        "alpha": alpha,
        "beta": beta,
        "mean": alpha / (alpha + beta),
        "variance": (alpha * beta) / (((alpha + beta) ** 2) * (alpha + beta + 1.0)),
    }


def fit_lognormal_quantiles(quantiles: list[dict]) -> dict:
    """Fit lognormal mu/sigma by least squares on supplied log quantiles."""
    if len(quantiles) < 2:
        raise ValueError("At least two severity quantiles are required")
    pairs = [
        (float(entry["probability"]), math.log(float(entry["value"])))
        for entry in quantiles
        if 0.0 < float(entry["probability"]) < 1.0 and float(entry["value"]) > 0.0
    ]
    if len(pairs) < 2:
        raise ValueError("No usable positive severity quantiles")
    normal = NormalDist()

    def residual(sigma: float) -> tuple[float, float]:
        z_values = [normal.inv_cdf(probability) for probability, _ in pairs]
        mu = sum(log_value - sigma * z for (_, log_value), z in zip(pairs, z_values)) / len(pairs)
        error = sum((log_value - (mu + sigma * z)) ** 2 for (_, log_value), z in zip(pairs, z_values))
        return error, mu

    low, high = 0.05, 3.0
    golden = (math.sqrt(5.0) - 1.0) / 2.0
    left = high - golden * (high - low)
    right = low + golden * (high - low)
    for _ in range(100):
        left_error = residual(left)[0]
        right_error = residual(right)[0]
        if left_error <= right_error:
            high = right
            right = left
            left = high - golden * (high - low)
        else:
            low = left
            left = right
            right = low + golden * (high - low)
    sigma = (low + high) / 2.0
    error, mu = residual(sigma)
    return {
        "mu": mu,
        "sigma": sigma,
        "mean": math.exp(mu + sigma * sigma / 2.0),
        "median": math.exp(mu),
        "squaredLogError": error,
        "fittedQuantiles": pairs,
    }


def _fx_rate(evidence: dict, currency: str) -> float:
    for rate in evidence["ecb-annual-reference-rates-2025"]["rates"]:
        if rate["currency"] == currency:
            return float(rate["eurPerUnit"])
    raise ValueError(f"No ECB conversion for {currency}")


def _prevalence_for(dsit: dict, size_class: str) -> dict:
    for entry in dsit["prevalence"]["classes"]:
        if entry["sizeClass"] == size_class:
            return entry
    raise ValueError(f"Missing prevalence class {size_class}")


def _materiality_for(dsit: dict, severity_class: str) -> dict:
    for entry in dsit["materialFinancialCost"]["classes"]:
        if entry["sizeClass"] == severity_class:
            return entry
    raise ValueError(f"Missing materiality class {severity_class}")


def _severity_for(dsit: dict, severity_class: str) -> dict:
    for entry in dsit["positiveCostSeverity"]["classes"]:
        if entry["sizeClass"] == severity_class:
            return entry
    raise ValueError(f"Missing severity class {severity_class}")


def build_reference_classes(evidence: dict) -> dict:
    dsit = evidence["dsit-csbs-2025-2026"]
    ibm = evidence["ibm-cost-of-a-data-breach-2025"]
    gbp_eur = _fx_rate(evidence, "GBP")
    usd_eur = _fx_rate(evidence, "USD")
    classes: dict[str, dict] = {}

    for name in CLASSES:
        source_size = {
            "micro": "micro", "small": "small", "medium": "medium",
            "large": "large", "large_enterprise": "large", "unknown": "unknown",
        }[name]
        prevalence = _prevalence_for(dsit, source_size)
        # Cap survey effective sample size so the reference posterior retains
        # transportability and year-to-year variation instead of behaving like a census.
        strength = max(40.0, min(float(prevalence["base"]) * 0.25, 80.0))
        prevalence_beta = beta_from_count(prevalence["estimate"] * strength, strength)

        severity_class = SEVERITY_CLASS[name]
        material = _materiality_for(dsit, severity_class)
        material_strength = max(30.0, min(float(material["trials"]) * 0.25, 80.0))
        material_beta = beta_from_count(
            material["estimate"] * material_strength,
            material_strength,
        )

        if name == "large_enterprise":
            sigma = float(ibm["distributionAssumption"]["sigma"])
            mean_eur = float(ibm["averageBreachCost"]) * usd_eur
            mu = math.log(mean_eur) - (sigma * sigma / 2.0)
            severity = {
                "mu": mu, "sigma": sigma, "median": math.exp(mu), "mean": mean_eur,
                "sourceCurrency": "USD", "sourceMean": float(ibm["averageBreachCost"]),
                "classification": "externally-evidenced mean; weak-prior shape",
            }
            severity_mean_offset = 0.0
            severity_offset_sigma = 0.45
        else:
            fitted = fit_lognormal_quantiles(_severity_for(dsit, severity_class)["quantiles"])
            severity = {
                "mu": fitted["mu"] + math.log(gbp_eur),
                "sigma": fitted["sigma"],
                "median": fitted["median"] * gbp_eur,
                "mean": fitted["mean"] * gbp_eur,
                "sourceCurrency": "GBP",
                "classification": "externally-evidenced quantiles; fitted lognormal",
                "squaredLogError": fitted["squaredLogError"],
                "fittedQuantiles": fitted["fittedQuantiles"],
            }
            severity_mean_offset = 0.5 if name == "large" else 0.0
            severity_offset_sigma = 0.55 if name == "large" else 0.35

        classes[name] = {
            "qp1Codes": [code for code, mapped in CLASS_MAP.items() if mapped == name],
            "prevalence": {
                **prevalence_beta,
                "sourceId": "dsit-csbs-2025-2026",
                "sourceEstimate": prevalence["estimate"],
                "sourceBase": prevalence["base"],
            },
            "materiality": {
                **material_beta,
                "sourceId": "dsit-csbs-2025-2026",
                "derivation": "non-zero-cost base divided by published attack base",
            },
            "severity": severity,
            "severityMeanLogOffset": severity_mean_offset,
            "severityOffsetSigma": severity_offset_sigma,
            "primaryShare": {"alpha": 7.0, "beta": 3.0, "classification": "elicitation-assumption"},
        }

    return {
        "schemaVersion": "1.0.0",
        "classes": classes,
        "scenarioOrder": list(SCENARIOS),
        "scenarioWeightPrior": {
            "alpha": [1.0, 1.0, 1.0, 1.0, 1.0],
            "classification": "weak-elicitation-prior",
        },
        "scenarioFrequencyLogSigma": 0.30,
        "scenarioSeverityLogSigma": 0.25,
        "scenarioMaterialityLogitSigma": 0.30,
        "questionnaireModel": {
            "classification": "elicitation-assumption; sensitivity-required",
            "frequencyLogSigma": 0.45,
            "impactLogSigma": 0.35,
            "frequencyFactors": {
                "VERY_UNLIKELY": 0.10, "UNLIKELY": 0.30, "POSSIBLE": 1.00,
                "LIKELY": 3.00, "VERY_LIKELY": 10.00, "UNKNOWN": 1.00,
            },
            "impactFactors": {
                "MINOR": 0.30, "MODERATE": 0.65, "SIGNIFICANT": 1.00,
                "SEVERE": 2.50, "CRITICAL": 6.00, "UNKNOWN": 1.00,
            },
            "profileFrequencyFactors": {
                "QP3": {
                    "LIMITED": 0.70, "MODERATE": 0.90, "SIGNIFICANT": 1.00,
                    "EXTENSIVE": 1.25, "VERY_EXTENSIVE": 1.50, "UNKNOWN": 1.00,
                }
            },
            "profileMaterialityOddsFactors": {
                "QP7": {
                    "VERY_LIMITED": 1.80, "LIMITED": 1.40, "MODERATE": 1.00,
                    "STRONG": 0.70, "VERY_STRONG": 0.50, "UNKNOWN": 1.00,
                }
            },
            "profileSeverityFactors": {
                "QP2": {
                    "LOW": 0.60, "MODERATE": 0.80, "HIGH": 1.00,
                    "VERY_HIGH": 1.30, "EXTREME": 1.60, "UNKNOWN": 1.00,
                },
                "QP4": {
                    "LIMITED": 0.50, "MODERATE": 0.75, "SIGNIFICANT": 1.00,
                    "VERY_SIGNIFICANT": 1.35, "CRITICAL": 1.70, "UNKNOWN": 1.00,
                },
                "QP6": {
                    "VERY_LOW": 1.50, "LOW": 1.25, "MODERATE": 1.00,
                    "HIGH": 0.80, "VERY_HIGH": 0.65, "UNKNOWN": 1.00,
                },
            },
            "thirdPartyFrequencyFactor": {
                "QP5": {
                    "LOW": 0.50, "MODERATE": 0.75, "HIGH": 1.00,
                    "VERY_HIGH": 1.35, "EXTREME": 1.70, "UNKNOWN": 1.00,
                }
            },
            "qp8Elasticity": 0.25,
            "qp8ReferenceDailyCostEUR": 200000.0,
        },
    }


def build_joint_parameter_model(reference_classes: dict) -> dict:
    if tuple(reference_classes.get("scenarioOrder", [])) != SCENARIOS:
        raise ValueError("Reference model scenario order is invalid")
    if set(reference_classes.get("classes", {})) != set(CLASSES):
        raise ValueError("Reference model classes are incomplete")
    weights = reference_classes.get("scenarioWeightPrior", {}).get("alpha", [])
    if len(weights) != len(SCENARIOS) or any(float(value) <= 0 for value in weights):
        raise ValueError("Scenario-weight prior is invalid")
    return reference_classes


def _dirichlet(rng: random.Random, alpha: list[float]) -> list[float]:
    draws = [rng.gammavariate(max(float(value), 1.0e-9), 1.0) for value in alpha]
    total = sum(draws)
    if total <= 0.0:
        raise ValueError("Dirichlet draw failed")
    return [value / total for value in draws]


def sample_joint_posterior(model: dict, draw_count: int, rng: random.Random) -> dict:
    if draw_count < 100:
        raise ValueError("At least 100 joint posterior draws are required")
    output: dict[str, list[dict]] = {}
    alpha = [float(value) for value in model["scenarioWeightPrior"]["alpha"]]
    for name, reference in model["classes"].items():
        draws: list[dict] = []
        prevalence = reference["prevalence"]
        material = reference["materiality"]
        share = reference["primaryShare"]
        severity_sigma = float(reference["severity"]["sigma"])
        severity_mu = float(reference["severity"]["mu"]) + float(reference["severityMeanLogOffset"])
        for _ in range(draw_count):
            p_attack = rng.betavariate(prevalence["alpha"], prevalence["beta"])
            p_material = rng.betavariate(material["alpha"], material["beta"])
            draws.append({
                "attackRate": -math.log(max(1.0e-12, 1.0 - p_attack)),
                "materialProbability": min(0.995, max(0.005, p_material)),
                "severityMu": severity_mu + rng.gauss(0.0, float(reference["severityOffsetSigma"])),
                "severitySigma": min(3.0, max(0.05, severity_sigma * math.exp(rng.gauss(0.0, 0.08)))),
                "primaryShare": min(0.995, max(0.005, rng.betavariate(share["alpha"], share["beta"]))),
                "scenarioWeights": _dirichlet(rng, alpha),
                "scenarioFrequencyLogOffsets": [
                    rng.gauss(0.0, model["scenarioFrequencyLogSigma"]) for _ in SCENARIOS
                ],
                "scenarioSeverityLogOffsets": [
                    rng.gauss(0.0, model["scenarioSeverityLogSigma"]) for _ in SCENARIOS
                ],
                "scenarioMaterialityLogitOffsets": [
                    rng.gauss(0.0, model["scenarioMaterialityLogitSigma"]) for _ in SCENARIOS
                ],
            })
        output[name] = draws
    return {"drawCount": draw_count, "classes": output}
