# TMC2209 UART support (`-DMURAL_TMC_UART`)

**Status: implemented but UNTESTED ON REAL HARDWARE.** Every code block behind
`#ifdef MURAL_TMC_UART` is marked with a comment saying so. Do not fly this on
a real Mural without first doing the bench checks in
["Safe first test"](#safe-first-test) below, and without adult supervision of
the belts the first few times it runs.

## What this does

By default Mural drives its two TMC2209 drivers in **standalone mode**: pure
STEP/DIR pulses from `AccelStepper`, current and microstepping set by the
driver's onboard trimpot and MS1/MS2 pins, no feedback to the ESP32 at all.

With `MURAL_TMC_UART` defined, the drivers are *additionally* configured and
monitored over UART (using the
[TMCStepper](https://github.com/teemuatlut/TMCStepper) library), while motion
is **still** driven via the existing STEP/DIR pins - this build flag does not
switch to UART-stepping. UART is used only for:

1. Setting run current, microstepping, and StallGuard threshold at boot
   (`Movement::setupTmcDrivers()` in `src/movement.cpp`).
2. Reading each driver's `DIAG` pin to detect a stall, used for:
   - **(a) Sensorless homing during belt retraction.** `RetractBeltsPhase`
     (`src/phases/retractbeltsphase.cpp`) automatically jogs both belts
     inward and stops as soon as either driver reports a stall, instead of
     requiring the user to watch the belts and press "done" by hand.
   - **(b) Stall monitoring while drawing.** `Movement::runSteppers()` halts
     both motors the instant a stall is seen; `Runner::run()`
     (`src/runner.cpp`) then stops feeding new drawing tasks, lifts the pen,
     and shows `STALL - paused` on the OLED. There is currently no
     auto-resume - by the time a stall happens mid-drawing the web server has
     already been shut down (`server->end()` in `BeginDrawingPhase::run()`),
     so recovery means power-cycling and re-homing.

The manual jog buttons (`l-ret`/`l-ext`/`r-ret`/`r-ext`) and the manual
"done" button on the retract-belts screen keep working exactly as before -
useful as a fallback if StallGuard isn't tuned correctly yet on a given
machine.

## Wiring

### UART line (shared, single wire)

Both TMC2209 `PDN_UART` pins share **one** UART line back to the ESP32,
distinguished by their slave address (see MS1/MS2 below). This needs a
combiner resistor so the ESP32's TX and RX can share that single wire:

```
ESP32 GPIO17 (TX2) --[1k resistor]--+-------------------- PDN_UART (left driver)
                                     |
ESP32 GPIO16 (RX2) ------------------+-------------------- PDN_UART (right driver)
```

- `GPIO17` = `MURAL_TMC_UART_TX_PIN` (ESP32 hardware UART2 TX)
- `GPIO16` = `MURAL_TMC_UART_RX_PIN` (ESP32 hardware UART2 RX)
- Both drivers' `PDN_UART` pins connect to the same node (after the resistor).
- Both drivers need a common ground with the ESP32 (already true via the
  shared power supply).

These pins were picked because they're free given `movement.h`'s existing
assignments (`LEFT_STEP/DIR/ENABLE` = 13/12/14, `RIGHT_STEP/DIR/ENABLE` =
27/26/25, servo on 2) and are not ESP32 boot-strapping pins.

### DIAG (StallGuard output)

- Left driver `DIAG` -> ESP32 `GPIO4` (`LEFT_DIAG_PIN`)
- Right driver `DIAG` -> ESP32 `GPIO18` (`RIGHT_DIAG_PIN`)

Also not strapping pins, also free.

### MS1/MS2 (UART address, *not* microstepping, in this mode)

On the TMC2209, once UART is used, MS1/MS2 are repurposed as the UART slave
address select instead of the microstep-resolution pins (microstepping is set
over UART instead - see `Movement::setupTmcDrivers()`, which sets 8
microsteps to match `stepsPerRotation` in `movement.h`). Wire:

| Driver | MS1  | MS2  | Address |
|--------|------|------|---------|
| Left   | GND  | GND  | 0       |
| Right  | 3.3V | GND  | 1       |

These match `LEFT_TMC_ADDRESS` / `RIGHT_TMC_ADDRESS` in `movement.h`. If you
change the strapping, update those constants to match.

## Tunables (all in `src/movement.h`)

- `TMC_R_SENSE` (default `0.11`): sense resistor value. `0.11` is correct for
  stock BigTreeTech TMC2209 boards (per the project's `BOM.md`); check yours.
- `TMC_RUN_CURRENT_MA` (default `800`): deliberately conservative. Set this to
  match the rated current of your actual NEMA17 (pancake) motor - too high
  will overheat the motor/driver, too low will make StallGuard trigger on
  ordinary drawing moves. Start low and raise gradually on the bench.
- `TMC_SGTHRS` (default `100`, range 0-255): StallGuard sensitivity. Higher =
  less sensitive (requires a harder stall to trigger). This absolutely needs
  tuning per-machine (belt tension, motor, current all affect it).
- `TMC_TCOOLTHRS`: velocity threshold below which StallGuard/CoolStep are
  active. Defaults to nearly the full speed range; narrow it if you get false
  stalls at low speed (e.g. during slow jogging) or missed stalls at high
  speed.
- `setupTmcDrivers()` currently enables SpreadCycle (`en_spreadCycle(true)`)
  rather than StealthChop, because StallGuard is more reliable in SpreadCycle.
  This is louder. Once stall detection is validated, consider experimenting
  with StealthChop + `pwm_autoscale`-based stall detection if quieter running
  matters more.

## Safe first test

Do this before ever letting the automatic retract-until-stall or
stall-pause-while-drawing logic run against the real belts unattended:

1. **Bench-test the UART link first, with the belts *not* under load.**
   Flash a build with `MURAL_TMC_UART` and watch the serial log at boot for
   driver communication errors (the TMCStepper library's `begin()` calls will
   silently no-op on a broken UART link, so also read back a register, e.g.
   `leftDriver->SGTHRS()`, and print it - if it doesn't match what you wrote,
   the wiring is wrong).
2. **Watch `DIAG` behavior with a multimeter/LED before trusting it in code.**
   Manually stall a motor (hold the pulley) at low current and confirm the
   `DIAG` pin goes high, and goes back low once the stall is released.
3. **Test retraction with your hand ready on the power switch.** Enter the
   retract-belts phase and watch both belts; be ready to cut power if a belt
   doesn't stop retracting at a sane point (e.g. `TMC_SGTHRS` too high /
   `TMC_RUN_CURRENT_MA` too low means stall never triggers and the belt could
   fully unspool or jam).
4. **Test the mid-drawing pause deliberately** by manually blocking one
   pulley during a short test drawing and confirming: motion actually stops,
   the pen lifts, and the OLED shows `STALL - paused`.
5. Only after 1-4 pass repeatedly should you leave a drawing job unattended
   with this flag enabled.

## Building

```
pio run -e esp32dev-tmcuart
```

This environment (`platformio.ini`) adds `-DMURAL_TMC_UART` and the
`TMCStepper` library dependency on top of the default `esp32dev` environment.
It has only been verified to *compile*, not to run on hardware.
