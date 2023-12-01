import paper from 'paper';

let loaded = false;
export function loadPaper(): paper.PaperScope {
    if (!loaded) {
        importScripts("https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.17/paper-full.min.js");
        (self.paper as any as paper.PaperScope).install(self);
        loaded = true;
    }

    return self.paper as any as paper.PaperScope;
}