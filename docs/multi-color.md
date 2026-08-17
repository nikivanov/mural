# Multi-Color Drawing (Design)

This document proposes support for drawing with more than one pen color on Mural,
via manual pen swaps between color layers. It is a design doc, not an implementation
— see the effort/phasing table at the end for a suggested build order.

Everything here is grounded in the current pipeline:

- `tsc/src/*.ts` — the browser-side worker (`tsc/src/main.ts`) that turns a raster
  image or an SVG into the plotter's command file. "tsc" is this project's name for
  that worker, not the TypeScript compiler.
- `src/*.cpp`, `src/tasks/*`, `src/phases/*` — the ESP32 firmware that streams the
  command file to the steppers and servo.

## 1. Separation: turning one image into N single-color layers

Mural already has two ways of getting from source art to drawable paths:

- **Vector → Raster → Vector.** `vectorizeImageData()` in `tsc/src/vectorizer.ts`
  rasterizes the input, builds a single binary bitmap (`bmColor` is 1 for any pixel
  that isn't fully transparent and isn't white, 0 otherwise — see
  `createPathsFromColorMatrix`, `tsc/src/vectorizer.ts:31-56`), and traces that one
  bitmap with Potrace (`tsc/src/tracer.js`) to get a single-color SVG.
- **Path-tracing mode**, i.e. importing an already-vector SVG directly, skipping
  `vectorizer.ts` and feeding SVG JSON straight into `renderSvgJsonToCommands()`
  (`tsc/src/toCommands.ts`).

Both modes generalize to N colors:

### Raster mode: quantize to N masks, trace each

Instead of collapsing every non-white pixel into one mask, quantize each pixel's
color to one of N palette entries, then build **N binary bitmaps**, one per palette
color (a pixel is 1 in mask *k* iff it quantized to color *k*), and run
`createPathsFromColorMatrix`-style tracing independently on each mask. Two
quantization strategies:

- **Fixed palette match** — nearest-neighbor to a user-supplied list of pen colors.
  `tsc/src/vectorizer.ts:58-60` already has a `colorDistance()` helper (squared
  distance in R/G/B) that is defined but never called anywhere in the codebase today
  — it's a leftover from an earlier iteration, but it's exactly the distance function
  a nearest-palette-color quantizer needs. Point every pixel at
  `argmin_k colorDistance(pixel, palette[k])`.
- **K-means** — cluster the image's colors into N clusters with no fixed palette,
  then let the user map each cluster to a physical pen afterward (see §6).

This is structurally the same shape as the grayscale-levels mode (in development in
parallel, on `agent/grayscale`): both quantize the source image into multiple masks
and trace each with the same Potrace tracer. The difference is nesting. Grayscale
levels are **nested** — luminance level *k* covers a superset of the pixels covered
by level *k+1* (darker = smaller, contained region), because ink coverage stacks
monotonically as you go darker. Color masks are **not nested** — a pixel belongs to
exactly one color cluster, so the N masks partition the image rather than nest
inside one another. That's a materially simpler case: no need to reconstruct
containment, each mask is traced independently and the resulting paths are grouped
by color for §2/§5.

### Path-tracing mode: group by literal color

When the source is already an SVG, group its paths by literal `fill`/`stroke` color
(post `generatePaths()` in `tsc/src/generator.ts`, before `flattenPaths()` /
`generateInfills()` in `tsc/src/toCommands.ts:30-40`) instead of by a single combined
path list. Each color group becomes one layer.

### Registration is free

In both modes, all layers come from the same source image/SVG, the same
`svg.scale(projectToViewRatio, ...)` transform (`tsc/src/toCommands.ts:24-28`), and
the same mm coordinate frame (see README.md's "Positioning of the Drawing on the
Wall" section — pin distance, 20% top margin, 20% side margins, 1 SVG unit = 1mm).
Nothing about multi-color drawing requires re-solving registration: layer *k*'s paths
live in exactly the same mm frame as layer *k+1*'s, because they were derived from
the same `svg` in the same worker invocation. The plotter's absolute positioning
(`Movement`, `movement.cpp`) doesn't drift between layers within one job — the only
new failure mode is the human reinserting the pen slightly off-center in the pen
holder, which is a mechanical tolerance question, not a software one.

## 2. Command format

### New command: `c<index>`

Add a pen/layer-change command, following the existing single-character-prefix
convention used by `p0`/`p1` (pen up/down), `d<number>` (total distance) and
`h<number>` (drawing height) — see `Command` in `tsc/src/types.ts:4-14`:

```ts
export type LayerChangeCommand = `c${number}`;
```

`c<index>` means "stop, swap to pen `index`" where `index` is 1-based and matches
the palette metadata header (below). File layout:

```
d<total-distance>
h<height>
n1 black
n2 red
<layer 1 commands: p0/p1/coords>
c2
<layer 2 commands: p0/p1/coords>
c3
<layer 3 commands: p0/p1/coords>
```

Only N-1 swap commands appear for N colors — the first layer is drawn with whatever
pen is already mounted (see §3 for how the firmware learns which pen that is), and a
`c<index>` is inserted only at each subsequent color boundary. `renderSvgJsonToCommands`
already draws each `InfilledPath` as one or more complete polylines per path (see
`renderPathsToCommands`, `tsc/src/renderer.ts`); the same principle applies at the
layer level: emit *all* of a color's optimized/deduped commands before its `c<index>`
trailer, so the pen only changes once per color, not on every path.

Rationale for "draw one color to completion, then swap" rather than interleaving:
a swap costs a human roughly a minute (locate pen, insert, confirm), while extra
travel between same-color regions costs the plotter seconds. Minimizing swap count
(N-1 total, forced) dominates minimizing travel distance.

### Palette metadata header

Add `n<index> <name>` lines, one per palette color, placed after the existing
`d`/`h` headers and before the first layer's commands. This gives the OLED prompt in
§3 and the web UI in §6 a human name ("red", "burnt sienna") to show instead of a
bare index. Firmware-side, `Runner::initTaskProvider()` currently reads exactly two
header lines unconditionally — `d...` then `h...` — and throws `"bad file"` if either
is missing (`src/runner.cpp:24-39`); it would need to keep consuming `n<index> <name>`
lines in a loop immediately after the `h` line, until it hits a line that isn't `n`-
prefixed, and store them (e.g. in a small `String palette[N]` sized to a small fixed
max) for display when a `c<index>` command is later encountered.

## 3. Firmware swap flow

### `PenSwapTask`

A new `Task` (implementing the `Task` interface in `src/tasks/task.h`, alongside the
existing `PenTask` in `src/tasks/pentask.h/.cpp` and `InterpolatingMovementTask`) that
`Runner::getNextTask()` returns when it reads a `c<index>` line
(`src/runner.cpp:58-98` gains a new `else if (line.charAt(0) == 'c')` branch next to
the existing `'p'` branch). Sequence:

1. **Pen up** — same as the existing `PenTask(true, pen)` path, calling
   `Pen::slowUp()` (`src/pen.cpp:64-71`), which is a blocking, ramped move back to
   the neutral 90° position.
2. **Travel to swap station** — move to a fixed, reachable position (the existing
   home position returned by `Movement::getHomeCoordinates()` is the natural choice;
   it's already used as the finishing-sequence target in
   `Runner::initTaskProvider()`, `src/runner.cpp:47-48`).
3. **OLED prompt** — `Display::displayText()` (`src/display.h`) shows e.g.
   `"Insert pen 2 (red)"`, built from the `n<index> <name>` header parsed in §2.
4. **Wait for user confirmation.**

Step 4 is the part that doesn't fit the current `Task` model cleanly:
`PenTask::isDone()` (`src/tasks/pentask.cpp:19-21`) returns `true` unconditionally
right after the blocking servo move — every existing task is synchronous and
completes within one call to `startRunning()`/`isDone()`. A pen swap needs to *block
the runner's task loop* (`Runner::run()`, `src/runner.cpp:100-135`, is driven from
`loop()` in `src/main.cpp:145-150`, so it must stay non-blocking) across an
indeterminate wait for a human, then across an HTTP round trip carrying the
confirmation. `PenSwapTask::isDone()` should return `false` until an HTTP handler
sets a flag on it. This is the same "wait for something outside the tight `loop()`"
shape as `ExtendToHomePhase::loopPhase()` polling `movement->hasStartedHoming()`
(`src/phases/extendtohomephase.cpp:16-19`) — precedent exists for polling state from
`loop()` rather than blocking in place.

### Position-integrity options during the swap

Removing a pen and pushing a new one into the holder risks nudging the belts/steppers
out of the position the firmware thinks they're at. Two options:

**(a) Hold torque (recommended default).** Leave the steppers energized during the
swap so the TMC2209 drivers (`BOM.md`) hold position against a gentle pen insertion.
This is effectively free: `Movement::disableMotors()` exists (`src/movement.cpp:423`)
but nothing in `src/*.cpp` currently calls it during a normal run, so steppers already
stay energized and holding position through the whole job today — no firmware change
is needed to get this behavior, only the discipline of not adding a motor-disable
call during `PenSwapTask`. It's the cheapest option and is likely adequate given
TMC2209 holding torque and the light insertion force of a pen swap.

**(b) Re-home between layers (bulletproof, slower).** Retract the belts fully to
their stops, let the user swap the pen at that fully-retracted rest position, then
re-extend to home. This reuses the exact same primitive that setup already performs
once per job — `RetractBeltsPhase` (`src/phases/retractbeltsphase.cpp`) followed by
`ExtendToHomePhase` (`src/phases/extendtohomephase.cpp`), which calls
`Movement::extendToHome()` (`src/movement.cpp`) — and is also the primitive planned
for resume-after-power-loss (see §4). It fully re-establishes belt-length ground
truth instead of trusting the steppers held position, at the cost of the extra
retract/extend travel time on every swap.

Document both; ship (a) as the default, with (b) available as a slower, more robust
option (e.g. a setting) for anyone who's seen position drift with their hardware.

## 4. Dependencies

Each pen has a different length, so the pen-down servo angle is pen-specific — this
is exactly what `PenCalibrationPhase::setPenDistance()` already calibrates once per
job today (`src/phases/pencalibrationphase.cpp:15-22`), storing a single
`Pen::penDistance` (`src/pen.h:8`, set via `Pen::setPenDistance()`,
`src/pen.cpp:59-62`). After a pen swap, that angle must be recalibrated for the new
pen — there's no need to remember multiple angles simultaneously, since only one pen
is ever mounted at a time; the swap flow simply re-enters `PenCalibrationPhase` and
overwrites `penDistance`, exactly as it does during initial setup.

That re-entry is where the dependency chain bites: `PenCalibrationPhase::setPenDistance()`
is invoked over HTTP (`/setPenDistance`, wired in `src/main.cpp:99-100`), via
`AsyncWebServer server` (`src/main.cpp:15`). But `BeginDrawingPhase::run()` —
the handler for `/run`, which starts the draw — calls `server->end()` right after
`runner->start()` (`src/phases/begindrawingphase.cpp:8-12`):

```cpp
void BeginDrawingPhase::run(AsyncWebServerRequest *request) {
    runner->start();
    request->send(200, "text/plain", "OK");
    server->end();
}
```

Once the server is ended, none of its routes — `/setPenDistance`, `/setServo`,
`/getState`, `/doneWithPhase`, etc. (all registered in `src/main.cpp:87-130`) — are
reachable again until the device reboots (which currently only happens via
`ESP.restart()` once the whole command file is exhausted,
`src/runner.cpp:90-96`). So mid-drawing pen-swap confirmation, and the recalibration
HTTP round trip it depends on, cannot work today: the web server that would carry
"pen calibrated, resume" is dead from the moment drawing starts.

This produces an explicit ordering dependency for implementation:

**keep-server-alive / live-status → pause-resume primitive → multi-color.**

1. The server must stay alive during drawing (drop or gate the `server->end()` call
   in `begindrawingphase.cpp`, and make `PhaseManager`/`Runner` state queryable
   concurrently with `Runner::run()` executing from `loop()`).
2. A general pause/resume primitive is needed so the runner can be halted mid-file
   (at a `c<index>` boundary), leave `Runner`'s file cursor and position state intact,
   run an out-of-band phase (`PenCalibrationPhase`) to completion, and resume
   `getNextTask()` from where it left off — the same primitive already planned for
   resume-after-power-loss.
3. Multi-color's `PenSwapTask` is then just: pause via (2), re-enter
   `PenCalibrationPhase` using the still-alive server from (1), resume via (2).

Multi-color should not be built by punching a one-off hole through `server->end()`
for calibration alone — it should consume the keep-alive and pause/resume work as
shared infrastructure once that exists.

## 5. Draw order and overlap

**Order layers light → dark.** When two colors' regions overlap (registration error,
or deliberate overlap in the source art), drawing light colors first and dark colors
last means the visible overlap resolves to the darker pen, and small
registration/insertion error is hidden under the later, darker line rather than
showing as a visible light-colored fringe outside a dark shape.

**Knockout by default.** `flattenPaths()` (`tsc/src/flattener.ts`) already implements
exactly this idea within a single color layer: it sorts paths by z-order
(`paths.sort((a, b) => a.isAbove(b) ? -1 : 1)`, `flattener.ts:8`) and then, for every
path, subtracts every path above it from every path below it
(`pathToModify.subtract(currentPath, ...)`, `flattener.ts:16-19`) — a painter's-order
boolean subtraction so a region is only infilled by its topmost occupant. Multi-color
should generalize this across layers, not just within one: layer *k*'s paths should
be subtracted by the union of all paths in layers drawn after it (i.e., darker
layers, per the light-to-dark order above), so a given wall region is infilled in
only one final color rather than getting hatching from every color whose path covers
it. **Overprint** — skip the cross-layer subtraction and let colors' infill hatching
literally overlap on the wall — should be an opt-in override for users who want
blended/layered color effects.

**White stays "don't draw."** `generateInfills()` and `vectorizeImageData()` both
already treat pure white (`#ffffff` fill, `vectorizer.ts:7,41` and
`infill.ts:34,54`) as the wall's own color / "nothing to draw" rather than a drawable
ink. That convention carries over unchanged: a "white" palette entry, if a user adds
one, still means "leave the wall showing," not "draw with a white pen."

**Trapping: a gap, not a shared edge.** Plain cross-layer knockout (above) still
leaves a problem: the boundary it subtracts along is *exactly* the darker layer's own
outline, so the lighter layer's remaining geometry and the darker layer's geometry
share that line pixel-for-pixel. On paper that means the two pens draw the same line
twice, from opposite sides — with felt-tips or whiteboard markers, a nib crossing
another color's still-wet ink picks up pigment (measured on the W3C SVG logo: 692
cross-colour contact points, all exactly on the shared silhouette edge). The fix,
borrowed from print production, is **trapping**: instead of subtracting the darker
layer's geometry as-is, subtract it *grown* by a small gap (`flattenPathsAcrossLayers`'s
`gapMm` parameter, `tsc/src/flattener.ts`, driven by `RenderSVGRequest.knockoutGapMm`,
`tsc/src/types.ts`), so the lighter layer's edge stops a hairline short of the darker
layer's edge. The grow itself reuses the Clipper-based offset primitive
`fillStrategies/contour.ts` already established for insetting fill rings
(`tsc/src/geometry/offset.ts`'s `offsetPathItem`, built on the same `clipper-lib`
dependency) — paper.js has no robust polygon-offset primitive of its own, and a
hand-rolled one breaks on concave shapes and holes.

The default gap is `huePalette.ts`'s `DEFAULT_NIB_WIDTH_MM` (1.2mm): roughly one nib
width, so the two inked regions genuinely cannot touch given a typical felt-tip or
whiteboard-marker nib. Setting the gap to 0 restores today's exact touching behavior
byte-for-byte — the growth step is skipped entirely rather than run with a zero
delta, so N=1/no-multi-color output is provably unaffected.

Growing the subtractor can, on a lighter shape no wider than roughly twice the gap,
consume that shape's geometry entirely where plain (ungapped) subtraction would have
left a sliver — a 1mm-wide detail sitting next to a darker region must not simply
vanish because the gap happened to be wider than it. `flattenPathsAcrossLayers`
detects this per knockout step (grown-subtraction result reduced to ~nothing while
the ungapped subtraction would not have been) and falls back to the ungapped
subtraction for that one step, so the feature survives — thinned, and touching along
that particular edge — rather than disappearing.

## 6. UI

The frontend (built into `data/www/`, driving the `tsc` worker via `main.ts`'s
`postMessage` protocol) needs:

- **Color-count selector** — how many clusters/palette colors to quantize to (N).
- **Palette mapper** — after clustering (raster mode) or color-grouping (path-tracing
  mode), let the user assign each detected cluster/color to one of the physical pens
  they own (name + preview swatch), which becomes the `n<index> <name>` header text
  from §2.
- **Per-color tinted preview layers** — the preview already reconstructs an SVG from
  the generated commands (`renderCommandsToSvgJson`, `tsc/src/toSvgJson.ts`, called
  from `tsc/src/main.ts:39`); extend it to tint each layer's reconstructed paths with
  that layer's assigned pen color instead of one flat color, so the preview shows
  what the finished multi-color piece will actually look like.
- **Per-layer distance/time estimates** — `measureDistance()`
  (`tsc/src/measurer.ts`) already computes `totalDistance`/`drawDistance` for a
  command list in one pass; running it once per layer's command slice (split at each
  `c<index>`) gives a per-color distance breakdown, and by extension a rough
  per-color time estimate, in addition to the existing whole-job total.

## 7. Effort and phasing

| Piece | Size | Notes |
|---|---|---|
| Layer separation (raster quantization + masks, or SVG color-grouping) | Small | Reuses existing Potrace tracing and `colorDistance()`; mostly new quantization/grouping code around existing calls. |
| `c<index>` command + palette header, emit/parse | Small | Additive to `Command` union (`types.ts`) and `Runner::initTaskProvider()`/`getNextTask()`; no change to existing command semantics. |
| `PenSwapTask` (pen up, travel, OLED prompt) | Small | Structurally close to existing `PenTask`; the "wait for confirmation" half depends on §4. |
| Knockout (generalize `flattenPaths()` across layers) | Small | Same algorithm, applied across the layer boundary instead of within one path list. |
| Keep-server-alive / live status during drawing | Medium | Touches `begindrawingphase.cpp`, `Runner`, `PhaseManager` concurrency; prerequisite for everything below. |
| Pause/resume primitive | Medium | Shared with the planned resume-after-power-loss feature; needed for `PenSwapTask`'s confirmation wait and for re-entering `PenCalibrationPhase` mid-job. |
| UI: color-count selector, palette mapper, tinted preview, per-layer estimates | Medium | New frontend work in `data/www/`; depends on the command-format and separation pieces above but not on the firmware pause/resume work. |

Suggested order: layer separation → command format → knockout → UI (all of these are
useful/demoable even in a "one pen, all colors merged for now" world, and de-risk the
image-processing side first) → keep-server-alive → pause/resume → `PenSwapTask`
(the firmware swap flow last, since it's gated on the two medium-sized prerequisites
in §4).
