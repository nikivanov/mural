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
    const { imageData, widthMm, heightMm, homeX, homeY, lineSpacing, amplitude, brightness, contrast, angle, continuousPath, trimWhite } = request;
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
            const t_norm = adjustBrightnessContrast(luma, brightness, contrast);
            const darkness = 1 - t_norm;
            darknesses.push(darkness);

            const localAmplitude = darkness * amplitude;
            const sign = j % 2 === 0 ? 1 : -1;

            points.push({
                x: Math.max(0, Math.min(widthMm, x_mm + sign * localAmplitude * perpDx)),
                y: Math.max(0, Math.min(heightMm, y_mm + sign * localAmplitude * perpDy)),
            });
        }

        // Trim leading/trailing flat (white) samples before reversing so
        // trimming is always relative to physical position along the line
        let activePoints = points;
        if (trimWhite) {
            const FLAT = 0.05;
            let first = 0;
            let last = points.length - 1;
            while (first < points.length && darknesses[first] < FLAT) first++;
            while (last > first && darknesses[last] < FLAT) last--;
            if (first >= points.length) continue; // entire line is white — skip
            activePoints = points.slice(first, last + 1);
        }

        // Boustrophedon: reverse every other line to minimise pen travel
        if (lineIdx % 2 !== 0) activePoints.reverse();

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

    // Perimeter rectangle — always appended when continuousPath is on
    if (continuousPath) {
        rawCommands.push({ x: 0, y: 0 });
        rawCommands.push('p1');
        rawCommands.push({ x: widthMm, y: 0 });
        rawCommands.push({ x: widthMm, y: heightMm });
        rawCommands.push({ x: 0, y: heightMm });
        rawCommands.push({ x: 0, y: 0 });
        rawCommands.push('p0');
    }

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
