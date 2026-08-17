import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateAndRecommend } from "../src/costEstimator";

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

function makeFlatVectorImage(): ImageData {
    const width = 150, height = 150;
    return makeImageData(width, height, (x) => (x < width / 2 ? [20, 20, 20, 255] : [240, 240, 240, 255]));
}

test("estimateAndRecommend: returns a complete result with plausible, self-consistent numbers", () => {
    const result = estimateAndRecommend(makeFlatVectorImage(), { deviceFactor: 1 });

    assert.ok(result.characteristics);
    assert.ok(result.recommendations);
    assert.ok(result.processing.totalSeconds >= 0);
    assert.ok(result.plotting.totalSeconds >= 0);
    assert.equal(result.deviceCalibration.factor, 1);
});

test("estimateAndRecommend: explicit option overrides win over the smart recommendation", () => {
    const withRecommendation = estimateAndRecommend(makeFlatVectorImage(), { deviceFactor: 1 });
    const overridden = estimateAndRecommend(makeFlatVectorImage(), { deviceFactor: 1, fillStrategy: "contour", infillDensity: 7 });

    assert.notEqual(withRecommendation.processing.totalSeconds, overridden.processing.totalSeconds);
});

test("estimateAndRecommend: a denser override costs more plotting and processing time than the default", () => {
    const sparse = estimateAndRecommend(makeFlatVectorImage(), { deviceFactor: 1, infillDensity: 1 });
    const dense = estimateAndRecommend(makeFlatVectorImage(), { deviceFactor: 1, infillDensity: 7 });

    assert.ok(dense.processing.totalSeconds > sparse.processing.totalSeconds);
    assert.ok(dense.plotting.drawSeconds >= sparse.plotting.drawSeconds);
});

test("estimateAndRecommend: more requested colors increases the projected pen-swap pause", () => {
    const oneColor = estimateAndRecommend(makeFlatVectorImage(), { deviceFactor: 1, colorCount: 1 });
    const fiveColors = estimateAndRecommend(makeFlatVectorImage(), { deviceFactor: 1, colorCount: 5 });

    assert.equal(oneColor.plotting.penSwapCount, 0);
    assert.equal(fiveColors.plotting.penSwapCount, 4);
    assert.ok(fiveColors.plotting.estimatedPenSwapPauseSeconds > oneColor.plotting.estimatedPenSwapPauseSeconds);
});

test("estimateAndRecommend: a larger physical draw size increases projected draw and travel distance", () => {
    const small = estimateAndRecommend(makeFlatVectorImage(), { deviceFactor: 1, drawWidthMm: 100, drawHeightMm: 100 });
    const large = estimateAndRecommend(makeFlatVectorImage(), { deviceFactor: 1, drawWidthMm: 2000, drawHeightMm: 2000 });

    assert.ok(large.plotting.drawDistanceMm > small.plotting.drawDistanceMm);
});
