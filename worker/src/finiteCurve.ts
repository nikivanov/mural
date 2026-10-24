import { Command, RequestTypes, updateStatusFn } from './types';
import { trimCommands } from './trimmer';
import { dedupeCommands } from './deduplicator';
import { measureDistance } from './measurer';
import { renderCommandsToSvgJson } from './toSvgJson';

declare const importScripts: (url: string) => void;

type OneLineInstance = {
    setImage(data: Uint8Array): void;
    setOptions(json: string): void;
    build(): boolean;
    getResult(): string;
    getError(): string;
    getWidth(): number;
    getHeight(): number;
    getLineDistance(): number;
    delete?(): void;
};

type OneLineModule = {
    OneLine: { new(): OneLineInstance };
};

let modulePromise: Promise<OneLineModule> | null = null;

function loadOneLine(): Promise<OneLineModule> {
    if (!modulePromise) {
        modulePromise = new Promise((resolve) => {
            (self as any).Module = {
                onRuntimeInitialized: () => resolve((self as any).Module as OneLineModule),
            };
            importScripts('./oneline.js');
        });
    }
    return modulePromise;
}

async function encodePng(imageData: ImageData): Promise<Uint8Array> {
    const src = new OffscreenCanvas(imageData.width, imageData.height);
    src.getContext('2d')!.putImageData(imageData, 0, 0);
    const bitmap = await createImageBitmap(src);

    const dst = new OffscreenCanvas(imageData.width, imageData.height);
    const dctx = dst.getContext('2d')!;
    dctx.fillStyle = 'white';
    dctx.fillRect(0, 0, imageData.width, imageData.height);
    dctx.drawImage(bitmap, 0, 0);

    const blob = await dst.convertToBlob({ type: 'image/png' });
    return new Uint8Array(await blob.arrayBuffer());
}

// Flattens a cubic bezier (De Casteljau) into `steps` line segments, returning the
// intermediate + end points (the start point is the caller's responsibility).
function flattenCubic(
    p0: { x: number; y: number },
    p1: { x: number; y: number },
    p2: { x: number; y: number },
    p3: { x: number; y: number },
    steps: number,
): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const mt = 1 - t;
        const x = mt * mt * mt * p0.x + 3 * mt * mt * t * p1.x + 3 * mt * t * t * p2.x + t * t * t * p3.x;
        const y = mt * mt * mt * p0.y + 3 * mt * mt * t * p1.y + 3 * mt * t * t * p2.y + t * t * t * p3.y;
        points.push({ x, y });
    }
    return points;
}

// Parses the single `<path d="M x y C x1,y1 x2,y2 x,y ...">` (or `M x y L x y ...`)
// emitted by oneline's outputSVG() into a flat polyline in the same px coordinate space.
function parseSvgPath(svg: string): { x: number; y: number }[] {
    const match = svg.match(/<path[^>]*\bd='([^']*)'/) ?? svg.match(/<path[^>]*\bd="([^"]*)"/);
    if (!match) return [];
    const d = match[1];

    const tokens = d.trim().split(/\s+/).filter(t => t.length > 0);
    const points: { x: number; y: number }[] = [];
    let current: { x: number; y: number } | null = null;
    let mode: 'M' | 'L' | 'C' | null = null;
    let i = 0;

    const readPoint = (): { x: number; y: number } => {
        const tok = tokens[i++];
        const [xs, ys] = tok.split(',');
        return { x: parseFloat(xs), y: parseFloat(ys) };
    };

    while (i < tokens.length) {
        const tok = tokens[i];
        if (tok === 'M' || tok === 'L' || tok === 'C') {
            mode = tok;
            i++;
            continue;
        }
        if (mode === 'M') {
            const x = parseFloat(tokens[i++]);
            const y = parseFloat(tokens[i++]);
            current = { x, y };
            points.push(current);
        } else if (mode === 'L') {
            const x = parseFloat(tokens[i++]);
            const y = parseFloat(tokens[i++]);
            current = { x, y };
            points.push(current);
        } else if (mode === 'C') {
            const c1 = readPoint();
            const c2 = readPoint();
            const end = readPoint();
            if (current) {
                points.push(...flattenCubic(current, c1, c2, end, 10));
            }
            current = end;
        } else {
            // Unexpected token before any mode letter; skip it defensively.
            i++;
        }
    }

    return points;
}

export async function renderFiniteCurve(
    request: RequestTypes.RenderFiniteCurveRequest,
    updateStatus: updateStatusFn,
): Promise<{ commands: string[]; svgJson: string; distance: number; drawDistance: number }> {
    const { imageData, widthMm, heightMm, homeX, homeY, resolution, contrast, whiteCutoff, invert } = request;

    updateStatus('Loading engine');
    const Module = await loadOneLine();

    updateStatus('Preparing image');
    const pngBytes = await encodePng(imageData);

    const oneLine = new Module.OneLine();
    try {
        oneLine.setImage(pngBytes);
        oneLine.setOptions(JSON.stringify({
            resolution,
            lineWidth: 2.0,
            contrast,
            whiteCutoff,
            invert,
        }));

        updateStatus('Tracing path');
        oneLine.build();

        const error = oneLine.getError();
        if (error) {
            throw new Error(error);
        }

        const svg = oneLine.getResult();
        const pxW = oneLine.getWidth();
        const pxH = oneLine.getHeight();
        const pxPoints = parseSvgPath(svg);

        const toMm = (p: { x: number; y: number }) => ({
            x: (p.x / pxW) * widthMm,
            y: (p.y / pxH) * heightMm,
        });

        const rawCommands: Command[] = ['p0', { x: homeX, y: homeY }];
        if (pxPoints.length > 0) {
            // Travel to the first point while the pen is still up, then lower it —
            // a coordinate command draws using the pen state in effect when it runs,
            // so 'p1' must come after arriving, not before.
            rawCommands.push(toMm(pxPoints[0]));
            rawCommands.push('p1');
            for (let i = 1; i < pxPoints.length; i++) {
                rawCommands.push(toMm(pxPoints[i]));
            }
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
    } finally {
        oneLine.delete?.();
    }
}
