import { Command, RequestTypes, updateStatusFn } from './types';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { renderCommandsToSvgJson } from './toSvgJson';

function getPixelLuma(data: Uint8ClampedArray, imgW: number, px: number, py: number): number {
    const i = (py * imgW + px) * 4;
    const alpha = data[i + 3] / 255;
    // Composite against white so that transparent areas read as white (not black).
    const luma = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    return luma * alpha + 255 * (1 - alpha);
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
): { commands: string[]; svgJson: string; distance: number; drawDistance: number; penLiftCount: number } {
    const { imageData, widthMm, heightMm, homeX, homeY, lineSpacing, amplitude, brightness, contrast, blackPoint, whitePoint, angle, continuousPath, liftOnTransparent, imageLeft, imageTop, imageRight, imageBottom, minHalfPeriod, maxHalfPeriod, useAmFm } = request;
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
    let lastPenPos: { x: number; y: number } | null = null;
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

        const points: { x: number; y: number }[] = [];
        const rawPoints: { x: number; y: number }[] = []; // unclamped, used for boundary trimming

        const samplePixel = (x_mm: number, y_mm: number): { darkness: number; alpha: number } => {
            const px = Math.min(Math.max(Math.round((x_mm / widthMm) * (imgW - 1)), 0), imgW - 1);
            const py = Math.min(Math.max(Math.round((y_mm / heightMm) * (imgH - 1)), 0), imgH - 1);
            const luma = getPixelLuma(data, imgW, px, py);
            let t_norm = adjustBrightnessContrast(luma, brightness, contrast);
            t_norm = whitePoint > blackPoint
                ? (Math.max(blackPoint, Math.min(whitePoint, t_norm)) - blackPoint) / (whitePoint - blackPoint)
                : 0.5;
            return { darkness: 1 - t_norm, alpha: data[(py * imgW + px) * 4 + 3] };
        };

        const alphas: number[] = [];

        if (useAmFm) {
            // AM+FM sinusoidal squiggle: quarter-period steps (4 points/cycle),
            // frequency and amplitude both scale with local darkness.
            let t = tMin;
            let phase = 0;
            while (t <= tMax) {
                const x_mm = ox + t * lineDx;
                const y_mm = oy + t * lineDy;
                const { darkness, alpha } = samplePixel(x_mm, y_mm);
                alphas.push(alpha);
                const halfPeriod = Math.max(maxHalfPeriod - darkness * (maxHalfPeriod - minHalfPeriod), 0.01);
                const disp = Math.sin(2 * Math.PI * phase) * darkness * amplitude;
                const rawX = x_mm + disp * perpDx;
                const rawY = y_mm + disp * perpDy;
                rawPoints.push({ x: rawX, y: rawY });
                points.push({
                    x: Math.max(imageLeft, Math.min(imageRight, rawX)),
                    y: Math.max(imageTop, Math.min(imageBottom, rawY)),
                });
                phase += 0.25;
                t += halfPeriod / 2;
            }
        } else {
            // Original AM-only: fixed 1 mm steps, triangle wave.
            const numSamples = Math.ceil(tMax - tMin) + 1;
            for (let j = 0; j < numSamples; j++) {
                const t = Math.min(tMin + j, tMax);
                const x_mm = ox + t * lineDx;
                const y_mm = oy + t * lineDy;
                const { darkness, alpha } = samplePixel(x_mm, y_mm);
                alphas.push(alpha);
                const sign = j % 2 === 0 ? 1 : -1;
                const rawX = x_mm + sign * darkness * amplitude * perpDx;
                const rawY = y_mm + sign * darkness * amplitude * perpDy;
                rawPoints.push({ x: rawX, y: rawY });
                points.push({
                    x: Math.max(imageLeft, Math.min(imageRight, rawX)),
                    y: Math.max(imageTop, Math.min(imageBottom, rawY)),
                });
            }
        }

        // Trim leading/trailing points where the unclamped displacement exits the image
        // bounds. Using rawPoints (not points) is essential: clamped points always satisfy
        // the bounds check, so trimming against them is a no-op — which causes clamped
        // endpoint clusters to form a visible perimeter line at non-0/90° angles.
        let bFirst = 0;
        let bLast = points.length - 1;
        while (bFirst <= bLast && (rawPoints[bFirst].x < imageLeft || rawPoints[bFirst].x > imageRight || rawPoints[bFirst].y < imageTop || rawPoints[bFirst].y > imageBottom)) bFirst++;
        while (bLast >= bFirst && (rawPoints[bLast].x < imageLeft || rawPoints[bLast].x > imageRight || rawPoints[bLast].y < imageTop || rawPoints[bLast].y > imageBottom)) bLast--;
        if (bFirst > bLast) continue; // entire line outside image — skip

        let activePoints = points.slice(bFirst, bLast + 1);
        let activeAlphas = alphas.slice(bFirst, bLast + 1);

        // Boustrophedon: reverse every other *drawn* line to minimise pen travel.
        // Must use drawnLineCount, not lineIdx — skipped lines still increment lineIdx
        // and would corrupt the even/odd pattern (especially visible at non-zero angles).
        if (drawnLineCount % 2 !== 0) {
            activePoints.reverse();
            activeAlphas.reverse();
        }
        drawnLineCount++;

        // Split the line into sub-segments wherever a fully transparent pixel is encountered.
        const segments: { x: number; y: number }[][] = [];
        if (liftOnTransparent) {
            let current: { x: number; y: number }[] = [];
            for (let i = 0; i < activePoints.length; i++) {
                if (activeAlphas[i] === 0) {
                    if (current.length > 0) { segments.push(current); current = []; }
                } else {
                    current.push(activePoints[i]);
                }
            }
            if (current.length > 0) segments.push(current);
        } else {
            segments.push(activePoints);
        }
        if (segments.length === 0) continue;

        for (let si = 0; si < segments.length; si++) {
            const seg = segments[si];
            const gapTooBig = lastPenPos !== null
                && Math.hypot(seg[0].x - lastPenPos.x, seg[0].y - lastPenPos.y) > 2 * lineSpacing;

            if (continuousPath && si === 0 && penDown && !gapTooBig) {
                for (const pt of seg) rawCommands.push({ x: pt.x, y: pt.y });
            } else if (continuousPath && si === 0 && !penDown) {
                rawCommands.push({ x: seg[0].x, y: seg[0].y });
                rawCommands.push('p1');
                penDown = true;
                for (let k = 1; k < seg.length; k++) rawCommands.push({ x: seg[k].x, y: seg[k].y });
            } else {
                // Non-continuous, gap too large, or segment after a transparent break.
                if (penDown) { rawCommands.push('p0'); penDown = false; }
                rawCommands.push({ x: seg[0].x, y: seg[0].y });
                rawCommands.push('p1');
                penDown = true;
                for (let k = 1; k < seg.length; k++) rawCommands.push({ x: seg[k].x, y: seg[k].y });
            }
            lastPenPos = seg[seg.length - 1];
        }
    }

    rawCommands.push('p0');


    const trimmed = trimCommands(rawCommands);
    const deduped = dedupeCommands(trimmed, request.penLiftThresholdMm);

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
        penLiftCount: distances.penLiftCount,
    };
}
