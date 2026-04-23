import { Command, RequestTypes, updateStatusFn } from './types';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { renderCommandsToSvgJson } from './toSvgJson';

function getPixelLuma(data: Uint8ClampedArray, imgW: number, px: number, py: number): number {
    const i = (py * imgW + px) * 4;
    return 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
}

function adjustBrightnessContrast(luma: number, brightness: number, contrast: number): number {
    luma += brightness * (128 / 100);
    if (contrast !== 0) {
        const factor = (259 * (contrast + 255)) / (255 * (259 - contrast));
        luma = factor * (luma - 127.5) + 127.5;
    }
    return Math.max(0, Math.min(255, luma)) / 255; // 0=black, 1=white
}

/**
 * Clip parametric line P(t) = (ox + t*dx, oy + t*dy) to the rectangle
 * [0, w] × [0, h]. Returns the [tMin, tMax] interval, or null if no intersection.
 */
function clipLine(
    ox: number, oy: number, dx: number, dy: number,
    w: number, h: number,
): { tMin: number; tMax: number } | null {
    let tMin = -Infinity, tMax = Infinity;

    if (Math.abs(dx) < 1e-9) {
        if (ox < 0 || ox > w) return null;
    } else {
        const t1 = (0 - ox) / dx;
        const t2 = (w - ox) / dx;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
    }

    if (Math.abs(dy) < 1e-9) {
        if (oy < 0 || oy > h) return null;
    } else {
        const t1 = (0 - oy) / dy;
        const t2 = (h - oy) / dy;
        tMin = Math.max(tMin, Math.min(t1, t2));
        tMax = Math.min(tMax, Math.max(t1, t2));
    }

    if (tMin >= tMax - 1e-9) return null;
    return { tMin, tMax };
}

export function renderRasterZigZag(
    request: RequestTypes.RenderRasterZigZagRequest,
    updateStatus: updateStatusFn,
): { commands: string[]; svgJson: string; distance: number; drawDistance: number } {
    const { imageData, widthMm, heightMm, homeX, homeY, lineSpacing, amplitude, brightness, contrast, blackPoint, whitePoint, angle, continuousPath, trimWhite, imageLeft, imageTop, imageRight, imageBottom } = request;
    const { data, width: imgW, height: imgH } = imageData;

    const angleRad = (angle * Math.PI) / 180;
    // lineDir: direction along the scan line
    // perpDir: direction between scan lines (zig-zag displacement direction)
    const lineDx = Math.cos(angleRad);
    const lineDy = Math.sin(angleRad);
    const perpDx = -Math.sin(angleRad);
    const perpDy = Math.cos(angleRad);

    // Project canvas corners onto perpDir to find the full perpendicular coverage
    const corners = [[0, 0], [widthMm, 0], [widthMm, heightMm], [0, heightMm]];
    const projections = corners.map(([cx, cy]) => cx * perpDx + cy * perpDy);
    const dMin = Math.min(...projections);
    const dMax = Math.max(...projections);

    const numLines = Math.ceil((dMax - dMin) / lineSpacing) + 1;
    const rawCommands: Command[] = [];
    let penDown = false;
    let drawnLineCount = 0; // counts only lines that survive all skips

    rawCommands.push('p0');
    rawCommands.push({ x: homeX, y: homeY });

    for (let lineIdx = 0; lineIdx < numLines; lineIdx++) {
        updateStatus(`Generating line ${lineIdx + 1} of ${numLines}`);

        const d = dMin + lineIdx * lineSpacing;

        // Origin of this scan line: d * perpDir
        const ox = d * perpDx;
        const oy = d * perpDy;

        const clip = clipLine(ox, oy, lineDx, lineDy, widthMm, heightMm);
        if (!clip) continue;

        const { tMin, tMax } = clip;
        const numSamples = Math.ceil(tMax - tMin) + 1;

        // Build points LTR (from tMin to tMax), using position index for zig-zag phase
        const points: { x: number; y: number }[] = [];
        const darknesses: number[] = [];
        for (let j = 0; j < numSamples; j++) {
            const t = Math.min(tMin + j, tMax);

            const x_mm = ox + t * lineDx;
            const y_mm = oy + t * lineDy;

            const px = Math.min(Math.max(Math.round((x_mm / widthMm) * (imgW - 1)), 0), imgW - 1);
            const py = Math.min(Math.max(Math.round((y_mm / heightMm) * (imgH - 1)), 0), imgH - 1);

            const luma = getPixelLuma(data, imgW, px, py);
            let t_norm = adjustBrightnessContrast(luma, brightness, contrast);
            t_norm = whitePoint > blackPoint
                ? (Math.max(blackPoint, Math.min(whitePoint, t_norm)) - blackPoint) / (whitePoint - blackPoint)
                : 0.5;
            const darkness = 1 - t_norm;
            darknesses.push(darkness);

            const localAmplitude = darkness * amplitude;
            const sign = j % 2 === 0 ? 1 : -1;

            points.push({
                x: Math.max(0, Math.min(widthMm, x_mm + sign * localAmplitude * perpDx)),
                y: Math.max(0, Math.min(heightMm, y_mm + sign * localAmplitude * perpDy)),
            });
        }

        // Always trim points outside the image bounds (pan/zoom/crop region).
        // Points outside have no image data regardless of trimWhite setting.
        let bFirst = 0;
        let bLast = points.length - 1;
        while (bFirst <= bLast && (points[bFirst].x < imageLeft || points[bFirst].x > imageRight || points[bFirst].y < imageTop || points[bFirst].y > imageBottom)) bFirst++;
        while (bLast >= bFirst && (points[bLast].x < imageLeft || points[bLast].x > imageRight || points[bLast].y < imageTop || points[bLast].y > imageBottom)) bLast--;
        if (bFirst > bLast) continue; // entire line outside image — skip

        let activePoints = points.slice(bFirst, bLast + 1);

        // Optionally also trim leading/trailing flat (white) samples within the image
        if (trimWhite) {
            const FLAT = 0.05;
            const activeDarknesses = darknesses.slice(bFirst, bLast + 1);
            let first = 0;
            let last = activePoints.length - 1;
            while (first <= last && activeDarknesses[first] < FLAT) first++;
            while (last >= first && activeDarknesses[last] < FLAT) last--;
            if (first > last) continue;
            activePoints = activePoints.slice(first, last + 1);
        }

        // Boustrophedon: reverse every other *drawn* line to minimise pen travel.
        // Must use drawnLineCount, not lineIdx — skipped lines still increment lineIdx
        // and would corrupt the even/odd pattern (especially visible at non-zero angles).
        if (drawnLineCount % 2 !== 0) activePoints.reverse();
        drawnLineCount++;

        if (continuousPath) {
            if (!penDown) {
                rawCommands.push({ x: activePoints[0].x, y: activePoints[0].y });
                rawCommands.push('p1');
                penDown = true;
                for (let k = 1; k < activePoints.length; k++) rawCommands.push({ x: activePoints[k].x, y: activePoints[k].y });
            } else {
                for (let k = 0; k < activePoints.length; k++) rawCommands.push({ x: activePoints[k].x, y: activePoints[k].y });
            }
        } else {
            rawCommands.push('p0');
            rawCommands.push({ x: activePoints[0].x, y: activePoints[0].y });
            rawCommands.push('p1');
            for (let k = 1; k < activePoints.length; k++) rawCommands.push({ x: activePoints[k].x, y: activePoints[k].y });
        }
    }

    rawCommands.push('p0');


    const trimmed = trimCommands(rawCommands);
    const deduped = dedupeCommands(trimmed);

    deduped.unshift(`h${heightMm}`);
    const distances = measureDistance(deduped);
    const totalDistance = +distances.totalDistance.toFixed(1);
    deduped.unshift(`d${totalDistance}`);

    const commandStrings = deduped.map((c) =>
        typeof c === 'string' ? c : `${c.x} ${c.y}`,
    );

    const svgJson = renderCommandsToSvgJson(commandStrings, widthMm, heightMm, updateStatus);

    return {
        commands: commandStrings,
        svgJson,
        distance: totalDistance,
        drawDistance: +distances.drawDistance.toFixed(1),
    };
}
