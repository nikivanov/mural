# Motion smoothing (`-DMURAL_SMOOTH_MOTION`)

**Status: implemented but UNTESTED ON REAL HARDWARE.** The code behind
`#ifdef MURAL_SMOOTH_MOTION` (in `src/runner.cpp`) is marked with a comment
saying so.

## What this does

Nothing when the flag is off - the code is fully `#ifdef`-guarded out, so
default builds are unaffected.

When on: the drawing command file (`/commands`, produced by the `tsc`
toolchain) is a sequence of `x y` waypoints (plus pen up/down commands).
Normally `Runner::getNextTask()` turns every waypoint into its own
`InterpolatingMovementTask`, and `Runner::run()` only starts the next task
once the current one has fully finished - i.e. once both motors have reached
`distanceToGo() == 0` and stopped. That happens at *every* waypoint, even
when a straight line in the source SVG got flattened into several nearly
collinear waypoints in a row, each one triggering a real stop-and-restart of
both motors (`acceleration` in `movement.h` is "essentially infinite", i.e.
this is an instant velocity change, not a ramp).

With the flag on, `Runner::getNextTask()` looks ahead in the file: as long as
the next waypoint keeps the path nearly straight (the turn angle at the
previous waypoint is below `smoothAngleThresholdRad`, 3 degrees by default),
it's folded into the *same* task by extending that task's target, and the
Runner never sees that intermediate waypoint as a task boundary. Only when
the turn angle exceeds the threshold does a new task actually start, causing
a real stop. This reuses `InterpolatingMovementTask`'s existing 1mm
interpolation unchanged - it already interpolates in a straight line from the
current position to whatever target it's given - so this is a change to
*which* points are used as task boundaries, not to the interpolation itself.

## Tuning

- `smoothAngleThresholdRad` in `src/runner.cpp` (default `3.0 * PI / 180.0`,
  i.e. 3 degrees): the maximum turn angle between two consecutive segments
  that's still treated as "collinear enough" to merge. Larger = smoother
  motion but more corner-cutting (the merged path is a straight line between
  the endpoints, skipping the exact original waypoints in between, so real
  corners near the threshold will visibly get rounded off). Smaller = more
  faithful to the original path but less smoothing benefit.

## Known limitation

The progress percentage shown on the OLED and pushed over `/events` during
drawing is `executedLines / totalLines` (`Runner::run()`, `src/runner.cpp`),
where `totalLines` is a one-time pre-scan of the command file and
`executedLines` increments once per line actually read as a task boundary
in `Runner::getNextTask()`. Waypoints folded into a merged task by the
lookahead above are still consumed from the file (`openedFile.readStringUntil()`
inside the peek loop), but that peek loop does not increment `executedLines` -
only the line that started the merge does. So a merged run of, say, five
collinear waypoints advances `executedLines` by one while consuming five
lines' worth of `totalLines`. In practice this means the progress percentage
can land noticeably under 100% by the time the file is exhausted and the
finishing sequence kicks in - cosmetic only (progress display and the
resume-after-power-loss checkpoint, which is keyed off the same line
position, are unaffected in correctness), but worth knowing if the percentage
looks like it stalls on long straight runs.

## Safe first test

1. Build with `pio run -e esp32dev-smooth` and confirm it compiles (this has
   been done - see the PR/commit this doc ships with).
2. Before running a real drawing, do a short test file with a few nearly
   straight lines and a few sharp corners, and visually confirm on the bench
   that: straight-ish runs move smoothly without visible per-mm hesitation,
   and sharp corners still stop and change direction correctly (i.e. the
   angle threshold is actually being respected, not merging things it
   shouldn't).
3. Compare the drawn output against the same file with the flag off to make
   sure the corner-cutting at `smoothAngleThresholdRad` is visually
   acceptable at the scale you draw at. If not, lower the threshold.

## Building

```
pio run -e esp32dev-smooth
```

This environment (`platformio.ini`) adds `-DMURAL_SMOOTH_MOTION` on top of
the default `esp32dev` environment. No new library dependencies.
