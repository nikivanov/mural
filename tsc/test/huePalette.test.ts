/**
 * Pure-logic tests for hue-grouped shading (src/huePalette.ts): clustering
 * a detected color-separation palette by hue, the neutral-grouping guard,
 * and the tone-derived spacing assignment/SVG-tag remap. Deliberately
 * paper.js/DOM-free (see huePalette.ts's file header), so - unlike
 * pipeline.test.ts/multicolor.test.ts - these never need to skip for lack
 * of a compiled `canvas` addon.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
    applyHueGrouping,
    applyHueGroupingWithOverrides,
    assignToneSpacings,
    computeAutoHueGroups,
    computeToneSpacingMm,
    DEFAULT_NIB_WIDTH_MM,
    MAX_SPACING_MM,
    hexToHsl,
    isNeutralHsl,
} from "../src/huePalette";
import type { PaletteEntry } from "../src/types";

// A synthetic 3-mask raw color-separation result: two shades of blue plus
// one contrasting orange, mirroring the cartoon-mural scenario from the
// feature's design (2 blues + 2 oranges/creams + background/black
// collapsing to 3 pens). Order here matches vectorizeImageDataColor's
// light-to-dark palette convention: light blue, orange (lighter than dark
// blue by luminance), dark blue.
const lightBlue: PaletteEntry = { name: "Light Blue", color: "#77aaee" };
const darkBlue: PaletteEntry = { name: "Dark Blue", color: "#1133aa" };
const orange: PaletteEntry = { name: "Orange", color: "#ff9933" };

function rawSvgFor(palette: PaletteEntry[]): string {
    // Matches vectorizeImageDataColor's fixed <g data-paper-data='...'>
    // shape exactly (see huePalette.ts's GROUP_TAG_RE comment) - one <g> per
    // palette entry, in order, each wrapping a placeholder <path/>.
    const groups = palette
        .map((_p, i) => `<g data-paper-data='{"colorIndex":${i}}'><path d="M0 0"/></g>`)
        .join("");
    return `<svg id="svg" version="1.1" width="10" height="10" xmlns="http://www.w3.org/2000/svg">${groups}</svg>`;
}

test("huePalette: hexToHsl/isNeutralHsl - saturated colors are not neutral, greys/near-black/near-white are", () => {
    assert.strictEqual(isNeutralHsl(hexToHsl("#1133aa")), false, "saturated blue should not be neutral");
    assert.strictEqual(isNeutralHsl(hexToHsl("#ff9933")), false, "saturated orange should not be neutral");
    assert.strictEqual(isNeutralHsl(hexToHsl("#808080")), true, "mid grey should be neutral");
    assert.strictEqual(isNeutralHsl(hexToHsl("#050505")), true, "near-black should be neutral even if nominally saturated");
    assert.strictEqual(isNeutralHsl(hexToHsl("#f8f8f8")), true, "near-white should be neutral");
});

test("huePalette: computeAutoHueGroups - two shades of one hue plus one contrasting hue collapse to 2 buckets", () => {
    const palette = [lightBlue, orange, darkBlue];
    const entries = palette.map((p, index) => ({ index, color: p.color }));
    const bucketIds = computeAutoHueGroups(entries);

    assert.strictEqual(bucketIds[0], bucketIds[2], "the two blues must share a bucket");
    assert.notStrictEqual(bucketIds[0], bucketIds[1], "blue and orange must not share a bucket");

    const distinctBuckets = new Set(bucketIds);
    assert.strictEqual(distinctBuckets.size, 2, "expected exactly 2 buckets (pens)");
});

test("huePalette: near-greys group as neutral rather than by their (unstable) hue", () => {
    // Two near-greys whose tiny RGB differences put them at very different
    // raw hue angles (one nudged toward blue, one toward red) - if hue
    // clustering were applied naively these would land in different
    // buckets; the saturation guard must instead put both in the shared
    // neutral bucket, together with an unrelated saturated color that must
    // NOT join them.
    const greyTowardBlue: PaletteEntry = { name: "Grey A", color: "#7d7d82" };
    const greyTowardRed: PaletteEntry = { name: "Grey B", color: "#827d7d" };
    const saturatedGreen: PaletteEntry = { name: "Green", color: "#22aa33" };

    const palette = [greyTowardBlue, greyTowardRed, saturatedGreen];
    const entries = palette.map((p, index) => ({ index, color: p.color }));
    const bucketIds = computeAutoHueGroups(entries);

    assert.strictEqual(bucketIds[0], bucketIds[1], "both near-greys must land in the same (neutral) bucket");
    assert.notStrictEqual(bucketIds[0], bucketIds[2], "the saturated green must not join the neutral bucket");
});

test("huePalette: assignToneSpacings - single member gets no override, darkest (pen) member gets the tightest spacing", () => {
    assert.deepStrictEqual(assignToneSpacings([0.5]), [undefined]);

    const two = assignToneSpacings([0.665, 0.736]); // pen, lighter member
    assert.strictEqual(two.length, 2);
    assert.ok(two[0]! < two[1]!, `pen's own spacing (${two[0]}) should be tighter than the lighter member's (${two[1]})`);
    assert.ok(Math.abs(two[0]! - 2 * DEFAULT_NIB_WIDTH_MM) < 1e-6, "the pen (target == pen luminance, coverage 1) should get spacing == strokesPerCell * nibWidth");
});

test("huePalette: computeToneSpacingMm - the measured Bluey blue pair (#83b4d9 pen / #9dc5dd pale member) lands near 3mm, not the old ladder's 20mm", () => {
    const penLuminance = 0.665; // #83b4d9
    const memberLuminance = 0.736; // #9dc5dd, 7% lighter than the pen
    const spacing = computeToneSpacingMm(memberLuminance, penLuminance);

    assert.ok(Math.abs(spacing - 3.0) < 0.3, `expected spacing near 3.0mm for the measured pair, got ${spacing.toFixed(2)}mm`);
});

test("huePalette: computeToneSpacingMm - tone gap, not member count, drives the spacing ratio", () => {
    const penLuminance = 0.3;
    const closeSpacing = computeToneSpacingMm(0.35, penLuminance); // small tone gap
    const farSpacing = computeToneSpacingMm(0.9, penLuminance); // large tone gap

    assert.ok(farSpacing > closeSpacing * 3, `a much larger tone gap (${farSpacing.toFixed(2)}mm) should produce a correspondingly wider spacing than a small one (${closeSpacing.toFixed(2)}mm), not just a fixed ladder step apart`);
});

test("huePalette: assignToneSpacings - near-identical tones produce near-identical spacings regardless of member count", () => {
    const spacings = assignToneSpacings([0.4, 0.41, 0.42]);
    assert.strictEqual(spacings.length, 3);
    for (let i = 1; i < spacings.length; i++) {
        const delta = Math.abs(spacings[i]! - spacings[i - 1]!);
        assert.ok(delta < 0.5, `near-identical tones should produce near-identical spacings, got a ${delta.toFixed(2)}mm jump between adjacent members`);
    }
});

test("huePalette: computeToneSpacingMm - clamped at a nib-width floor for an absurdly dark/high-coverage target, and at MAX_SPACING_MM for an absurdly light one", () => {
    const penLuminance = 0.2;

    // Un-clamped, coverage == inkMultiplier at target == pen luminance
    // (rawCoverage 1) - a high multiplier would imply spacing well below
    // one nib width (2 * 1.2 / 3 = 0.8mm) if left unclamped; the floor must
    // hold it at 1 * nibWidth instead.
    const denseSpacing = computeToneSpacingMm(penLuminance, penLuminance, { nibWidthMm: 1.2, inkMultiplier: 3 });
    assert.ok(denseSpacing >= 1.2 - 1e-9, `spacing (${denseSpacing}) must never go below the nib-width floor`);
    assert.ok(Math.abs(denseSpacing - 1.2) < 1e-9, `expected the floor (1.2mm) to bind exactly, got ${denseSpacing}`);

    // A target essentially indistinguishable from paper implies coverage
    // near zero - spacing must cap at MAX_SPACING_MM rather than blowing up.
    const sparseSpacing = computeToneSpacingMm(0.999999, penLuminance);
    assert.strictEqual(sparseSpacing, MAX_SPACING_MM, "an extremely light target must cap at MAX_SPACING_MM rather than approach infinity");
});

test("huePalette: computeToneSpacingMm - nib width and ink multiplier both move spacing in the expected direction", () => {
    const targetLuminance = 0.7;
    const penLuminance = 0.4;

    const baseline = computeToneSpacingMm(targetLuminance, penLuminance, { nibWidthMm: 1.2, inkMultiplier: 1.0 });
    const widerNib = computeToneSpacingMm(targetLuminance, penLuminance, { nibWidthMm: 2.4, inkMultiplier: 1.0 });
    assert.ok(widerNib > baseline, "a wider nib should produce a larger (sparser-looking, but proportionally scaled) spacing for the same tone");

    const strongerInk = computeToneSpacingMm(targetLuminance, penLuminance, { nibWidthMm: 1.2, inkMultiplier: 2.0 });
    assert.ok(strongerInk < baseline, "a higher ink multiplier (more perceived coverage per pass) should tighten the spacing needed to hit the same apparent tone");

    const weakerInk = computeToneSpacingMm(targetLuminance, penLuminance, { nibWidthMm: 1.2, inkMultiplier: 0.5 });
    assert.ok(weakerInk > baseline, "a lower ink multiplier (weaker/thinner ink) should widen the spacing needed, since each pass covers less");
});

test("huePalette: applyHueGrouping - two shades of blue plus orange produce 2 pens, darker shade denser", () => {
    const raw = { svg: rawSvgFor([lightBlue, orange, darkBlue]), palette: [lightBlue, orange, darkBlue] };
    const result = applyHueGrouping(raw);

    assert.strictEqual(result.groups.length, 2, "expected 2 pens (not 3)");
    assert.strictEqual(result.palette.length, 2);

    const blueGroup = result.groups.find(g => g.members.length === 2);
    assert.ok(blueGroup, "expected the blue group to have 2 members");
    assert.strictEqual(blueGroup!.members.length, 2);

    // Darkest-first within the group.
    const [darker, lighter] = blueGroup!.members;
    assert.strictEqual(darker.color, darkBlue.color);
    assert.strictEqual(lighter.color, lightBlue.color);
    assert.ok(darker.spacingMm! < lighter.spacingMm!, "darker shade must get a tighter (denser) spacing than the lighter shade");

    // The pen for the group must be its darkest member (KEY INSIGHT: a
    // physical pen can only draw ink at least as dark as itself).
    assert.strictEqual(blueGroup!.pen.color, darkBlue.color);

    // The orange group is a singleton - no spacing override, falls back to
    // the request's ordinary infillDensity.
    const orangeGroup = result.groups.find(g => g.members.length === 1);
    assert.ok(orangeGroup);
    assert.strictEqual(orangeGroup!.members[0].spacingMm, undefined);
    assert.strictEqual(orangeGroup!.pen.color, orange.color);
});

test("huePalette: applyHueGrouping - light-to-dark pen order matches the multi-color convention", () => {
    const raw = { svg: rawSvgFor([lightBlue, orange, darkBlue]), palette: [lightBlue, orange, darkBlue] };
    const result = applyHueGrouping(raw);

    // Orange (luminance-lighter than dark blue) must be pen 0 (drawn
    // first); the blue group (anchored by dark blue) must be pen 1.
    assert.strictEqual(result.groups[0].pen.color, orange.color);
    assert.strictEqual(result.groups[1].pen.color, darkBlue.color);
});

test("huePalette: applyHueGrouping - remapped SVG tags carry the group's colorIndex and per-member spacingMm", () => {
    const raw = { svg: rawSvgFor([lightBlue, orange, darkBlue]), palette: [lightBlue, orange, darkBlue] };
    const result = applyHueGrouping(raw);

    const tags = [...result.svg.matchAll(/data-paper-data='([^']*)'/g)].map(m => JSON.parse(m[1]));
    assert.strictEqual(tags.length, 3, "expected one tag per original mask, order preserved");

    // Original order was [lightBlue, orange, darkBlue]; orange -> pen 0
    // (singleton, no spacing override), lightBlue/darkBlue -> pen 1 with
    // distinct tone-derived spacings.
    assert.strictEqual(tags[1].colorIndex, 0);
    assert.strictEqual(tags[1].spacingMm, undefined);

    assert.strictEqual(tags[0].colorIndex, 1);
    assert.strictEqual(tags[2].colorIndex, 1);
    assert.ok(tags[2].spacingMm < tags[0].spacingMm, "dark blue's mask must carry a tighter spacing tag than light blue's");
});

test("huePalette: a group with only distinct, well-separated hues leaves every entry its own singleton pen (no accidental merging)", () => {
    // Three widely-separated saturated hues: none should merge, and with
    // every group a singleton, no spacing overrides should appear at all.
    const red: PaletteEntry = { name: "Red", color: "#dd2222" };
    const green: PaletteEntry = { name: "Green", color: "#22aa33" };
    const violet: PaletteEntry = { name: "Violet", color: "#7722cc" };

    const raw = { svg: rawSvgFor([green, red, violet]), palette: [green, red, violet] };
    const result = applyHueGrouping(raw);

    assert.strictEqual(result.groups.length, 3);
    for (const group of result.groups) {
        assert.strictEqual(group.members.length, 1);
        assert.strictEqual(group.members[0].spacingMm, undefined);
    }
});

test("huePalette: applyHueGroupingWithOverrides lets the caller reassign a detected color to a different pen", () => {
    // Red, green and violet are far enough apart in hue that automatic
    // clustering leaves each as its own singleton pen (see the test above).
    // Force red and violet into the same bucket via an override - automatic
    // hue clustering would never do this on its own, which is exactly the
    // "automatic grouping is sometimes wrong, let the user fix it" case the
    // override exists for.
    const red: PaletteEntry = { name: "Red", color: "#dd2222" };
    const green: PaletteEntry = { name: "Green", color: "#22aa33" };
    const violet: PaletteEntry = { name: "Violet", color: "#7722cc" };

    const raw = { svg: rawSvgFor([green, red, violet]), palette: [green, red, violet] };

    const withoutOverride = applyHueGrouping(raw);
    assert.strictEqual(withoutOverride.groups.length, 3, "sanity check: red/violet do not auto-merge");

    // Indices are palette-order: 0 = green, 1 = red, 2 = violet.
    const overridden = applyHueGroupingWithOverrides(raw, { 1: 0, 2: 0 });

    assert.strictEqual(overridden.groups.length, 2, "expected red+violet merged into one pen, green left alone");
    const mergedGroup = overridden.groups.find(g => g.members.length === 2);
    assert.ok(mergedGroup, "expected a 2-member group");
    assert.strictEqual(mergedGroup!.members.length, 2);
    const memberColors = mergedGroup!.members.map(m => m.color).sort();
    assert.deepStrictEqual(memberColors, [red.color, violet.color].sort());

    // Violet (#7722cc, l ~= 0.4) is darker than red (#dd2222, l ~= 0.47) -
    // the pen must be the darker of the two merged members.
    assert.strictEqual(mergedGroup!.pen.color, violet.color, "the pen must be the darkest of the merged members");
});
