# finitecurve — vendored engine

This directory vendors the compiled WebAssembly engine that powers
[finitecurve.com](https://www.finitecurve.com), an image-to-single-continuous-line
("TSP art") generator, adapted here as Mural's `finiteCurve` renderer.

- Upstream source: https://github.com/koalaman/finitecurve.com
- License: GNU Affero General Public License v3.0 (AGPL-3.0) — see `LICENSE` in this
  directory, copied verbatim from the upstream repository root.

## Provenance

`oneline.js` and `oneline.wasm` were fetched directly from the production site on
2026-08-20:

- `https://www.finitecurve.com/oneline.js`
- `https://www.finitecurve.com/oneline.wasm`

The upstream GitHub repository does not commit built artifacts (`oneline.js`/`.wasm` are
gitignored there and built via `./buildall`, which requires Emscripten), so these were
obtained from the deployed site rather than built locally. The exact commit of
`github.com/koalaman/finitecurve.com` that produced this deployed build is not
independently verifiable from the artifacts themselves — the upstream repository's
`master` branch is the closest available reference for the corresponding source.

## Modifications

- `oneline.wasm` — byte-identical to the fetched file. **Not modified.**
- `oneline.js` — **modified**. The fetched file is finitecurve.com's own Emscripten
  build with that site's `wrapper.js` glue prepended (per upstream's `oneline/Makefile`,
  built via `--pre-js wrapper.js`). That glue assumes `oneline.js` is loaded as the
  entire content of its own dedicated Worker (see upstream's `src/OneLineClient.js`:
  `new Worker("oneline.js")`) — it registers a `'message'` event listener and calls
  `postMessage()` with a result shape specific to that site's own frontend protocol.

  Mural loads this engine from *inside* its own existing Web Worker
  (`worker/src/main.ts`), which already owns the `'message'` event and has its own
  message protocol. The wrapper glue therefore was removed: the function `myInit()`
  (which declared `getMessage()`/`build()`, called `addEventListener("message", ...)`,
  and posted results back out), and the trailing `Module["onRuntimeInitialized"] = myInit;`
  assignment, were deleted. This was 37 lines at the top of the fetched file
  (immediately after the `var Module = ...` line). No other changes were made — the
  Emscripten-generated runtime and the compiled `OneLine` embind bindings underneath are
  otherwise byte-for-byte identical to the fetched file.

  Mural's `worker/src/finiteCurve.ts` calls the underlying `Module.OneLine` bindings
  directly instead of relying on that removed glue.
