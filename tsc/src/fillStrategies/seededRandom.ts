// Tiny deterministic PRNG (mulberry32) for jitteredHatch.ts.
//
// This repo has no existing Math.random() usage for anything that affects
// drawn output (grep confirms the only Math.random()/Date.now() hits in
// src/ are optimizer.ts's 2-opt time-budget check, which is a wall-clock
// perf cutoff, not part of the geometry it produces). Command-file
// generation is otherwise fully deterministic given the same input SVG/
// request, which is worth preserving even for a "just visual jitter"
// strategy: a re-run of the same plot should draw exactly the same lines,
// and tests asserting on jitteredHatch's output need reproducible
// coordinates. Hence a seeded PRNG rather than Math.random().
export type Random = () => number;

// Returns a function producing floats in [0, 1), deterministic for a given
// seed. Standard mulberry32 implementation.
export function mulberry32(seed: number): Random {
    let state = seed >>> 0;
    return function random() {
        state = (state + 0x6D2B79F5) | 0;
        let t = Math.imul(state ^ (state >>> 15), 1 | state);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
