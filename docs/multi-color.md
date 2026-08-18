# Multi-Color Drawing

Mural draws with more than one pen by separating an image into color layers, then
pausing mid-job for a human to swap pens between layers. This document explains how
the pieces fit together and links each piece to its code. See the README's "Colour"
section for the user-facing feature list; this document goes deeper into the *why*
and the implementation.

Two places to look for the code:

- `tsc/src/*.ts` — the browser-side worker (`tsc/src/main.ts`) that turns a raster
  image or an SVG into the plotter's command file. "tsc" is this project's name for
  that worker, not the TypeScript compiler.
- `src/*.cpp`, `src/tasks/*`, `src/phases/*` — the ESP32 firmware that streams the
  command file to the steppers and servo.

## 1. Separation: turning one image into N single-color layers

Mural has two ways of getting from source art to drawable paths, and both produce
color layers:

- **Vector → Raster → Vector.** `vectorizeImageDataColor()` (`tsc/src/vectorizer.ts`)
  quantizes each pixel to one of N colors and traces each color's mask independently
  with Potrace (`tsc/src/tracer.js`), producing one SVG group per color, tagged with
  its `colorIndex` in a `data-paper-data` attribute. Two quantization strategies:
  - **Fixed palette match** — nearest-neighbor to a user-supplied list of pen colors,
    via `colorDistance()` (squared RGB distance, `tsc/src/vectorizer.ts`).
  - **K-means** — `kMeansQuantize()` clusters the image's colors into N clusters with
    no fixed palette; the user maps each cluster to a physical pen afterward in the
    UI (§6).
- **Path-tracing mode**, i.e. importing an already-vector SVG directly. Paths are
  grouped by literal `fill`/`stroke` color by `groupPathsByLiteralColor()`
  (`tsc/src/generator.ts`), ordered light-to-dark by luminance, before
  `flattenPaths()`/`generateInfills()` run (`tsc/src/toCommands.ts`).

Grayscale-levels mode (single-pen shading via nested luminance thresholds) is a
different, unrelated feature living alongside this one — its masks nest (darker
levels are a subset of lighter ones); color-separation masks partition the image
instead, since a pixel belongs to exactly one color cluster.

**Hue-grouped shading** (`tsc/src/huePalette.ts`) sits on top of color separation:
it can collapse several detected shades of one hue onto a single physical pen,
rendering the lighter shades as sparser hatching instead of requiring one pen per
shade. The physical pen is always the *darkest* member of its hue group — lighter
members come from drawing that same ink more sparsely, never from a lighter pen
standing in for a dark one. Hatch spacing is derived from each shade's *measured*
tone gap to the pen's tone (`computeToneSpacingMm`), not from its rank within the
group — a two-member group whose shades are nearly identical gets nearly identical
spacing, rather than always landing on the density ladder's two extremes. Groups are
found automatically by circular hue distance (`computeAutoHueGroups`, 30° buckets,
near-greys/near-blacks treated as a separate neutral bucket since HSL hue is
numerically unstable there) and can be overridden per-color in the UI
(`applyHueGroupingWithOverrides`).

### Registration is free

All layers come from the same source image/SVG and the same mm coordinate frame (see
the README's "How a drawing is positioned" section). Layer *k*'s paths live in
exactly the same mm frame as layer *k*+1's, because they were derived from the same
`svg` in the same worker invocation — nothing about multi-color drawing requires
re-solving registration. The only new failure mode is the human reinserting the pen
slightly off-center in the pen holder, which is a mechanical tolerance question, not
a software one.

## 2. Command format

### `c<index>`: layer-change command

`c<index>` means "stop, swap to pen `index`" where `index` is 1-based and matches the
palette metadata header below. It follows the existing single-character-prefix
command convention (`p0`/`p1` pen up/down, `d<number>` total distance, `h<number>`
drawing height — `Command` in `tsc/src/types.ts`). File layout:

```
d<total-distance>
h<height>
n1 black
n2 red
<layer 1 commands: p0/p1/coords>
c2
<layer 2 commands: p0/p1/coords>
```

Only N-1 swap commands appear for N surviving colors (see §6 for per-layer
enable/disable, which can drop this below the full detected count) — the first layer
draws with whatever pen is already mounted, and a `c<index>` is inserted only at each
subsequent color boundary. Each color's commands are fully emitted before its
trailer, so the pen changes once per color, not on every path — a swap costs a human
roughly a minute (locate pen, insert, confirm), while extra travel between
same-color regions costs the plotter seconds, so minimizing swap count dominates
minimizing travel distance.

### Palette metadata header

`n<index> <name>` lines, one per palette color, appear after the `d`/`h`/optional `t`
headers and before the first layer's commands (the command-file assembly step in
`renderSvgJsonToCommands`, `tsc/src/toCommands.ts`). This gives the OLED prompt (§3)
and the web UI (§6) a human name ("red", "burnt sienna") instead of a bare index.

Firmware-side, `Runner::parseCommandFileHeader()` (`src/runner.cpp`) reads `d` and
`h` unconditionally, then an optional `t<mm>` pin-distance header, then loops
consuming `n<index> <name>` lines into a fixed `String palette[maxPaletteColors]`
array (`maxPaletteColors` = 8, `src/runner.h`) until it hits a line that isn't
`n`-prefixed. `Runner::getNextTask()` (`src/runner.cpp`) gains a `c`-prefixed branch
alongside the existing `p` branch that dispatches a `PenSwapTask`.

## 3. Firmware swap flow

### `PenSwapTask`

A `Task` (`src/tasks/penswaptask.h`/`.cpp`, implementing the same `Task` interface as
`PenTask` and `InterpolatingMovementTask`) that `Runner::getNextTask()` returns when
it reads a `c<index>` line. Sequence:

1. **Pen up** — `Pen::slowUp()` (`src/pen.cpp`), a blocking, ramped move to the
   neutral position.
2. **Travel to swap station** — `movement->getHomeCoordinates()`, the same position
   used as the finishing-sequence target.
3. **OLED prompt** — `Display::displayText()` shows e.g. `"Insert pen 2 (red)"`,
   built from the `n<index> <name>` header.
4. **Wait for user confirmation** over HTTP.

Step 4 is the part that doesn't fit a purely synchronous task: `PenSwapTask::isDone()`
returns `false` while `state == AwaitingConfirmation`, blocking `Runner::run()`'s
task loop (driven non-blockingly from `loop()` in `src/main.cpp`) across an
indeterminate wait for a human, then an HTTP round trip. It becomes `true` only after
`Runner::confirmPenSwap()` is called, wired to `POST /confirmPenSwap`
(`src/phases/drawingphase.cpp`, `src/main.cpp`). While blocked,
`Runner::notifyPenSwapWaiting()` sets `awaitingSwap` bookkeeping that `/getState` and
the `/events` SSE stream surface to the UI, and `/setPenDistance` is available for
optional per-pen recalibration (see §4) before confirming.

### Position integrity during the swap

Removing a pen and pushing a new one into the holder risks nudging the belts/steppers
out of the position the firmware thinks they're at. Mural ships the cheap option:

**Hold torque (implemented, the only option today).** The steppers stay energized
during the swap so the TMC2209 drivers hold position against a gentle pen insertion.
This is free: `Movement::disableMotors()` exists (`src/movement.cpp`) but nothing in
the firmware calls it during a normal run, so steppers already stay energized and
holding position through the whole job — `PenSwapTask` doesn't need to do anything
special to get this behavior, only to avoid adding a motor-disable call.

**Re-home between layers (not implemented).** The idea — retract the belts fully to
their stops, swap the pen at that rest position, then re-extend to home before
resuming — would reuse `RetractBeltsPhase`/`ExtendToHomePhase`, the same primitive
setup already runs once per job, to fully re-establish belt-length ground truth
instead of trusting the steppers held position. This stayed a design idea; nothing in
`PenSwapTask` or `Runner` triggers a retract/extend cycle around a swap. Worth
building as an opt-in fallback if hold-torque proves insufficient on some hardware,
but there's no evidence yet that it's needed (the machine hasn't drawn on real
hardware at all — see the README's hardware-testing warning).

## 4. Dependencies (how this got built)

Each pen has a different length, so the pen-down servo angle is pen-specific — this
is what `PenCalibrationPhase::setPenDistance()` calibrates once per job today. After
a pen swap it needs recalibrating for the new pen; there's no need to remember
multiple angles simultaneously since only one pen is ever mounted, so
`DrawingPhase::setPenDistance()` simply overwrites `Pen::penDistance` again, exactly
as initial setup does.

That recalibration is only reachable if the web server is still alive mid-drawing.
It used to not be: `BeginDrawingPhase::run()` called `server->end()` right after
starting the run, which killed every route (`/setPenDistance`, `/getState`, etc.)
until the next `ESP.restart()`. Multi-color therefore had — and needed — this build
order, all of which has since shipped:

1. **Keep the server alive during drawing.** `server->end()` is gone from
   `BeginDrawingPhase::run()` (see the comment left in its place); the server stays
   up for the whole job, and `PhaseManager`/`Runner` state is queryable concurrently
   with `Runner::run()` executing from `loop()` (`src/phases/drawingphase.*`).
2. **A pause/resume primitive.** `Runner::pause()`/`resumeRun()` (`src/runner.cpp`)
   halt the runner at the next safe task boundary, leave the file cursor and position
   state intact, and resume `getNextTask()` from where it left off. This is shared
   with resume-after-power-loss (`src/phases/resumedrawingphase.*`), not
   multi-color-specific.
3. **`PenSwapTask`**, which doesn't even need the general pause/resume primitive
   directly — pausing happens naturally because `isDone()` returns `false` until
   `/confirmPenSwap` is called, which is exactly the same "block the task loop, poll
   from `loop()`" shape `ExtendToHomePhase::loopPhase()` already used for a different
   indeterminate wait.

## 5. Draw order and overlap

**Order layers light → dark.** When two colors' regions overlap (registration error,
or deliberate overlap in the source art), drawing light colors first and dark colors
last means the visible overlap resolves to the darker pen, and small
registration/insertion error is hidden under the later, darker line rather than
showing as a visible light-colored fringe outside a dark shape. Both separation paths
(§1) produce layers already ordered light-to-dark by luminance.

**Knockout by default.** `flattenPaths()` (`tsc/src/flattener.ts`) already implements
this within a single color layer: it sorts paths by z-order (`isAbove()`) and, for
every path, subtracts every path above it from every path below it — painter's-order
boolean subtraction so a region is only infilled by its topmost occupant.
`flattenPathsAcrossLayers()` (same file) generalizes this across layers: every path
in a lighter layer is subtracted by every path in every darker layer drawn after it,
so a region covered by more than one color ends up infilled only in the final
(darkest) color that covers it — z-order plays no part here, only cross-layer draw
order does. Skipping this (**overprint**) — letting colors' infill hatching literally
overlap on the wall — is available as an opt-in override for users who want
blended/layered color effects (`toCommands.ts`'s per-layer flattening only runs
`flattenPathsAcrossLayers` when knockout is requested).

**White stays "don't draw."** A pure white fill has always meant "the wall's own
color" rather than a drawable ink (`vectorizer.ts`, `infill.ts`). `applyWhiteKnockout()`
(`tsc/src/flattener.ts`) is a fidelity fix on top of that convention: it's not enough
to just skip a white path's own ink — whatever is painted underneath it in paint
order (another color's infill) also needs subtracting, otherwise it draws straight
through where the invisible white shape should have covered it. A white-filled path
that also carries a visible stroke is not treated as a pure knockout mask, since it
still has ink to draw.

**Trapping: a gap, not a shared edge.** Plain cross-layer knockout still leaves a
problem: the boundary it subtracts along is *exactly* the darker layer's own outline,
so the lighter layer's remaining geometry and the darker layer's geometry share that
line pixel-for-pixel. On paper that means the two pens draw the same line twice, from
opposite sides — with felt-tips or whiteboard markers, a nib crossing another color's
still-wet ink picks up pigment (measured on the W3C SVG logo during development: 692
cross-colour contact points, all exactly on the shared silhouette edge). The fix,
borrowed from print production, is **trapping**: `flattenPathsAcrossLayers`'s `gapMm`
parameter (driven by `RenderSVGRequest.knockoutGapMm`, `tsc/src/types.ts`) grows the
darker layer's path by that many mm before subtracting it (via `geometry/offset.ts`'s
Clipper-backed `offsetPathItem`, the same primitive `fillStrategies/contour.ts` uses
to inset fill rings — paper.js has no robust polygon-offset primitive of its own, and
a hand-rolled one breaks on concave shapes and holes), so the lighter layer's edge
stops a hairline short of the darker layer's edge.

The default gap is `huePalette.ts`'s `DEFAULT_NIB_WIDTH_MM` (1.2mm): roughly one nib
width, so the two inked regions genuinely cannot touch given a typical felt-tip or
whiteboard-marker nib. Setting the gap to 0 restores the exact touching behavior
byte-for-byte — the growth step is skipped entirely rather than run with a zero
delta.

Growing the subtractor can, on a lighter shape no wider than roughly twice the gap,
consume that shape's geometry entirely where plain (ungapped) subtraction would have
left a sliver. `flattenPathsAcrossLayers` detects this per knockout step
(grown-subtraction result reduced to ~nothing while the ungapped subtraction would
not have been, via an area-based `isNegligible` check) and falls back to the ungapped
subtraction for that one step, so the feature survives — thinned, and touching along
that particular edge — rather than disappearing.

## 6. UI

The frontend (`data/www/main.js`, driving the `tsc` worker via `main.ts`'s
`postMessage` protocol):

- **Color-count selector** — how many clusters/palette colors to quantize to (N);
  N ≥ 2 triggers k-means clustering (§1).
- **Palette mapper / hue-group overrides** — after clustering or color-grouping,
  `hueOverrides` (index-aligned to the detected palette) let the user reassign a
  shade to a different hue group than the automatic clustering chose, forwarded to
  `applyHueGroupingWithOverrides`.
- **Per-layer enable/disable** — `disabledColorIndexes` (`tsc/src/types.ts`), a list
  of 0-based `colorIndex` values dropped from the job entirely, both their geometry
  and their pen-swap. Honoured in `toCommands.ts` before N-1 `c<index>` markers are
  assembled, so disabling a color also reduces the swap count. A near-white
  background layer on one test image was 35% of total plot time and invisible on
  white paper — this is what lets a user cut it.
- **Per-layer breakdown panel** — `renderSvgJsonToCommands` (`tsc/src/toCommands.ts`)
  already measures each layer's own `distance`/`drawDistance` while assembling the
  command file (`LayerSummary`, one per color); `renderLayerBreakdown()` in `main.js`
  lists each surviving layer with that distance and a pen/swap count summary, updating
  live as layers are toggled via `disabledColorIndexes`.
- **Tinted preview** — the preview reconstructs an SVG from the generated commands
  (`renderCommandsToSvgJson`, `tsc/src/toSvgJson.ts`); when given `layerColors`, each
  layer's reconstructed paths are tinted with its assigned pen color instead of one
  flat color, so the preview shows what the finished multi-color piece will actually
  look like.
- **Pen-swap panel** — during drawing, the UI polls `/getState`/`/events` for
  `awaitingSwap`, shows which pen to insert, and posts `/confirmPenSwap` when the
  user is ready; it reuses the same pause-state UI and `/setPenDistance` path as
  ordinary pen calibration.
