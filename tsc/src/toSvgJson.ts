import { loadPaper } from './paperLoader';
import {updateStatusFn} from './types';

const paper = loadPaper();

// Multi-color tinted preview (docs/multi-color.md section 6): when
// `layerColors` is supplied, each `c<index>` boundary in `commands` switches
// the stroke color used for subsequently-reconstructed paths to
// `layerColors[index - 1]` (1-based, matching the command file's
// convention), so the preview shows what the finished multi-color piece will
// actually look like. Omitted/empty for the existing single-color preview,
// which stays solid black exactly as before.
export function renderCommandsToSvgJson(commands: string[], width: number, height: number, updateStatusFn: updateStatusFn, layerColors?: string[]): string {
    updateStatusFn("Rendering result");
    const size = new paper.Size(width, height);
    paper.setup(size);

    const layer = paper.project.activeLayer;

    let pathPoints: paper.Point[] = [];
    // The first layer draws with whatever pen is already mounted, so no
    // `c<index>` marker precedes it - its color (if any) is layerColors[0].
    let currentStrokeColor = (layerColors && layerColors[0]) || 'black';

    let penUp = true;
    function handlePenChange(newPenUp: boolean) {
        if (penUp === newPenUp) {
            // no change in state, nothing to do
            return;
        }

        if (penUp) {
            // the pen was up, now it's down
            // discard whatever points we've accumulated while not drawing except the last one, which
            // is our starting

            penUp = false;
            if (pathPoints.length > 1) {
                pathPoints = [pathPoints[pathPoints.length - 1]];
            }
        } else {
            penUp = true;
            // then pen was down, now it's up
            // create a path out of path points we've traveled so far
            if (pathPoints.length > 1) {
                const segments = pathPoints.map(p => new paper.Segment(p));
                const path = new paper.Path(segments);
                path.fillColor = new paper.Color('transparent');
                path.strokeColor = new paper.Color(currentStrokeColor);
                layer.addChild(path);

                pathPoints = [pathPoints[pathPoints.length - 1]];
            }
        }
    }

    for (const command of commands) {
        const firstChar = command.charAt(0);
        if (firstChar === 'd') {
            console.log(`Total distance ${command.slice(1)}`);
            continue;
        } else if (firstChar === 'h') {
            console.log(`Drawing height is ${command.slice(1)}`);
            continue;
        } else if (firstChar === 't') {
            console.log(`Pin distance is ${command.slice(1)}`);
            continue;
        } else if (firstChar === 'n' && /^n\d+ /.test(command)) {
            // Palette metadata header - not a drawn command.
            continue;
        } else if (firstChar === 'c' && /^c\d+$/.test(command)) {
            const layerIndex = parseInt(command.slice(1), 10);
            if (layerColors && layerColors[layerIndex - 1]) {
                currentStrokeColor = layerColors[layerIndex - 1];
            }
            continue;
        } else if (firstChar === 'p') {
            const secondChar = command.charAt(1);
            if (secondChar === '1') {
                handlePenChange(false);
            } else if (secondChar === '0') {
                handlePenChange(true);
            }
        }
        else {
            const coords = command.split(' ');
            const x = parseFloat(coords[0]);
            const y = parseFloat(coords[1]);
            pathPoints.push(new paper.Point(x, y));
        }
    }

    handlePenChange(true);

    const backgroundPath = new paper.Path([
        new paper.Segment({x: 0, y: 0}),
        new paper.Segment({x: width, y: 0}),
        new paper.Segment({x: width, y: height}),
        new paper.Segment({x: 0, y: height}),
        new paper.Segment({x: 0, y: 0}),
    ]);
    backgroundPath.fillColor = new paper.Color('#ffffff');
    backgroundPath.strokeColor = new paper.Color('transparent');
    layer.addChild(backgroundPath);
    backgroundPath.sendToBack();
    
    return paper.project.exportJSON({
        asString: true,
    });
}