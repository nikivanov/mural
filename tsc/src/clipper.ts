import {loadPaper} from './paperLoader';

const paper = loadPaper();

export function clipPaths(svg: paper.Item) {
    const boundaryRectangle = new paper.Path.Rectangle(paper.project.view.bounds);

    clipPathRecursive(svg, boundaryRectangle);
}

function clipPathRecursive(item: paper.Item, boundaryRectangle: paper.Path.Rectangle) {
    for (const child of item.children) {
        if (child instanceof paper.Path || child instanceof paper.CompoundPath) {
            if (!boundaryRectangle.contains(child.bounds)) {
                const clippedPath = boundaryRectangle.intersect(child, {
                    insert: false,
                });
                child.replaceWith(clippedPath);
            }
        } else if (child instanceof paper.Group) {
            clipPathRecursive(child, boundaryRectangle);
        }
    }
}
