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

// A single local-gradient reading (see imageGradient.ts): `angle` is the
// direction (radians) of steepest LUMINANCE INCREASE at this point, and
// `magnitude` is normalized to [0,1] against the source field's own
// maximum - so "near flat" can be tested as a fraction of the busiest
// region in that particular image, not an absolute unit that varies with
// source contrast.
export interface GradientSample {
    angle: number;
    magnitude: number;
}

// Read-only accessor over a raster-origin image's local luminance gradient.
// Keyed by a point plus the view's current size rather than raw pixel
// coordinates, so it stays correct regardless of the source raster's native
// resolution or whatever physical mm size the view ends up at render time -
// both the source raster and the render view cover the same [0, size]
// extent, just at different absolute scales.
//
// Returns undefined only when the field genuinely has no data for this
// point (e.g. a degenerate field); a defined sample with a near-zero
// magnitude is a real reading ("this area of the image is locally flat"),
// which callers should treat differently from "no data here at all".
export interface GradientFieldLookup {
    sampleAt(point: paper.Point, viewSize: paper.Size): GradientSample | undefined;
}

// Read-only state shared across every path filled within a single
// generateInfills() call. `cache` is a scratch space strategies may use to
// memoize expensive per-spacing precomputation (e.g. a line grid) across the
// paths of one call; it is fresh per call, so nothing leaks between renders.
export interface FillContext {
    view: paper.View;
    boundsPath: paper.Path;
    cache: Map<string, unknown>;
    // Populated only when this render's source SVG carries a raster-origin
    // gradient field (see infill.ts's generateInfills and vectorizer.ts's
    // withGradientField) - i.e. the Vector->Raster->Vector path or a
    // grayscale/color raster separation, where a real source luminance
    // field exists to follow. Absent for pure vector-origin SVGs (no
    // gradient to speak of) and for any render that didn't go through
    // vectorize() at all. Purely additive and optional: crossHatch45 and
    // any other strategy that doesn't know about it simply never reads it,
    // so this cannot change their behavior.
    gradientField?: GradientFieldLookup;
}

export interface FillStrategy {
    name: string;
    // Produces the ink paths that fill `path` at the given target
    // coverage/spacing. Implementations decide internally how to hit
    // that target (line spacing, ring pitch, curve order, ...).
    generateFill(path: paper.PathItem, params: FillParams, ctx: FillContext): paper.Path[];
}
