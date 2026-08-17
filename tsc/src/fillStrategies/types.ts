// The fill-strategy seam: generateInfills (infill.ts) resolves *which*
// spacing/density applies to a path and hands the actual ink-generation work
// off to one of these. Everything strategy-specific (hatch angle, line
// clipping, ring pitch, curve order, ...) lives behind this interface so
// infill.ts's orchestration never needs to know how a given strategy fills a
// shape - only that it does.

// Target coverage for a single path's fill. Strategies decide internally how
// to hit this target (line spacing, ring pitch, ...); `minInfillLength`
// mirrors the existing "drop segments shorter than this" behavior so the
// default strategy's gap-splitting can move behind the interface unchanged.
export interface FillParams {
    spacingMm: number;
    minInfillLength: number;
}

// Read-only state shared across every path filled within a single
// generateInfills() call. `cache` is a scratch space strategies may use to
// memoize expensive per-spacing precomputation (e.g. a line grid) across the
// paths of one call; it is fresh per call, so nothing leaks between renders.
export interface FillContext {
    view: paper.View;
    boundsPath: paper.Path;
    cache: Map<string, unknown>;
}

export interface FillStrategy {
    name: string;
    // Produces the ink paths that fill `path` at the given target
    // coverage/spacing. Implementations decide internally how to hit
    // that target (line spacing, ring pitch, curve order, ...).
    generateFill(path: paper.PathItem, params: FillParams, ctx: FillContext): paper.Path[];
}
