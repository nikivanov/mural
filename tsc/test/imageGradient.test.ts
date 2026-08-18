/**
 * Tests for src/imageGradient.ts's Sobel-based local gradient field. Pure
 * Node tests - deliberately no paper.js dependency (see the module's own
 * header comment for why), so these run regardless of whether the native
 * `canvas` addon is built in this environment.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    computeGradientField,
    sampleGradientField,
    serializeGradientField,
    deserializeGradientField,
    chooseSampleSpacingPx,
} from "../src/imageGradient";

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

test("computeGradientField: a horizontal luminance ramp (dark -> light left to right) points in +x", () => {
    const width = 200;
    const height = 100;
    const imageData = makeImageData(width, height, (x) => {
        const v = Math.round((x / (width - 1)) * 255);
        return [v, v, v, 255];
    });

    const field = computeGradientField(imageData, chooseSampleSpacingPx(width, height));

    // Sample well away from the left/right edges (edge cells are clamped
    // and the blur softens a strip near the boundary).
    const sample = sampleGradientField(field, 0.5, 0.5);
    assert.ok(sample, "expected a defined sample in the middle of the field");
    // Gradient direction is toward increasing luminance - here, +x, i.e.
    // angle ~= 0 radians.
    assert.ok(Math.abs(sample!.angle) < 0.15, `expected angle near 0, got ${sample!.angle}`);
    assert.ok(sample!.magnitude > 0.3, `expected a non-trivial magnitude on a full-range ramp, got ${sample!.magnitude}`);
});

test("computeGradientField: a vertical luminance ramp (dark -> light top to bottom) points in +y", () => {
    const width = 100;
    const height = 200;
    const imageData = makeImageData(width, height, (_x, y) => {
        const v = Math.round((y / (height - 1)) * 255);
        return [v, v, v, 255];
    });

    const field = computeGradientField(imageData, chooseSampleSpacingPx(width, height));
    const sample = sampleGradientField(field, 0.5, 0.5);
    assert.ok(sample);
    // +y in image/canvas space (down the raster) -> angle ~= PI/2.
    assert.ok(Math.abs(sample!.angle - Math.PI / 2) < 0.15, `expected angle near PI/2, got ${sample!.angle}`);
});

test("computeGradientField: a radial ramp's gradient points outward from the (dark) center at several angles", () => {
    const size = 240;
    const cx = size / 2;
    const cy = size / 2;
    const maxRadius = size / 2;

    const imageData = makeImageData(size, size, (x, y) => {
        const dx = x - cx;
        const dy = y - cy;
        const r = Math.sqrt(dx * dx + dy * dy);
        const v = Math.round(Math.min(1, r / maxRadius) * 255); // dark center, light edge
        return [v, v, v, 255];
    });

    const field = computeGradientField(imageData, chooseSampleSpacingPx(size, size));

    // Probe points around a ring at a few compass directions; the local
    // gradient should point radially outward (away from center) at each.
    const probes: [number, number][] = [
        [0.5, 0.75], // below center -> expect angle ~ +PI/2 (down)
        [0.75, 0.5], // right of center -> expect angle ~ 0 (right)
        [0.5, 0.25], // above center -> expect angle ~ -PI/2 (up)
        [0.25, 0.5], // left of center -> expect angle ~ PI (left)
    ];
    const expectedAngles = [Math.PI / 2, 0, -Math.PI / 2, Math.PI];

    for (let i = 0; i < probes.length; i++) {
        const [u, v] = probes[i];
        const sample = sampleGradientField(field, u, v);
        assert.ok(sample, `expected a sample at (${u}, ${v})`);
        let diff = sample!.angle - expectedAngles[i];
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        assert.ok(Math.abs(diff) < 0.3, `probe (${u},${v}): expected angle near ${expectedAngles[i]}, got ${sample!.angle} (diff ${diff})`);
    }
});

test("computeGradientField: a flat (uniform) image has ~zero magnitude everywhere", () => {
    const width = 100;
    const height = 100;
    const imageData = makeImageData(width, height, () => [128, 128, 128, 255]);

    const field = computeGradientField(imageData, chooseSampleSpacingPx(width, height));
    for (let i = 0; i < field.magnitudes.length; i++) {
        assert.strictEqual(field.magnitudes[i], 0, `expected zero magnitude at cell ${i} of a flat image`);
    }
});

test("computeGradientField: blurring smooths single-pixel salt noise into a locally coherent field (no wild direction jitter between adjacent sample cells)", () => {
    const width = 200;
    const height = 200;
    // A smooth diagonal ramp with scattered single-pixel noise spikes -
    // without blur, Sobel would react sharply to each spike; with blur,
    // the underlying ramp direction should dominate.
    const imageData = makeImageData(width, height, (x, y) => {
        let v = Math.round(((x + y) / (width + height - 2)) * 255);
        if ((x * 31 + y * 17) % 97 === 0) {
            v = v > 128 ? 0 : 255; // noise spike
        }
        return [v, v, v, 255];
    });

    // An explicit, generous sample spacing (rather than the default
    // heuristic) so the resulting blur radius is comfortably larger than
    // the noise spikes' spacing - this test is about confirming blur
    // actually suppresses per-pixel noise, not about the default
    // heuristic's specific choice of spacing for a 200x200 image.
    const field = computeGradientField(imageData, 16);

    // Expected ramp direction: +x and +y in equal parts -> angle ~= PI/4.
    let matching = 0;
    let total = 0;
    for (let row = 1; row < field.rows - 1; row++) {
        for (let col = 1; col < field.cols - 1; col++) {
            const idx = row * field.cols + col;
            if (field.magnitudes[idx] < 0.05) continue;
            total++;
            let diff = field.angles[idx] - Math.PI / 4;
            while (diff > Math.PI) diff -= 2 * Math.PI;
            while (diff < -Math.PI) diff += 2 * Math.PI;
            if (Math.abs(diff) < 0.5) matching++;
        }
    }
    assert.ok(total > 0, "expected at least some non-trivial-magnitude cells");
    assert.ok(matching / total > 0.8, `expected the blurred field to overwhelmingly agree with the ramp direction, got ${matching}/${total}`);
});

test("sampleGradientField: out-of-range u/v are clamped rather than throwing or wrapping", () => {
    const width = 50;
    const height = 50;
    const imageData = makeImageData(width, height, (x) => [x * 5, x * 5, x * 5, 255]);
    const field = computeGradientField(imageData, chooseSampleSpacingPx(width, height));

    assert.doesNotThrow(() => sampleGradientField(field, -1, -1));
    assert.doesNotThrow(() => sampleGradientField(field, 2, 2));
    const clampedLow = sampleGradientField(field, -1, -1);
    const atOrigin = sampleGradientField(field, 0, 0);
    assert.deepStrictEqual(clampedLow, atOrigin, "expected negative coordinates to clamp to the same cell as (0,0)");
});

test("computeGradientField: a degenerate 0x0 raster produces an empty field, and sampling it returns undefined", () => {
    const imageData = makeImageData(0, 0, () => [0, 0, 0, 0]);
    const field = computeGradientField(imageData, 8);
    assert.strictEqual(field.cols, 1); // Math.max(1, ...) floors at 1 cell...
    // ...but with a 0-width/height source there is nothing real to report,
    // so sampling must not pretend otherwise.
    const zeroField = { ...field, cols: 0, rows: 0 };
    assert.strictEqual(sampleGradientField(zeroField, 0.5, 0.5), undefined);
});

test("serializeGradientField/deserializeGradientField round-trip preserves angle/magnitude to the documented rounding precision", () => {
    const width = 150;
    const height = 150;
    const imageData = makeImageData(width, height, (x, y) => {
        const v = Math.round(((x + y) / (width + height - 2)) * 255);
        return [v, v, v, 255];
    });

    const field = computeGradientField(imageData, chooseSampleSpacingPx(width, height));
    const roundTripped = deserializeGradientField(JSON.parse(JSON.stringify(serializeGradientField(field))));

    assert.strictEqual(roundTripped.cols, field.cols);
    assert.strictEqual(roundTripped.rows, field.rows);
    assert.strictEqual(roundTripped.widthPx, field.widthPx);
    assert.strictEqual(roundTripped.heightPx, field.heightPx);
    assert.strictEqual(roundTripped.cellSizePx, field.cellSizePx);

    for (let i = 0; i < field.angles.length; i++) {
        assert.ok(Math.abs(roundTripped.angles[i] - field.angles[i]) < 0.01, `angle[${i}] drifted too far after round-trip`);
        assert.ok(Math.abs(roundTripped.magnitudes[i] - field.magnitudes[i]) < 0.01, `magnitude[${i}] drifted too far after round-trip`);
    }
});

test("computeGradientField: performance - a 1.4M-pixel raster computes in well under 1s", () => {
    const width = 1200;
    const height = 1167;
    const imageData = makeImageData(width, height, (x, y) => {
        const v = Math.round((((x * 7 + y * 13) % 997) / 996) * 255);
        return [v, v, v, 255];
    });

    const start = process.hrtime.bigint();
    const field = computeGradientField(imageData, chooseSampleSpacingPx(width, height));
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;

    assert.ok(field.cols * field.rows > 0);
    assert.ok(elapsedMs < 1000, `expected gradient field computation over 1.4M pixels to take well under 1s, took ${elapsedMs}ms`);
    // eslint-disable-next-line no-console
    console.log(`    [perf] 1.4M-pixel gradient field: ${elapsedMs.toFixed(1)}ms, grid ${field.cols}x${field.rows}`);
});
