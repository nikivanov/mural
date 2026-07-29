export type RasterFieldOpts = {
    brightness: number;
    contrast: number;
    blackPoint: number;
    whitePoint: number;
    gamma: number;
};

export type RasterField = {
    /** Working-grid width in px */
    gridW: number;
    /** Working-grid height in px */
    gridH: number;
    /** Darkness (0=white, 1=black) per working-grid pixel, row-major */
    grid: Float32Array;
    pxPerMmX: number;
    pxPerMmY: number;
    /** Area-averaged darkness over a square footprint (mm) centered at (xMm, yMm) */
    darknessAt(xMm: number, yMm: number, footprintMm: number): number;
    /** Average alpha (0-255) of the working-grid pixel containing (xMm, yMm) */
    alphaAt(xMm: number, yMm: number): number;
    /** Area-averaged darkness over an arbitrary mm rectangle */
    averageDarkness(x0Mm: number, y0Mm: number, x1Mm: number, y1Mm: number): number;
};

// The pen is ~1 mm wide, so sub-mm image detail can't be reproduced anyway;
// capping the working grid keeps the summed-area table small for large photos.
const MAX_FIELD_DIM = 1600;

/**
 * Precomputes a darkness field from an image: luma composited against white,
 * brightness/contrast, black/white point levels, then a gamma curve
 * (darkness^gamma; gamma 1 = linear). A summed-area table enables O(1)
 * area-averaged queries, so samples represent the ink footprint rather than
 * a single nearest pixel.
 */
export function createRasterField(
    imageData: ImageData,
    widthMm: number,
    heightMm: number,
    opts: RasterFieldOpts,
): RasterField {
    const { data, width: srcW, height: srcH } = imageData;
    const { brightness, contrast, blackPoint, whitePoint, gamma } = opts;

    const scale = Math.min(1, MAX_FIELD_DIM / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const darkSum = new Float64Array(w * h);
    const alphaSum = new Float64Array(w * h);
    const count = new Uint32Array(w * h);

    const contrastFactor = (259 * (contrast + 255)) / (255 * (259 - contrast));

    for (let sy = 0; sy < srcH; sy++) {
        const by = Math.min(h - 1, Math.floor((sy * h) / srcH));
        for (let sx = 0; sx < srcW; sx++) {
            const bx = Math.min(w - 1, Math.floor((sx * w) / srcW));
            const i = (sy * srcW + sx) * 4;
            const a = data[i + 3] / 255;
            // Composite against white so transparent areas read as white (not black).
            let luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
            luma = luma * a + 255 * (1 - a);
            luma += brightness * (128 / 100);
            if (contrast !== 0) luma = contrastFactor * (luma - 127.5) + 127.5;
            let t = Math.max(0, Math.min(255, luma)) / 255;
            t = whitePoint > blackPoint
                ? (Math.max(blackPoint, Math.min(whitePoint, t)) - blackPoint) / (whitePoint - blackPoint)
                : 0.5;
            let darkness = 1 - t;
            if (gamma !== 1) darkness = Math.pow(darkness, gamma);
            const bi = by * w + bx;
            darkSum[bi] += darkness;
            alphaSum[bi] += data[i + 3];
            count[bi]++;
        }
    }

    const grid = new Float32Array(w * h);
    const alphaGrid = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) {
        if (count[i] > 0) {
            grid[i] = darkSum[i] / count[i];
            alphaGrid[i] = alphaSum[i] / count[i];
        }
    }

    // Summed-area table, (w+1) x (h+1); row 0 and column 0 stay zero.
    const sat = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y++) {
        let rowSum = 0;
        for (let x = 0; x < w; x++) {
            rowSum += grid[y * w + x];
            sat[(y + 1) * (w + 1) + (x + 1)] = sat[y * (w + 1) + (x + 1)] + rowSum;
        }
    }

    const pxPerMmX = w / widthMm;
    const pxPerMmY = h / heightMm;

    function averageDarkness(x0Mm: number, y0Mm: number, x1Mm: number, y1Mm: number): number {
        let px0 = Math.max(0, Math.min(w - 1, Math.floor(x0Mm * pxPerMmX)));
        let py0 = Math.max(0, Math.min(h - 1, Math.floor(y0Mm * pxPerMmY)));
        let px1 = Math.max(px0 + 1, Math.min(w, Math.ceil(x1Mm * pxPerMmX)));
        let py1 = Math.max(py0 + 1, Math.min(h, Math.ceil(y1Mm * pxPerMmY)));
        const area = (px1 - px0) * (py1 - py0);
        const s = sat[py1 * (w + 1) + px1] - sat[py0 * (w + 1) + px1]
                - sat[py1 * (w + 1) + px0] + sat[py0 * (w + 1) + px0];
        return s / area;
    }

    return {
        gridW: w,
        gridH: h,
        grid,
        pxPerMmX,
        pxPerMmY,
        averageDarkness,
        darknessAt(xMm: number, yMm: number, footprintMm: number): number {
            const half = footprintMm / 2;
            return averageDarkness(xMm - half, yMm - half, xMm + half, yMm + half);
        },
        alphaAt(xMm: number, yMm: number): number {
            const px = Math.max(0, Math.min(w - 1, Math.floor(xMm * pxPerMmX)));
            const py = Math.max(0, Math.min(h - 1, Math.floor(yMm * pxPerMmY)));
            return alphaGrid[py * w + px];
        },
    };
}
