// Sobel-based local luminance gradient field, used by the gradientHatch fill
// strategy (fillStrategies/gradientHatch.ts) so hatch strokes can follow the
// image's local tonal gradient - "engraving style" hatching that wraps
// around the form - instead of a fixed angle.
//
// Deliberately paper.js-free (unlike vectorizer.ts), so it can be unit
// tested in plain Node without needing the native `canvas` addon that
// paper.js 0.12.17 probes for at require() time (see test/testSetup.ts's
// header for the full story): this module only ever touches raw ImageData
// and plain numbers/typed arrays.

// Same luminance weights vectorizer.ts's own `luminance()` helper uses
// (ITU-R BT.601), kept as a separate literal here rather than imported so
// this module has zero dependency on paper.js/paper.Color.
const LUM_R = 0.299;
const LUM_G = 0.587;
const LUM_B = 0.114;

export type GradientField = {
    // Native pixel dimensions of the source raster this field was computed
    // from - needed by sampleGradientField to convert normalized [0,1]
    // fractional coordinates into a cell index.
    widthPx: number;
    heightPx: number;
    // Sample grid spacing (px) between adjacent cells, in both axes.
    cellSizePx: number;
    cols: number;
    rows: number;
    // Direction (radians, atan2 range (-PI, PI]) of steepest LUMINANCE
    // INCREASE at each sample cell - i.e. points from dark toward light,
    // the standard image-gradient convention. Row-major, length
    // cols*rows. A hatch strategy that wants to follow the *isophote*
    // (constant-brightness contour, the usual engraving look) rotates
    // this by +-PI/2.
    angles: Float32Array;
    // Gradient magnitude at each cell, normalized to [0,1] against this
    // field's own maximum - so "near flat" can be tested as a fraction of
    // the busiest region in *this* image, not an absolute Sobel unit that
    // varies with source contrast/exposure.
    magnitudes: Float32Array;
};

// Targets roughly this many sample cells along the longer image axis.
// Coarser than per-pixel by design (the task only needs hatch-placement
// resolution, not per-pixel precision) and keeps both the Sobel pass and
// the serialized field small regardless of source resolution - a 4000px
// photo and a 400px icon both end up with a comparably sized field.
const TARGET_SAMPLES_ALONG_LONG_AXIS = 150;
const MIN_CELL_SIZE_PX = 3;

export function chooseSampleSpacingPx(widthPx: number, heightPx: number): number {
    const longAxis = Math.max(widthPx, heightPx);
    return Math.max(MIN_CELL_SIZE_PX, Math.round(longAxis / TARGET_SAMPLES_ALONG_LONG_AXIS));
}

// Box-blur radius (px) applied to the luminance channel before taking the
// Sobel gradient. Un-blurred source luminance is dominated by per-pixel
// noise/dither/JPEG artifacts, which Sobel amplifies into a jittery,
// visually incoherent direction field (this is explicitly called out in
// the task brief - skipping the blur produces ugly, jittery hatching).
// Tying the radius to the sample spacing means the blur washes out detail
// finer than a single hatch cell can represent anyway, without also
// smearing away real large-scale form (a haunch, a fold) that spans many
// cells.
function chooseBlurRadiusPx(sampleSpacingPx: number): number {
    return Math.max(1, Math.round(sampleSpacingPx / 2));
}

function buildLuminanceBuffer(imageData: ImageData): Float32Array {
    const { width, height, data } = imageData;
    const luminance = new Float32Array(width * height);
    for (let i = 0, p = 0; i < luminance.length; i++, p += 4) {
        const a = data[p + 3];
        if (a === 0) {
            // Fully transparent pixels read as paper-white, matching the
            // "background" convention used throughout vectorizer.ts - so
            // the boundary between drawn content and empty canvas doesn't
            // itself register as a spurious hard edge.
            luminance[i] = 1;
            continue;
        }
        const r = data[p];
        const g = data[p + 1];
        const b = data[p + 2];
        luminance[i] = (LUM_R * r + LUM_G * g + LUM_B * b) / 255;
    }
    return luminance;
}

// Separable box blur (horizontal pass, then vertical), each pass using a
// running-sum sliding window so cost is O(width*height) regardless of
// radius - important since a large raster (the halo-fix work's ~1.4M pixel
// scale) needs this to stay cheap even at a generous blur radius. Two
// passes of a box filter approximate a Gaussian well enough for this
// purpose without needing a real Gaussian kernel.
function boxBlur(src: Float32Array, width: number, height: number, radius: number): Float32Array {
    if (radius <= 0) return src;
    const tmp = new Float32Array(width * height);
    const out = new Float32Array(width * height);
    boxBlurHorizontal(src, tmp, width, height, radius);
    boxBlurVertical(tmp, out, width, height, radius);
    boxBlurHorizontal(out, tmp, width, height, radius);
    boxBlurVertical(tmp, out, width, height, radius);
    return out;
}

function boxBlurHorizontal(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number): void {
    const windowSize = radius * 2 + 1;
    for (let y = 0; y < height; y++) {
        const rowStart = y * width;
        let sum = 0;
        for (let x = -radius; x <= radius; x++) {
            sum += src[rowStart + clamp(x, 0, width - 1)];
        }
        for (let x = 0; x < width; x++) {
            dst[rowStart + x] = sum / windowSize;
            const addIdx = clamp(x + radius + 1, 0, width - 1);
            const removeIdx = clamp(x - radius, 0, width - 1);
            sum += src[rowStart + addIdx] - src[rowStart + removeIdx];
        }
    }
}

function boxBlurVertical(src: Float32Array, dst: Float32Array, width: number, height: number, radius: number): void {
    const windowSize = radius * 2 + 1;
    for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let y = -radius; y <= radius; y++) {
            sum += src[clamp(y, 0, height - 1) * width + x];
        }
        for (let y = 0; y < height; y++) {
            dst[y * width + x] = sum / windowSize;
            const addIdx = clamp(y + radius + 1, 0, height - 1);
            const removeIdx = clamp(y - radius, 0, height - 1);
            sum += src[addIdx * width + x] - src[removeIdx * width + x];
        }
    }
}

function clamp(v: number, lo: number, hi: number): number {
    return v < lo ? lo : v > hi ? hi : v;
}

// Standard 3x3 Sobel kernels.
function sobelAt(luminance: Float32Array, width: number, height: number, x: number, y: number): { gx: number; gy: number } {
    const sample = (dx: number, dy: number) => luminance[clamp(y + dy, 0, height - 1) * width + clamp(x + dx, 0, width - 1)];

    const tl = sample(-1, -1), t = sample(0, -1), tr = sample(1, -1);
    const l = sample(-1, 0), r = sample(1, 0);
    const bl = sample(-1, 1), b = sample(0, 1), br = sample(1, 1);

    const gx = (tr + 2 * r + br) - (tl + 2 * l + bl);
    const gy = (bl + 2 * b + br) - (tl + 2 * t + tr);

    return { gx, gy };
}

// Computes the gradient field. `sampleSpacingPx` controls both the sample
// grid pitch and (via chooseBlurRadiusPx) the pre-blur radius - callers
// generally want chooseSampleSpacingPx(imageData.width, imageData.height)
// unless they have a specific reason to override it (e.g. tests pinning an
// exact grid for assertions).
export function computeGradientField(imageData: ImageData, sampleSpacingPx: number): GradientField {
    const { width, height } = imageData;
    const spacing = Math.max(1, sampleSpacingPx);

    const cols = Math.max(1, Math.ceil(width / spacing));
    const rows = Math.max(1, Math.ceil(height / spacing));

    const angles = new Float32Array(cols * rows);
    const magnitudes = new Float32Array(cols * rows);

    if (width === 0 || height === 0) {
        return { widthPx: width, heightPx: height, cellSizePx: spacing, cols, rows, angles, magnitudes };
    }

    const luminance = buildLuminanceBuffer(imageData);
    const blurred = boxBlur(luminance, width, height, chooseBlurRadiusPx(spacing));

    let maxMagnitude = 0;
    for (let row = 0; row < rows; row++) {
        const sampleY = Math.min(height - 1, Math.floor(row * spacing + spacing / 2));
        for (let col = 0; col < cols; col++) {
            const sampleX = Math.min(width - 1, Math.floor(col * spacing + spacing / 2));
            const { gx, gy } = sobelAt(blurred, width, height, sampleX, sampleY);
            const magnitude = Math.sqrt(gx * gx + gy * gy);
            const idx = row * cols + col;
            angles[idx] = Math.atan2(gy, gx);
            magnitudes[idx] = magnitude;
            if (magnitude > maxMagnitude) maxMagnitude = magnitude;
        }
    }

    if (maxMagnitude > 0) {
        for (let i = 0; i < magnitudes.length; i++) {
            magnitudes[i] = magnitudes[i] / maxMagnitude;
        }
    }

    return { widthPx: width, heightPx: height, cellSizePx: spacing, cols, rows, angles, magnitudes };
}

export type GradientSample = {
    angle: number;
    magnitude: number;
};

// Looks up the field at normalized [0,1] fractional coordinates (u,v) -
// NOT raw pixel or mm coordinates - so the lookup stays valid regardless of
// the raster's native resolution or whatever physical mm size is chosen at
// render time (both the source raster and the render canvas cover the same
// [0,1]x[0,1] extent, just at different absolute scales). Returns undefined
// only for a degenerate (0-cell) field.
export function sampleGradientField(field: GradientField, u: number, v: number): GradientSample | undefined {
    if (field.cols === 0 || field.rows === 0) return undefined;
    const xPx = clamp(u, 0, 1) * field.widthPx;
    const yPx = clamp(v, 0, 1) * field.heightPx;
    const col = clamp(Math.floor(xPx / field.cellSizePx), 0, field.cols - 1);
    const row = clamp(Math.floor(yPx / field.cellSizePx), 0, field.rows - 1);
    const idx = row * field.cols + col;
    return { angle: field.angles[idx], magnitude: field.magnitudes[idx] };
}

// Compact JSON-serializable form of a GradientField, for embedding into the
// vectorized SVG's data-paper-data (see vectorizer.ts's withGradientField)
// so it survives the round trip from the vectorize worker call, through the
// client's SVG-import/export-JSON bridge, to the render worker call where
// fill strategies actually run - typed arrays don't survive JSON/postMessage
// boundaries as themselves, and rounding to a handful of decimal digits
// keeps the payload well short of the full Float32 precision, which the
// coarse sample grid doesn't need anyway.
export type SerializedGradientField = {
    w: number;
    h: number;
    c: number; // cellSizePx
    cols: number;
    rows: number;
    a: number[]; // angles, rounded
    m: number[]; // magnitudes, rounded
};

const ANGLE_PRECISION = 1000; // 3 decimal digits (~0.06 degree resolution)
const MAGNITUDE_PRECISION = 200; // 2-3 decimal digits, plenty for a [0,1] value

export function serializeGradientField(field: GradientField): SerializedGradientField {
    return {
        w: field.widthPx,
        h: field.heightPx,
        c: field.cellSizePx,
        cols: field.cols,
        rows: field.rows,
        a: Array.from(field.angles, (v) => Math.round(v * ANGLE_PRECISION) / ANGLE_PRECISION),
        m: Array.from(field.magnitudes, (v) => Math.round(v * MAGNITUDE_PRECISION) / MAGNITUDE_PRECISION),
    };
}

export function deserializeGradientField(data: SerializedGradientField): GradientField {
    return {
        widthPx: data.w,
        heightPx: data.h,
        cellSizePx: data.c,
        cols: data.cols,
        rows: data.rows,
        angles: Float32Array.from(data.a),
        magnitudes: Float32Array.from(data.m),
    };
}
