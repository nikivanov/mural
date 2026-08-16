// Pen ink capacity estimates (docs/multi-color.md section 5's "pen ink
// estimates" item). Purely client-side and cosmetic - never sent to the
// firmware - so a layer's estimated ink usage ("12.4 m ~ 0.03 Sharpies") can
// be shown next to its distance breakdown.
//
// Defaults are PAPER figures (this user plots on paper, not walls), rough
// and meant to be edited: ballpoint/gel/rollerball/fineliner/marker capacity
// varies a lot by brand, paper, and line width.
export const DEFAULT_PEN_CAPACITIES = {
    "Ballpoint": 2500,
    "Gel pen": 600,
    "Rollerball": 500,
    "Fineliner": 700,
    "Sharpie (fine)": 400,
    "Whiteboard marker": 300,
};

const STORAGE_KEY = "muralPenCapacitiesM";

export function loadPenCapacities() {
    try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
        if (stored && typeof stored === "object" && Object.keys(stored).length > 0) {
            return stored;
        }
    } catch (err) {
        // fall through to defaults
    }
    return { ...DEFAULT_PEN_CAPACITIES };
}

export function savePenCapacities(capacities) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(capacities));
}

export function resetPenCapacities() {
    localStorage.removeItem(STORAGE_KEY);
    return { ...DEFAULT_PEN_CAPACITIES };
}

// Returns {fraction, text} for how much of one pen's estimated capacity a
// layer's draw distance (in meters) would use, or null if no pen type is
// selected for that layer.
export function estimatePenUsage(distanceM, capacityM) {
    if (!capacityM || capacityM <= 0) {
        return null;
    }
    const fraction = distanceM / capacityM;
    return {
        fraction,
        text: `${distanceM.toFixed(1)} m ≈ ${fraction.toFixed(2)} pens`,
    };
}
