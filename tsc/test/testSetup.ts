/**
 * Test-only shim for `loadPaper()` (src/paperLoader.ts).
 *
 * A handful of the plain command-list utilities (deduplicator.ts, trimmer.ts,
 * measurer.ts, utils.ts) import `loadPaper()` purely as a side effect of
 * sharing a module with paper-dependent code -- none of them actually call
 * any paper.js API at runtime. See utils.ts's `isPathWhiteOnly`, which is the
 * only paper-touching export in that file and is unused by the command-list
 * helpers under test here.
 *
 * In this repo, `paper` can only be `require()`d in Node when the native
 * `canvas` addon has a compiled binary: paper.js 0.12.17 runs a blend-mode
 * feature probe at *module load time* (not at `paper.setup()` time) that
 * unconditionally calls `canvas.getContext('2d')`. Per the project's install
 * instructions we run `npm install --ignore-scripts`, so `canvas` never gets
 * its native binary built, and `require('paper')` throws synchronously as
 * soon as it's required -- see paperLoader.ts's `env.server` branch.
 *
 * To exercise the paper-independent pure functions without needing a working
 * `canvas` build, this shim makes `loadPaper()` take its *non-server* branch
 * (`importScripts` + `self.paper`) by stubbing the worker globals it expects,
 * instead of ever touching the real `paper` package. Import this module
 * FIRST -- before importing anything from src/ -- in any test file that
 * (transitively) imports deduplicator/trimmer/measurer/utils.
 *
 * Tests that need the real paper.js geometry engine (pipeline.test.ts) do
 * NOT use this shim -- they set `process.env.server` and attempt to load the
 * real `paper` package directly, skipping gracefully if it's unavailable
 * (i.e. whenever `canvas` hasn't been built).
 */

const globalAny = global as any;

if (typeof globalAny.self === "undefined") {
    globalAny.importScripts = globalAny.importScripts || ((..._urls: string[]) => {});
    globalAny.self = {
        importScripts: globalAny.importScripts,
        paper: {
            install: (..._args: unknown[]) => {},
        },
    };
}

export {};
