<?php

declare(strict_types=1);

/**
 * Object-local MT19937 generator matching PHP's mt_rand(..., MT_RAND_MT19937)
 * output range without sharing process-global RNG state.
 */
final class QkMt19937
{
    private const MASK = 0xFFFFFFFF;
    private const N = 624;
    private const M = 397;

    /** @var array<int,int> */
    private array $state = [];

    private int $index = self::N;

    public function __construct(int $seed)
    {
        $seed &= self::MASK;
        $this->state[0] = $seed;
        for ($index = 1; $index < self::N; $index++) {
            $previous = $this->state[$index - 1];
            $this->state[$index] = (
                1812433253 * ($previous ^ ($previous >> 30)) + $index
            ) & self::MASK;
        }
    }

    /** Returns the same 31-bit range PHP exposes through mt_rand(). */
    public function nextInt31(): int
    {
        if ($this->index >= self::N) {
            $this->twist();
        }

        $value = $this->state[$this->index++];
        $value ^= $value >> 11;
        $value ^= ($value << 7) & 0x9D2C5680;
        $value ^= ($value << 15) & 0xEFC60000;
        $value ^= $value >> 18;

        return ($value & self::MASK) >> 1;
    }

    private function twist(): void
    {
        for ($index = 0; $index < self::N; $index++) {
            $value = ($this->state[$index] & 0x80000000)
                | ($this->state[($index + 1) % self::N] & 0x7FFFFFFF);
            $twisted = $this->state[($index + self::M) % self::N]
                ^ ($value >> 1)
                ^ (($value & 1) === 1 ? 0x9908B0DF : 0);
            $this->state[$index] = $twisted & self::MASK;
        }
        $this->index = 0;
    }
}
