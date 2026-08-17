// Hue-grouped shading (see docs/multi-color.md and the "single pen, several
// shades of one hue" feature it doesn't yet document): a single pen can
// render several shades of its hue by hatching the same ink at different
// densities and letting paper show through the sparser ones, instead of
// needing a separate physical pen per shade. This module groups a detected
// color-separation palette (from vectorizeImageDataColor's k-means or
// supplied-palette path, in vectorizer.ts) into fewer "pens" by hue
// proximity, and re-tags the traced SVG's per-mask `colorIndex` so lighter
// members of a group share their darkest member's pen at a sparser density
// (PathDensityData.density, from the extended ladder in infill.ts) instead
// of getting their own colorIndex/pen.
//
// Deliberately independent of vectorizer.ts and paper.js: this operates
// purely on the already-produced palette (hex strings) and the tag strings
// embedded in the returned SVG, both plain data, so it works equally well
// server-side (main.ts's vectorize handler) and - if ever bundled for it -
// client-side for instant override recomputation without re-tracing.
//
// KEY INSIGHT this module must respect: the physical pen has to be the
// DARKEST member of its group. Lighter shades come from drawing that same
// ink more sparsely, never from a lighter pen standing in for a dark one.

import { InfillDensity, PaletteEntry } from './types';

// --- Thresholds -------------------------------------------------------
//
// Near-greys and near-blacks have numerically unstable hue: HSL saturation
// is computed as chroma / (1 - |2L-1|), so as lightness approaches 0 or 1
// the denominator shrinks toward 0 and tiny sensor/quantization noise in
// the RGB channels gets amplified into a wildly swinging hue angle, even
// though a human looking at the color sees "grey" or "black", not a hue.
// Below the saturation threshold, or beyond either lightness threshold, an
// entry is treated as neutral and grouped with other neutrals rather than
// by its (unreliable) hue.
export const NEUTRAL_SATURATION_THRESHOLD = 0.15;
export const NEUTRAL_BLACK_LIGHTNESS_THRESHOLD = 0.12;
export const NEUTRAL_WHITE_LIGHTNESS_THRESHOLD = 0.92;

// Two colors within this many degrees of circular hue distance are
// considered "the same hue family". 30 degrees matches a 12-sector color
// wheel (the number of hue steps people commonly name - red, orange,
// yellow, ...), which is about the resolution at which two swatches read as
// "the same hue, different shade" rather than "different colors" to a human
// looking at a printed palette.
export const HUE_MERGE_THRESHOLD_DEGREES = 30;

// Bucket id reserved for the neutral group; hue-based bucket ids allocated
// by computeAutoHueGroups start at 0, so this can never collide with one.
const NEUTRAL_BUCKET_ID = -1;

export type Hsl = { h: number; s: number; l: number };

function hexToRgb(hex: string): { r: number; g: number; b: number } {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) / 255;
    const g = parseInt(clean.substring(2, 4), 16) / 255;
    const b = parseInt(clean.substring(4, 6), 16) / 255;
    return { r, g, b };
}

function luminanceOfHex(hex: string): number {
    const { r, g, b } = hexToRgb(hex);
    return 0.299 * r + 0.587 * g + 0.114 * b;
}

export function hexToHsl(hex: string): Hsl {
    const { r, g, b } = hexToRgb(hex);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const delta = max - min;

    let h = 0;
    let s = 0;
    if (delta > 1e-9) {
        s = delta / (1 - Math.abs(2 * l - 1));
        switch (max) {
            case r:
                h = 60 * (((g - b) / delta) % 6);
                break;
            case g:
                h = 60 * ((b - r) / delta + 2);
                break;
            default:
                h = 60 * ((r - g) / delta + 4);
                break;
        }
        if (h < 0) {
            h += 360;
        }
    }

    return { h, s, l };
}

export function isNeutralHsl(hsl: Hsl): boolean {
    return hsl.s < NEUTRAL_SATURATION_THRESHOLD
        || hsl.l < NEUTRAL_BLACK_LIGHTNESS_THRESHOLD
        || hsl.l > NEUTRAL_WHITE_LIGHTNESS_THRESHOLD;
}

function circularHueDistance(h1: number, h2: number): number {
    const diff = Math.abs(h1 - h2) % 360;
    return diff > 180 ? 360 - diff : diff;
}

// Assigns each detected palette entry a bucket id: all neutrals (see
// isNeutralHsl) share NEUTRAL_BUCKET_ID; chromatic entries are clustered by
// sorting on hue and greedily merging neighbors within
// HUE_MERGE_THRESHOLD_DEGREES, including a wraparound check so hues just
// below 360 and just above 0 (both "red") can still merge.
export function computeAutoHueGroups(entries: { index: number; color: string }[]): number[] {
    const bucketIds = new Array<number>(entries.length).fill(NEUTRAL_BUCKET_ID);
    const hsls = entries.map(e => hexToHsl(e.color));

    const chromaticPositions: number[] = [];
    entries.forEach((_e, i) => {
        if (!isNeutralHsl(hsls[i])) {
            chromaticPositions.push(i);
        }
    });

    if (chromaticPositions.length === 0) {
        return bucketIds;
    }

    const sortedByHue = [...chromaticPositions].sort((a, b) => hsls[a].h - hsls[b].h);

    const clusterOfSorted: number[] = [0];
    let nextBucketId = 0;
    for (let k = 1; k < sortedByHue.length; k++) {
        const prevHue = hsls[sortedByHue[k - 1]].h;
        const curHue = hsls[sortedByHue[k]].h;
        if (circularHueDistance(prevHue, curHue) <= HUE_MERGE_THRESHOLD_DEGREES) {
            clusterOfSorted.push(clusterOfSorted[k - 1]);
        } else {
            nextBucketId++;
            clusterOfSorted.push(nextBucketId);
        }
    }

    // Wraparound merge: the last cluster (highest hue) and the first
    // cluster (lowest hue) may actually be adjacent on the color wheel.
    if (clusterOfSorted.length > 1) {
        const firstHue = hsls[sortedByHue[0]].h;
        const lastHue = hsls[sortedByHue[sortedByHue.length - 1]].h;
        const firstId = clusterOfSorted[0];
        const lastId = clusterOfSorted[clusterOfSorted.length - 1];
        if (firstId !== lastId && circularHueDistance(firstHue, lastHue) <= HUE_MERGE_THRESHOLD_DEGREES) {
            for (let k = 0; k < clusterOfSorted.length; k++) {
                if (clusterOfSorted[k] === lastId) {
                    clusterOfSorted[k] = firstId;
                }
            }
        }
    }

    sortedByHue.forEach((originalPosition, k) => {
        bucketIds[originalPosition] = clusterOfSorted[k];
    });

    return bucketIds;
}

// Spreads `count` shades of one pen across the extended density ladder
// (infill.ts), densest first. A lone member gets `undefined` (no override -
// falls back to the request's ordinary infillDensity), since there's no
// tonal ladder to build with only one shade; this also keeps a
// single-member group's output identical to plain (non-hue-grouped)
// colorSeparation.
export function assignDensityLadder(count: number): (InfillDensity | undefined)[] {
    if (count <= 0) {
        return [];
    }
    if (count === 1) {
        return [undefined];
    }

    // Densest -> sparsest; darkest member (index 0) gets the densest level.
    const levels: InfillDensity[] = [7, 6, 5, 4, 3, 2, 1];
    const result: InfillDensity[] = [];
    for (let i = 0; i < count; i++) {
        const idx = Math.round((i * (levels.length - 1)) / (count - 1));
        result.push(levels[idx]);
    }
    return result;
}

export type HueGroupMember = {
    originalIndex: number;
    name: string;
    color: string;
    lightness: number;
    density?: InfillDensity;
};

export type HueGroup = {
    // 0-based, light-to-dark - matches the colorIndex baked into the
    // remapped SVG and the position in the returned palette.
    penIndex: number;
    // The physical pen: name/color of the group's darkest member.
    pen: PaletteEntry;
    // Darkest-first.
    members: HueGroupMember[];
};

export type HueGroupingResult = {
    svg: string;
    // One entry per pen, light-to-dark - drop-in replacement for
    // vectorizeImageDataColor's `palette`, e.g. for RenderSVGRequest.palette.
    palette: PaletteEntry[];
    groups: HueGroup[];
};

type RawColorResult = { svg: string; palette: PaletteEntry[] };

// vectorizeImageDataColor (vectorizer.ts) emits its per-mask tag as
// `<g data-paper-data='{"colorIndex":N}'>`, one `<g>` per palette entry, in
// the same order as the returned palette array. Rewriting relies on that
// fixed shape (matching the same assumption main.ts's combineGrayscaleLevels
// already makes about the tracer's output) rather than parsing the SVG with
// a DOM, so this module stays paper.js/DOM-free.
const GROUP_TAG_RE = /<g data-paper-data='[^']*'>/g;

function remapSvgGroups(svg: string, remap: { colorIndex: number; density?: InfillDensity }[]): string {
    let i = 0;
    return svg.replace(GROUP_TAG_RE, () => {
        const entry = remap[i];
        i++;
        if (!entry) {
            throw new Error('Hue grouping: fewer remap entries than <g> tags in the vectorized SVG');
        }
        const data: { colorIndex: number; density?: InfillDensity } = { colorIndex: entry.colorIndex };
        if (entry.density !== undefined) {
            data.density = entry.density;
        }
        return `<g data-paper-data='${JSON.stringify(data)}'>`;
    });
}

// Applies a (possibly user-overridden) bucket assignment to a raw
// color-separation result, producing the final grouped palette/SVG. Pure
// with respect to `raw` - safe to call repeatedly (e.g. every time the user
// tweaks an override) without re-tracing.
export function buildHueGroupingResult(raw: RawColorResult, bucketIdPerOriginalIndex: number[]): HueGroupingResult {
    if (bucketIdPerOriginalIndex.length !== raw.palette.length) {
        throw new Error('Hue grouping: bucket assignment length must match the palette length');
    }

    const hsls = raw.palette.map(p => hexToHsl(p.color));

    const bucketToIndices = new Map<number, number[]>();
    bucketIdPerOriginalIndex.forEach((bucketId, originalIndex) => {
        const list = bucketToIndices.get(bucketId) || [];
        list.push(originalIndex);
        bucketToIndices.set(bucketId, list);
    });

    const rawGroups = [...bucketToIndices.values()].map(indices => {
        // Darkest (lowest lightness) first - the darkest member becomes the
        // physical pen; the rest ride on it at sparser densities.
        return [...indices].sort((a, b) => hsls[a].l - hsls[b].l);
    });

    // Order groups light -> dark (docs/multi-color.md section 5) by each
    // group's darkest member's luminance, matching the convention used
    // elsewhere (groupPathsByLiteralColor in generator.ts,
    // vectorizeImageDataColor in vectorizer.ts).
    const orderedGroups = [...rawGroups].sort((membersA, membersB) => {
        const darkestA = raw.palette[membersA[0]].color;
        const darkestB = raw.palette[membersB[0]].color;
        return luminanceOfHex(darkestB) - luminanceOfHex(darkestA);
    });

    const groups: HueGroup[] = orderedGroups.map((members, penIndex) => {
        const densities = assignDensityLadder(members.length);
        const groupMembers: HueGroupMember[] = members.map((originalIndex, i) => ({
            originalIndex,
            name: raw.palette[originalIndex].name,
            color: raw.palette[originalIndex].color,
            lightness: hsls[originalIndex].l,
            density: densities[i],
        }));

        return {
            penIndex,
            pen: { name: groupMembers[0].name, color: groupMembers[0].color },
            members: groupMembers,
        };
    });

    const remapByOriginalIndex = new Map<number, { colorIndex: number; density?: InfillDensity }>();
    for (const group of groups) {
        for (const member of group.members) {
            remapByOriginalIndex.set(member.originalIndex, { colorIndex: group.penIndex, density: member.density });
        }
    }

    const orderedRemap: { colorIndex: number; density?: InfillDensity }[] = [];
    for (let originalIndex = 0; originalIndex < raw.palette.length; originalIndex++) {
        orderedRemap.push(remapByOriginalIndex.get(originalIndex)!);
    }

    return {
        svg: remapSvgGroups(raw.svg, orderedRemap),
        palette: groups.map(g => g.pen),
        groups,
    };
}

// Convenience: automatic hue clustering with no manual override.
export function applyHueGrouping(raw: RawColorResult): HueGroupingResult {
    const entries = raw.palette.map((p, index) => ({ index, color: p.color }));
    const bucketIds = computeAutoHueGroups(entries);
    return buildHueGroupingResult(raw, bucketIds);
}

// Applies hueOverrides (RequestTypes.VectorizeRequest.hueOverrides) on top of
// the automatic clustering: any original index present in `overrides` uses
// its caller-chosen bucket id instead of the auto-computed one. Overridden
// bucket ids are offset into a disjoint range from the auto ids so a manual
// reassignment can't accidentally collide with (and silently merge into) an
// unrelated automatic cluster.
export function applyHueGroupingWithOverrides(raw: RawColorResult, overrides: Record<number, number>): HueGroupingResult {
    const entries = raw.palette.map((p, index) => ({ index, color: p.color }));
    const autoBucketIds = computeAutoHueGroups(entries);

    const maxAutoId = autoBucketIds.reduce((max, id) => Math.max(max, id), NEUTRAL_BUCKET_ID);
    const overrideOffset = maxAutoId + 1;

    const bucketIds = autoBucketIds.map((autoId, originalIndex) => {
        const override = overrides[originalIndex];
        return override !== undefined ? overrideOffset + override : autoId;
    });

    return buildHueGroupingResult(raw, bucketIds);
}
