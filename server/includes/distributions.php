<?php

declare(strict_types=1);

require_once __DIR__ . '/mt19937.php';

/**
 * FAIR QuickRisk — probability distribution utilities.
 *
 * Deliberately small, explicit and inspectable. Triangular is the v1 default;
 * PERT is provided for later calibration revisions. All samplers are bounded and
 * can never return NaN or INF.
 */
final class QkDistributions
{
    private bool $seeded = false;

    private QkMt19937 $generator;

    /**
     * Seeds the generator. A seed lives only in process memory for the duration
     * of one calculation and is never persisted.
     */
    public function __construct(?int $seed = null)
    {
        $this->seed($seed ?? random_int(1, 2147483646));
    }

    public function seed(int $seed): void
    {
        $this->generator = new QkMt19937($seed);
        $this->seeded = true;
    }

    public function isSeeded(): bool
    {
        return $this->seeded;
    }

    /**
     * Uniform draw on [0, 1).
     */
    public function uniform(): float
    {
        return $this->generator->nextInt31() / 2147483648.0;
    }

    /**
     * Inverse-transform sample from a triangular distribution.
     *
     * Degenerate cases are handled explicitly so that a zero-width or
     * mode-equals-bound range cannot produce NaN or a division by zero.
     */
    public function sampleTriangular(float $min, float $mode, float $max): float
    {
        [$a, $m, $b] = self::normaliseRange($min, $mode, $max);

        if ($b - $a <= 1e-12) {
            return $a;
        }

        $u = $this->uniform();
        $split = ($m - $a) / ($b - $a);

        if ($u < $split) {
            $value = $a + sqrt($u * ($b - $a) * ($m - $a));
        } else {
            $value = $b - sqrt((1.0 - $u) * ($b - $a) * ($b - $m));
        }

        if (!is_finite($value)) {
            return $m;
        }

        return self::clamp($value, $a, $b);
    }

    /**
     * Sample from a lognormal distribution whose underlying normal has mean
     * $mu and standard deviation $sigma. The result is always positive and
     * finite. Used for heavy-tailed loss magnitudes.
     */
    public function sampleLognormal(float $mu, float $sigma): float
    {
        if (!is_finite($mu)) {
            $mu = 0.0;
        }
        if (!is_finite($sigma) || $sigma <= 0.0) {
            return exp(max(-50.0, min(50.0, $mu)));
        }

        $u1 = max(1.0e-12, $this->uniform());
        $u2 = $this->uniform();
        $z = sqrt(-2.0 * log($u1)) * cos(2.0 * M_PI * $u2);
        $value = exp($mu + $sigma * $z);

        return is_finite($value) ? max(1.0e-12, $value) : exp(max(-50.0, min(50.0, $mu)));
    }

    /**
     * Modified-PERT (beta-PERT) sample. Provided for later calibration
     * revisions; not used by the v1 default model.
     */
    public function samplePert(float $min, float $mode, float $max, float $lambda = 4.0): float
    {
        [$a, $m, $b] = self::normaliseRange($min, $mode, $max);

        if ($b - $a <= 1e-12) {
            return $a;
        }
        if ($lambda <= 0.0) {
            $lambda = 4.0;
        }

        $alpha = 1.0 + $lambda * (($m - $a) / ($b - $a));
        $beta = 1.0 + $lambda * (($b - $m) / ($b - $a));

        $value = $a + self::sampleBeta($alpha, $beta) * ($b - $a);

        if (!is_finite($value)) {
            return $m;
        }

        return self::clamp($value, $a, $b);
    }

    /**
     * Bernoulli draw. Returns true with probability $probability.
     */
    public function sampleBernoulli(float $probability): bool
    {
        if (!is_finite($probability)) {
            return false;
        }
        if ($probability <= 0.0) {
            return false;
        }
        if ($probability >= 1.0) {
            return true;
        }

        return $this->uniform() < $probability;
    }

    /**
     * Beta sample via two Gamma samples (Marsaglia–Tsang). Used only by PERT.
     */
    private function sampleBeta(float $alpha, float $beta): float
    {
        $x = $this->sampleGamma($alpha);
        $y = $this->sampleGamma($beta);
        $sum = $x + $y;

        if ($sum <= 0.0 || !is_finite($sum)) {
            return 0.5;
        }

        return self::clamp($x / $sum, 0.0, 1.0);
    }

    private function sampleGamma(float $shape): float
    {
        if ($shape < 1.0) {
            $u = max($this->uniform(), 1e-12);

            return $this->sampleGamma($shape + 1.0) * ($u ** (1.0 / $shape));
        }

        $d = $shape - (1.0 / 3.0);
        $c = 1.0 / sqrt(9.0 * $d);

        for ($attempt = 0; $attempt < 64; $attempt++) {
            $x = self::standardNormal($this->uniform());
            $v = (1.0 + $c * $x) ** 3;
            if ($v <= 0.0) {
                continue;
            }
            $u = max($this->uniform(), 1e-12);
            if (log($u) < (0.5 * $x * $x) + ($d - ($d * $v)) + ($d * log($v))) {
                return max($d * $v, 1e-12);
            }
        }

        return max($shape, 1e-12);
    }

    /**
     * Inverse standard normal CDF (Acklam's rational approximation).
     */
    private static function standardNormal(float $p): float
    {
        $p = self::clamp($p, 1e-12, 1.0 - 1e-12);

        $a = [-3.969683028665376e+01, 2.209460984245205e+02, -2.759285104469687e+02,
            1.383577518672690e+02, -3.066479806614716e+01, 2.506628277459239e+00];
        $b = [-5.447609879822406e+01, 1.615858368580409e+02, -1.556989798598866e+02,
            6.680131188771972e+01, -1.328068155288572e+01];
        $c = [-7.784894002430293e-03, -3.223964580411365e-01, -2.400758277161838e+00,
            -2.549732539343734e+00, 4.374664141464968e+00, 2.938163982698783e+00];
        $d = [7.784695709041462e-03, 3.224671290700398e-01, 2.445134137142996e+00,
            3.754408661907416e+00];

        $plow = 0.02425;
        $phigh = 1.0 - $plow;

        if ($p < $plow) {
            $q = sqrt(-2.0 * log($p));
            $value = ((((($c[0] * $q + $c[1]) * $q + $c[2]) * $q + $c[3]) * $q + $c[4]) * $q + $c[5])
                / (((($d[0] * $q + $d[1]) * $q + $d[2]) * $q + $d[3]) * $q + 1.0);
        } elseif ($p <= $phigh) {
            $q = $p - 0.5;
            $r = $q * $q;
            $value = (((((($a[0] * $r + $a[1]) * $r + $a[2]) * $r + $a[3]) * $r + $a[4]) * $r + $a[5]) * $q)
                / ((((($b[0] * $r + $b[1]) * $r + $b[2]) * $r + $b[3]) * $r + $b[4]) * $r + 1.0);
        } else {
            $q = sqrt(-2.0 * log(1.0 - $p));
            $value = -((((($c[0] * $q + $c[1]) * $q + $c[2]) * $q + $c[3]) * $q + $c[4]) * $q + $c[5])
                / (((($d[0] * $q + $d[1]) * $q + $d[2]) * $q + $d[3]) * $q + 1.0);
        }

        return is_finite($value) ? $value : 0.0;
    }

    /**
     * Normalises a (min, mode, max) triple so that min <= mode <= max and the
     * ordering invariant always holds.
     *
     * @return array{0:float,1:float,2:float}
     */
    public static function normaliseRange(float $min, float $mode, float $max): array
    {
        if (!is_finite($min) || !is_finite($mode) || !is_finite($max)) {
            throw new InvalidArgumentException('Distribution range contains a non-finite value.');
        }

        if ($max < $min) {
            [$min, $max] = [$max, $min];
        }
        $mode = self::clamp($mode, $min, $max);

        return [$min, $mode, $max];
    }

    public static function clamp(float $value, float $min, float $max): float
    {
        if ($value < $min) {
            return $min;
        }
        if ($value > $max) {
            return $max;
        }

        return $value;
    }

    /**
     * Exact Poisson draw for small and large rates.
     */
    public function samplePoisson(float $lambda): int
    {
        if (!is_finite($lambda) || $lambda < 0.0) {
            throw new InvalidArgumentException('Poisson lambda must be finite and non-negative.');
        }
        if ($lambda === 0.0) {
            return 0;
        }

        return $lambda < 30.0
            ? $this->samplePoissonKnuth($lambda)
            : $this->samplePoissonPtrs($lambda);
    }

    /**
     * Deterministic inverse-CDF Poisson count on the passed probability.
     */
    public static function poissonQuantile(float $probability, float $lambda): int
    {
        if (!is_finite($lambda) || $lambda < 0.0) {
            throw new InvalidArgumentException('Poisson lambda must be finite and non-negative.');
        }
        if ($lambda === 0.0) {
            return 0;
        }
        $u = self::clamp($probability, 0.0, 1.0 - 1.0e-15);
        $term = exp(-$lambda);
        $cumulative = $term;
        $limit = (int) ceil($lambda + 12.0 * sqrt($lambda) + 30.0);
        for ($count = 0; $count < $limit; $count++) {
            if ($u <= $cumulative) {
                return $count;
            }
            $countPlusOne = $count + 1;
            $term *= $lambda / $countPlusOne;
            $cumulative += $term;
        }

        return $limit;
    }

    private function samplePoissonKnuth(float $lambda): int
    {
        $threshold = exp(-$lambda);
        $product = 1.0;
        $count = 0;
        do {
            $count++;
            $product *= max($this->uniform(), 1.0e-15);
        } while ($product > $threshold && $count < 10000);

        return max(0, $count - 1);
    }

    private function samplePoissonPtrs(float $lambda): int
    {
        $sqrt = sqrt($lambda);
        $b = 0.931 + 2.53 * $sqrt;
        $a = -0.059 + 0.02483 * $b;
        $inverseAlpha = 1.1239 + 1.1328 / ($b - 3.4);
        $vR = 0.9277 - 3.6224 / ($b - 2.0);

        for ($attempt = 0; $attempt < 10000; $attempt++) {
            $u = $this->uniform() - 0.5;
            $v = max($this->uniform(), 1.0e-15);
            $us = 0.5 - abs($u);
            if ($us <= 0.0) {
                continue;
            }
            $k = (int) floor(((2.0 * $a / $us) + $b) * $u + $lambda + 0.43);
            if ($us >= 0.07 && $v <= $vR) {
                return max(0, $k);
            }
            if ($k < 0 || ($us < 0.013 && $v > $us)) {
                continue;
            }
            $left = log($v * $inverseAlpha / (($a / ($us * $us)) + $b));
            $right = (-$lambda + $k * log($lambda)) - self::logFactorial($k);
            if ($left <= $right) {
                return $k;
            }
        }

        return self::poissonQuantile($this->uniform(), $lambda);
    }

    private static function logFactorial(int $value): float
    {
        static $cache = [0 => 0.0];
        if (isset($cache[$value])) {
            return $cache[$value];
        }
        $maximum = max(array_keys($cache));
        for ($index = $maximum + 1; $index <= $value; $index++) {
            $cache[$index] = $cache[$index - 1] + log($index);
        }

        return $cache[$value];
    }

    /**
     * Theoretical mean of a triangular distribution.
     */
    public static function triangularMean(float $min, float $mode, float $max): float
    {
        [$a, $m, $b] = self::normaliseRange($min, $mode, $max);

        return ($a + $m + $b) / 3.0;
    }

    /**
     * Theoretical variance of a triangular distribution.
     */
    public static function triangularVariance(float $min, float $mode, float $max): float
    {
        [$a, $m, $b] = self::normaliseRange($min, $mode, $max);

        return (($a * $a) + ($m * $m) + ($b * $b) - ($a * $m) - ($a * $b) - ($m * $b)) / 18.0;
    }

    /**
     * Theoretical mean of a lognormal distribution.
     */
    public static function lognormalMean(float $mu, float $sigma): float
    {
        return exp($mu + 0.5 * $sigma * $sigma);
    }

    /**
     * Theoretical variance of a lognormal distribution.
     */
    public static function lognormalVariance(float $mu, float $sigma): float
    {
        return (exp($sigma * $sigma) - 1.0) * exp(2.0 * $mu + $sigma * $sigma);
    }

    /**
     * Moment-matches a triangular (min, mode, max) to lognormal (mu, sigma).
     *
     * The resulting lognormal shares the triangular's mean and variance but has
     * heavier right tails, reflecting the empirically heavy-tailed nature of
     * cyber-loss costs.
     *
     * @return array{mu:float,sigma:float}
     */
    public static function triangularToLognormalParameters(float $min, float $mode, float $max): array
    {
        [$a, $m, $b] = self::normaliseRange($min, $mode, $max);
        $mean = ($a + $m + $b) / 3.0;
        $variance = (($a * $a) + ($m * $m) + ($b * $b) - ($a * $m) - ($a * $b) - ($m * $b)) / 18.0;

        if ($mean <= 0.0 || !is_finite($mean)) {
            return ['mu' => log(1.0e-12), 'sigma' => 0.0];
        }
        if ($variance <= 0.0 || !is_finite($variance)) {
            return ['mu' => log($mean), 'sigma' => 0.0];
        }

        $sigmaSquared = log(1.0 + $variance / ($mean * $mean));
        $sigma = sqrt(max(0.0, $sigmaSquared));
        $mu = log($mean) - 0.5 * $sigmaSquared;

        return ['mu' => $mu, 'sigma' => $sigma];
    }

    /**
     * Quantile function of a lognormal distribution.
     */
    public static function lognormalQuantile(float $mu, float $sigma, float $probability): float
    {
        $p = self::clamp($probability, 1.0e-12, 1.0 - 1.0e-12);
        $value = exp($mu + $sigma * self::standardNormal($p));

        return is_finite($value) ? max(1.0e-12, $value) : exp($mu);
    }
}
