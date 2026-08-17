/**
 * Tests for the anti-aliased-edge "halo" fix in src/vectorizer.ts
 * (classifyWithFringeResolution, and its use from quantizeToPalette /
 * kMeansQuantize).
 *
 * The bug: rasterizing an SVG always anti-aliases hard edges, leaving a
 * 1-2px fringe of pixels that are a genuine RGB blend of the colors on
 * either side of the edge. Quantizing those blended pixels by nearest
 * palette color is unsound - a mid-grey blend of black and white can be
 * nearer (by any global distance metric) to an unrelated third palette
 * color than to either endpoint of the blend, producing thin ribbons of
 * the wrong color traced along every edge in the image.
 *
 * Like multicolor.test.ts, this needs the real paper.js geometry engine
 * (paper.Color, used throughout vectorizer.ts), which only works once the
 * native `canvas` addon has a compiled binary - see that file's header for
 * the full explanation. Same self-skip applies here.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

process.env.server = "1";

function tryLoadPaper(): { paper: typeof import("paper") } | { error: Error } {
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const paper = require("paper");
        return { paper };
    } catch (err) {
        return { error: err as Error };
    }
}

const paperLoadResult = tryLoadPaper();
const paperAvailable = !("error" in paperLoadResult);

function makeImageData(width: number, height: number, fill: (x: number, y: number) => [number, number, number, number]): ImageData {
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const [r, g, b, a] = fill(x, y);
            data[i] = r;
            data[i + 1] = g;
            data[i + 2] = b;
            data[i + 3] = a;
        }
    }
    return { data, width, height, colorSpace: "srgb" } as unknown as ImageData;
}

// Deterministic pseudo-random generator (mulberry32) - avoids a real RNG
// dependency while still producing full-range, non-repeating noise for the
// continuous-tone test.
function mulberry32(seed: number): () => number {
    let a = seed;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

if (!paperAvailable) {
    test(`vectorizer fringe tests skipped: paper.js unavailable (${(paperLoadResult as { error: Error }).error.message})`, (t) => {
        t.skip("native `canvas` addon has no compiled binary in this environment. Run `npm install` without --ignore-scripts, with cairo/pango/pkg-config available, to enable these tests.");
    });
} else {
    const paper = (paperLoadResult as { paper: typeof import("paper") }).paper;
    const { classifyWithFringeResolution } = require("../src/vectorizer") as typeof import("../src/vectorizer");

    const AMBER = new paper.Color("#ffb13b");
    const BLACK = new paper.Color("#000000");

    test("fringe: an anti-aliased black/white edge produces no amber (unrelated third color) region", () => {
        // A black rectangle on a white background, with a deliberate 6px
        // linear anti-aliasing ramp between them - exactly what a browser's
        // SVG rasterizer produces at a hard edge. No amber pixel exists
        // anywhere in the source; if the bug is present, the ramp's mid-grey
        // pixels quantize to amber anyway, because a mid-grey blend of
        // black and white is nearer to amber (#ffb13b) than to either
        // endpoint by RGB distance - see vectorizer.ts's
        // classifyWithFringeResolution doc comment for the exact numbers.
        const width = 40;
        const height = 20;
        const rampStart = 15;
        const rampWidth = 6;

        const imageData = makeImageData(width, height, (x) => {
            if (x < rampStart) return [255, 255, 255, 255];
            if (x < rampStart + rampWidth) {
                const t = (x - rampStart + 0.5) / rampWidth; // 0 (white) -> 1 (black)
                const v = Math.round(255 * (1 - t));
                return [v, v, v, 255];
            }
            return [0, 0, 0, 255];
        });

        const result = classifyWithFringeResolution(imageData, [AMBER, BLACK]);

        assert.strictEqual(result.bypassed, false, "flat two-region art with a thin ramp should not trip the continuous-tone bypass");
        assert.ok(result.fringeFraction > 0, "the ramp should register as fringe on the first pass");

        // No pixel anywhere may end up labeled amber (index 0) - there is no
        // amber content in the source at all, only a black/white edge.
        const amberIndex = 0;
        const amberPixels: number[] = [];
        for (let i = 0; i < result.indices.length; i++) {
            if (result.indices[i] === amberIndex) amberPixels.push(i);
        }
        assert.deepStrictEqual(amberPixels, [], `expected no amber-labeled pixels, found ${amberPixels.length}`);

        // Sanity: the test isn't vacuous - both real regions are present.
        assert.ok(Array.from(result.indices).some((v) => v === 1), "expected some black-labeled pixels");
        assert.ok(Array.from(result.indices).some((v) => v === -1), "expected some background-labeled pixels");
    });

    test("fringe: a flat, already-quantized image is unchanged (no regression for clean input)", () => {
        const width = 30;
        const height = 10;
        // Left third: white/background. Middle third: exact amber. Right
        // third: exact black. No anti-aliasing anywhere.
        const imageData = makeImageData(width, height, (x) => {
            if (x < width / 3) return [255, 255, 255, 255];
            if (x < (2 * width) / 3) return [0xff, 0xb1, 0x3b, 255];
            return [0, 0, 0, 255];
        });

        const result = classifyWithFringeResolution(imageData, [AMBER, BLACK]);

        assert.strictEqual(result.fringeFraction, 0, "a clean, already-quantized image should have zero fringe");
        assert.strictEqual(result.bypassed, false);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const i = y * width + x;
                const expected = x < width / 3 ? -1 : x < (2 * width) / 3 ? 0 : 1;
                assert.strictEqual(result.indices[i], expected, `pixel (${x},${y}) mislabeled`);
            }
        }
    });

    test("fringe: continuous-tone (noisy) input degrades gracefully - fast, bounded fringe fraction, sane nearest-color output", () => {
        // Simulates a photograph: pixel colors spread smoothly/randomly
        // across the whole color space rather than concentrated near a
        // sparse palette's colors. Confirms the fix doesn't regress this
        // case: it should terminate quickly and not flood-fill labels
        // across the image from whichever confident pixel happens to be
        // reached first.
        const width = 400;
        const height = 400; // 160,000 pixels of full-range noise
        const rand = mulberry32(12345);

        const imageData = makeImageData(width, height, () => {
            const r = Math.floor(rand() * 256);
            const g = Math.floor(rand() * 256);
            const b = Math.floor(rand() * 256);
            return [r, g, b, 255];
        });

        const palette = [AMBER, BLACK];

        const start = process.hrtime.bigint();
        const result = classifyWithFringeResolution(imageData, palette);
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

        // Full-range random noise against a 2-color palette should be
        // overwhelmingly ambiguous (far from every palette/background
        // entry) - well past the bypass cutoff.
        assert.ok(result.fringeFraction > 0.35, `expected a high ambiguous fraction for noise, got ${result.fringeFraction}`);
        assert.strictEqual(result.bypassed, true, "a mostly-ambiguous raster should bypass growth and fall back to nearest-color");
        assert.ok(elapsedMs < 1000, `expected the bypass path to be fast, took ${elapsedMs}ms`);

        // Sanity: with growth bypassed, every pixel's label must equal its
        // own plain nearest-color classification (background/amber/black by
        // raw RGB distance) - not a value inherited from a distant
        // neighbor via flood growth.
        const data = imageData.data;
        const extended = [AMBER, BLACK, new paper.Color("#ffffff")];
        for (let i = 0; i < result.indices.length; i += 977) { // sample, not exhaustive - 160k pixels
            const a = i * 4;
            const r = data[a] / 255, g = data[a + 1] / 255, b = data[a + 2] / 255;
            let best = 0, bestDist = Infinity;
            for (let k = 0; k < extended.length; k++) {
                const c = extended[k];
                const dr = r - c.red, dg = g - c.green, db = b - c.blue;
                const dist = dr * dr + dg * dg + db * db;
                if (dist < bestDist) { bestDist = dist; best = k; }
            }
            const expected = best === 2 ? -1 : best;
            assert.strictEqual(result.indices[i], expected, `pixel ${i} does not match plain nearest-color classification`);
        }
    });

    test("fringe: performance - a 1.4M-pixel flat-art raster with an anti-aliased edge classifies in well under 1s", () => {
        const width = 1200;
        const height = 1167; // ~1.4M pixels
        const rampStart = Math.floor(width * 0.4);
        const rampWidth = 4;

        const imageData = makeImageData(width, height, (x) => {
            if (x < rampStart) return [255, 255, 255, 255];
            if (x < rampStart + rampWidth) {
                const t = (x - rampStart + 0.5) / rampWidth;
                const v = Math.round(255 * (1 - t));
                return [v, v, v, 255];
            }
            return [0, 0, 0, 255];
        });

        const start = process.hrtime.bigint();
        const result = classifyWithFringeResolution(imageData, [AMBER, BLACK]);
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

        assert.strictEqual(result.bypassed, false);
        assert.ok(elapsedMs < 1000, `expected classification of 1.4M pixels to take well under 1s, took ${elapsedMs}ms`);
        // eslint-disable-next-line no-console
        console.log(`    [perf] 1.4M-pixel flat-art classification: ${elapsedMs.toFixed(1)}ms, fringeFraction=${result.fringeFraction.toFixed(4)}`);
    });

    test("fringe: performance - a 1.4M-pixel continuous-tone raster bypasses growth and is also fast", () => {
        const width = 1200;
        const height = 1167;
        const rand = mulberry32(98765);

        const imageData = makeImageData(width, height, () => {
            const r = Math.floor(rand() * 256);
            const g = Math.floor(rand() * 256);
            const b = Math.floor(rand() * 256);
            return [r, g, b, 255];
        });

        const start = process.hrtime.bigint();
        const result = classifyWithFringeResolution(imageData, [AMBER, BLACK]);
        const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

        assert.strictEqual(result.bypassed, true);
        assert.ok(elapsedMs < 1000, `expected the bypass path on 1.4M pixels to be fast, took ${elapsedMs}ms`);
        // eslint-disable-next-line no-console
        console.log(`    [perf] 1.4M-pixel continuous-tone classification (bypassed): ${elapsedMs.toFixed(1)}ms, fringeFraction=${result.fringeFraction.toFixed(4)}`);
    });
}
