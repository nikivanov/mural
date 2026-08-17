import "./testSetup";
import { test } from "node:test";
import assert from "node:assert/strict";
import { recommendDefaults } from "../src/smartDefaults";
import { ImageCharacteristics } from "../src/imageCharacteristics";

function makeCharacteristics(overrides: Partial<ImageCharacteristics>): ImageCharacteristics {
    return {
        widthPx: 500,
        heightPx: 500,
        opaqueFraction: 1,
        colorConcentration: 0.9,
        estimatedDistinctColors: 3,
        flatFraction: 0.8,
        edgeFraction: 0.15,
        midToneFraction: 0.05,
        continuousToneScore: 0.1,
        classification: "flat",
        ...overrides,
    };
}

test("recommendDefaults: a flat/vector-ish image gets crossHatch45, no hue grouping, and a small turdSize", () => {
    const flat = makeCharacteristics({});
    const defaults = recommendDefaults(flat);

    assert.equal(defaults.fillStrategy.value, "crossHatch45");
    assert.equal(defaults.hueGrouping.value, false);
    assert.ok(defaults.turdSize.value <= 3);
    assert.ok(defaults.colorCount.value >= 2 && defaults.colorCount.value <= 6);
});

test("recommendDefaults: a strongly continuous-tone image gets gradientHatch, hue grouping, and a denser infill", () => {
    const photo = makeCharacteristics({
        colorConcentration: 0.2,
        estimatedDistinctColors: 40,
        flatFraction: 0.05,
        edgeFraction: 0.2,
        midToneFraction: 0.75,
        continuousToneScore: 0.75,
        classification: "continuous-tone",
    });
    const defaults = recommendDefaults(photo);

    assert.equal(defaults.fillStrategy.value, "gradientHatch");
    assert.equal(defaults.hueGrouping.value, true);
    assert.ok(defaults.infillDensity.value >= 4);
    assert.ok(defaults.colorCount.value >= 2);
});

test("recommendDefaults: every recommendation carries a non-empty human-readable rationale", () => {
    const defaults = recommendDefaults(makeCharacteristics({}));
    for (const rec of Object.values(defaults)) {
        assert.ok(typeof rec.rationale === "string" && rec.rationale.length > 10, `expected a real rationale, got: ${JSON.stringify(rec)}`);
    }
});

test("recommendDefaults: a borderline continuous-tone image below the gradientHatch threshold still gets the cheaper crossHatch45", () => {
    const borderline = makeCharacteristics({
        colorConcentration: 0.5,
        flatFraction: 0.3,
        midToneFraction: 0.3,
        continuousToneScore: 0.4,
        classification: "continuous-tone",
    });
    const defaults = recommendDefaults(borderline);
    assert.equal(defaults.fillStrategy.value, "crossHatch45");
});

test("recommendDefaults: flat colorCount tracks estimatedDistinctColors within the recommended pen-budget range", () => {
    const twoColor = recommendDefaults(makeCharacteristics({ estimatedDistinctColors: 2 }));
    const fiveColor = recommendDefaults(makeCharacteristics({ estimatedDistinctColors: 5 }));
    assert.ok(fiveColor.colorCount.value >= twoColor.colorCount.value);
});
