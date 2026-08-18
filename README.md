# Mural 2.0

**An enthusiastic fork of [Mural](https://getmural.me)** — the belt-driven robot that hangs off two nails and draws.

The original hardware and firmware are excellent and this fork changes neither in any way you'd notice. What it adds is colour, better mark-making, and a UI that tells you what's about to happen before it happens.

> ### ⚠️ Not yet tested on hardware
>
> Everything here is verified in software — 205 automated tests, three firmware
> build configurations, and a mock-firmware harness that runs the whole web UI
> without a machine attached. **None of it has drawn a physical line yet**; we're
> waiting on parts. Treat the drawing-quality claims as "the geometry is correct
> and the previews look right", not "this has been proven on paper."

---

## What's new

### Colour

- **Multi-colour drawing with pen swaps.** The machine draws every region of one colour, parks, prompts you to swap pens, and carries on. Pen-length differs between pens, so it re-runs pen calibration on each swap.
- **Layers are drawn light to dark**, so where two colours meet it's the darker nib that crosses the lighter ink — the direction you can't see. 
- **A trapping gap** (borrowed from print) insets each knockout by about a nib width, leaving a hairline of bare paper between colours so the two pens never actually touch. Set it to 0 for the old touching behaviour.
- **Shades from one pen.** Hue-grouped shading collapses similar hues onto a single pen and renders the lighter shades as sparser hatching, so a two-blue image needs one blue pen, not two. Spacing is derived from the *measured* tone gap between the shade and its pen, not from its rank in a list.
- **Per-layer enable/disable.** Turn off any colour you don't own a pen for — or that isn't worth drawing. A near-white background layer on one test image was 35% of the total plot time and invisible on white paper.

### Mark-making

**Seven fill styles** — the original cross-hatch plus six new ones:

| Style | What it looks like | Cost |
|---|---|---|
| **Cross-hatch** (default) | Even 45° diagonal grid | Baseline |
| **Single-direction hatch** | One diagonal, half the ink at the same spacing | Cheapest |
| **Angled cross-hatch** | Cross-hatch at any angle — multi-colour layers each get their own | Baseline |
| **Jittered** | Hand-drawn wobble instead of machine-perfect lines | Slightly more |
| **Spiral** | One continuous stroke per region, concentric | Fewest pen lifts |
| **Contour** | Concentric rings following the shape's own outline | Moderate |
| **Gradient hatch** | Strokes follow the image's shading, like an engraving | Most expensive |

The density ladder now reaches 2.5mm spacing (was 7mm), which is what makes true mid-tones possible rather than only light tints.

### Knowing what you're in for

- **Estimates before you commit**: how long the machine will take to draw the image, and roughly how much pen you'll use — measured in Sharpies. Drawing time is derived from the real command file, including the ~2 seconds every pen lift costs, and is accurate.
- **A rough processing-time estimate too**, calibrated against *your* device so a phone and a desktop give different answers. It's a guide, not a stopwatch: typical renders land within about a factor of two, but some combinations — notably continuous-tone photographs at very sparse infill — are still well under. Use it to tell "a few seconds" from "go and make tea".
- **Plot dimensions in millimetres**, so you can tell whether it fits your paper before you start.
- **Set the size you actually want** — type a target width or height (or pick A4/A3/A2) and the scale is worked out for you, instead of guessing at percentages.
- **Live progress while drawing**, streamed from the machine, with a real ETA.

### Quality-of-life

- **Resume after a power cut.** The machine checkpoints its position and pen state as it draws; on restart it offers to carry on. Because unpowered steppers back-drive, resuming re-homes against the stop screws first, travels back pen-up, and only then puts the pen down.
- **The pen lifts within a second of power-on**, before the WiFi connect, so a pen resting on the paper isn't dragged across it.
- **Pen-up travel runs at full speed** rather than drawing speed.
- **Redrawable command files.** Download the compiled file and re-upload it later to redraw the same image; it records the pin distance it was made for and warns if that's changed.
- **A UI that works on a phone and a desktop** — big touch targets, one instruction per line, and a much larger preview when there's room for it. No CDN dependency, so it works with no internet.

### Under the hood

- **205 automated tests and CI** covering the whole image pipeline, plus flash-budget gates that fail the build if the firmware or filesystem outgrows its partition.
- Better path ordering (both-endpoint greedy plus a bounded 2-opt pass) and polyline simplification, which cut pen-up travel and command-file size.

---

## Optional, off by default, and definitely untested

Two features are compiled out unless you ask for them, because neither has run on real hardware and one needs wiring the original build doesn't have:

| Flag | What it does | Needs |
|---|---|---|
| `MURAL_TMC_UART` | Sensorless stall detection — auto-retract during belt homing, and pausing if the machine stalls mid-draw | Extra wiring: a shared UART line to both stepper drivers plus DIAG pins. See [docs/tmc-uart.md](docs/tmc-uart.md) |
| `MURAL_SMOOTH_MOTION` | Carries velocity through near-collinear moves instead of stopping at every 1mm step | Nothing, but unproven. See [docs/motion-smoothing.md](docs/motion-smoothing.md) |

Build them with `pio run -e esp32dev-tmcuart` or `-e esp32dev-smooth`. The default `esp32dev` build behaves exactly as the original hardware expects.

> **Reflashing repartitions the device.** The app partition grew (1600K app / 2400K filesystem) to fit the larger firmware. The first flash with the new table wipes stored files and saved settings, so you'll re-run setup once.

---

## How a drawing is positioned

- You enter the **pin distance** during setup — the distance between the two nails. Say 1000mm.
- There's a **20% margin** on the top and both sides, so the drawable area is **60% of the pin distance** wide: 600mm in this example. The top of the image sits 200mm below the line between the pins.
- By default the image fills that width and the height follows its aspect ratio. You can instead **set a target width or height in millimetres**, and the scale is derived from it.
- Each SVG unit is treated as one millimetre.
- The result is compiled to a simple command file — coordinates, pen up, pen down — which is uploaded to the microcontroller and executed line by line.

![image_positioning](/images/doc/muralbot_image_positioning.svg)

---

## Documentation

| | |
|---|---|
| [Kinematic model](KinematicModel.md) | How belt lengths are derived, including the bot's tilt |
| [Multi-colour design](docs/multi-color.md) | Colour separation, pen swaps, knockout and trapping |
| [TMC2209 UART](docs/tmc-uart.md) | Wiring and bench-testing the optional stall detection |
| [Motion smoothing](docs/motion-smoothing.md) | The optional velocity-carrying motion path |
| [Bill of materials](BOM.md) | Unchanged from the original |

Original project documentation remains at **[getmural.me](https://getmural.me)**.

---

## Credits

None of this would exist without the original Mural — excellent code and genuinely lovely hardware, neither of which needed changing to build on. This fork owes it everything.

It also owes something to previous adventures with Lego Mindstorms wall plotters and a hack of the Makelangelo, and to careful but generous application of Claude Code in pursuit of the greater good.
