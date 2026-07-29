import { Command, RequestTypes, updateStatusFn } from './types';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { renderCommandsToSvgJson } from './toSvgJson';
import { createRasterField } from './rasterField';

/**
 * Adaptive-density Hilbert curve: the image area is subdivided into a quadtree
 * where darker regions get smaller cells, and all leaf-cell centers are visited
 * in Hilbert order. Consecutive centers are spatially adjacent, so the whole
 * drawing is one continuous path with (near) zero pen lifts; tone is reproduced
 * by local path density in both axes.
 */
export function renderRasterSpaceFill(
    request: RequestTypes.RenderRasterSpaceFillRequest,
    updateStatus: updateStatusFn,
): { commands: string[]; svgJson: string; distance: number; drawDistance: number } {
    const { imageData, widthMm, heightMm, homeX, homeY, minSpacing, brightness, contrast, blackPoint, whitePoint, gamma, whiteCutoff, liftOnTransparent, imageLeft, imageTop, imageRight, imageBottom } = request;
    const maxSpacing = Math.max(request.maxSpacing, minSpacing);

    updateStatus('Sampling image');
    const field = createRasterField(imageData, widthMm, heightMm, { brightness, contrast, blackPoint, whitePoint, gamma });

    // Root square: smallest power-of-2 multiple of minSpacing covering the image
    // content bbox, centered on it, so leaves land exactly on spacing multiples.
    const bboxW = imageRight - imageLeft;
    const bboxH = imageBottom - imageTop;
    let side = minSpacing;
    while (side < Math.max(bboxW, bboxH)) side *= 2;
    const rootX = imageLeft + (bboxW - side) / 2;
    const rootY = imageTop + (bboxH - side) / 2;

    const rawCommands: Command[] = [];
    let penDown = false;
    let lastPenPos: { x: number; y: number } | null = null;
    let leafCount = 0;
    // Consecutive Hilbert leaves are at most ~maxSpacing apart; larger gaps only
    // appear across skipped (blank) regions, where a lift is wanted.
    const linkGap = 2 * maxSpacing;

    rawCommands.push('p0');
    rawCommands.push({ x: homeX, y: homeY });

    const emitLeaf = (cx: number, cy: number, s: number) => {
        if (++leafCount % 4096 === 0) updateStatus(`Tracing curve (${leafCount} cells)`);
        if (cx < imageLeft || cx > imageRight || cy < imageTop || cy > imageBottom) return;
        if (field.darknessAt(cx, cy, s) < whiteCutoff) return;
        if (liftOnTransparent && field.alphaAt(cx, cy) === 0) return;

        if (penDown && lastPenPos !== null && Math.hypot(cx - lastPenPos.x, cy - lastPenPos.y) <= linkGap) {
            rawCommands.push({ x: cx, y: cy });
        } else {
            if (penDown) { rawCommands.push('p0'); penDown = false; }
            rawCommands.push({ x: cx, y: cy });
            rawCommands.push('p1');
            penDown = true;
        }
        lastPenPos = { x: cx, y: cy };
    };

    // Hilbert recursion over a square spanned by axis-aligned vectors A=(xi,xj)
    // and B=(yi,yj) from corner (x0,y0). Recursing swaps/reflects the axes so
    // the traversal order of leaf centers forms a continuous Hilbert curve.
    const visit = (x0: number, y0: number, xi: number, xj: number, yi: number, yj: number) => {
        const minX = Math.min(x0, x0 + xi + yi);
        const maxX = Math.max(x0, x0 + xi + yi);
        const minY = Math.min(y0, y0 + xj + yj);
        const maxY = Math.max(y0, y0 + xj + yj);
        const s = maxX - minX;

        // Cells fully outside the image content contribute nothing at any depth.
        if (maxX < imageLeft || minX > imageRight || maxY < imageTop || minY > imageBottom) return;

        let subdivide = false;
        if (s > minSpacing) {
            if (s > maxSpacing) {
                subdivide = true;
            } else {
                const dk = field.averageDarkness(
                    Math.max(minX, imageLeft), Math.max(minY, imageTop),
                    Math.min(maxX, imageRight), Math.min(maxY, imageBottom),
                );
                // Each subdivision level doubles linear path density, so the
                // darkness → cell size mapping is exponential.
                const targetSize = maxSpacing * Math.pow(minSpacing / maxSpacing, dk);
                // Leaf sizes are quantized to powers of 2, which bands smooth
                // gradients; dithering the threshold per cell (deterministic
                // position hash) trades the bands for spatial noise.
                const hash = Math.sin(minX * 12.9898 + minY * 78.233) * 43758.5453;
                const dither = Math.pow(2, (hash - Math.floor(hash)) - 0.5);
                subdivide = s > targetSize * dither;
            }
        }

        if (!subdivide) {
            emitLeaf(x0 + (xi + yi) / 2, y0 + (xj + yj) / 2, s);
            return;
        }

        visit(x0, y0, yi / 2, yj / 2, xi / 2, xj / 2);
        visit(x0 + xi / 2, y0 + xj / 2, xi / 2, xj / 2, yi / 2, yj / 2);
        visit(x0 + xi / 2 + yi / 2, y0 + xj / 2 + yj / 2, xi / 2, xj / 2, yi / 2, yj / 2);
        visit(x0 + xi / 2 + yi, y0 + xj / 2 + yj, -yi / 2, -yj / 2, -xi / 2, -xj / 2);
    };

    visit(rootX, rootY, side, 0, 0, side);

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
