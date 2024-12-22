import paper from 'paper';
import { env } from 'process';

let loaded = false;
export function loadPaper(): paper.PaperScope {
    if (env && env["server"]) {
        const paperModule = require("paper");
        return paperModule;
    } else {
        if (!loaded) {
            importScripts("https://cdnjs.cloudflare.com/ajax/libs/paper.js/0.12.17/paper-full.min.js");
            (self.paper as any as paper.PaperScope).install(self);
            loaded = true;
        }
    
        return self.paper as any as paper.PaperScope;
    }
    
}