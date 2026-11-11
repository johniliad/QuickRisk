<?php

declare(strict_types=1);

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

    /**
     * Seeds the generator. A seed lives only in process memory for the duration
     * of one calculation and is never persisted.
     */
    public function __construct(?int $seed = null)
    {
        if ($seed !== null) {
            $this->seed($seed);
        }
    }

    public function seed(int $seed): void
    {
        mt_srand($seed, MT_RAND_MT19937);
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
        return mt_rand() / (mt_getrandmax() + 1);
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
}
