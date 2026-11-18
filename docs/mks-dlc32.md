# Mural on the MKS DLC32 v2.1

Mural can run on the [MKS DLC32 v2.1](https://github.com/makerbase-mks/MKS-DLC32) (the original DLC32, **not** the DLC32 MAX) instead of the FluidNC Pen/Laser board. Everything else in the [BOM](../BOM.md) stays the same, plus:

| Part | Qty | Notes |
|---|---|---|
| MKS DLC32 v2.1 | 1 | Comes with a WiFi antenna. Attach the antenna: the ESP32-WROOM-32U module has no PCB antenna |
| TMC2209 StepStick driver module (standalone) | 2 | Goes in the X and Y sockets |
| DC barrel pigtail or 2-pin XH2.54 lead | 1 | From the USB-C PD trigger (set to 12V or 20V) to the board's power input |

## Building and flashing

```
pio run -e mks_dlc32 -t upload        # firmware
pio run -e mks_dlc32 -t uploadfs      # web UI
pio run -e mks_dlc32 -t mergebin      # single image: .pio/build/mks_dlc32/firmware-merged.bin
```

The FluidNC board is the default env (`fluidnc`).

## Drivers

The DLC32 has no UART link to the drivers, so microstepping and current are set in hardware:

- **Microstepping:** set **all three DIP switches OFF** for both X and Y. On a TMC2209 that gives 1/8 microstepping, which is what the firmware expects (`MICROSTEPS` in `src/board.h`).
- **Current:** set each driver's **Vref to about 1.0 V**, which gives ~700 mA RMS for the 1A pancake motors (I_rms ≈ 0.71 × Vref on most TMC2209 modules; check your module's datasheet).

## Wiring

| What | Where on the DLC32 |
|---|---|
| Left motor | X motor connector |
| Right motor | Y motor connector (either of the two) |
| OLED | I2C header J2: pin 1 = 3V3, 2 = GND, 3 = SDA, 4 = SCL. Most 0.91" OLEDs are pinned GND, VCC, SCL, SDA, so wire each pin with a separate dupont jumper |
| Servo signal | Laser TTL header J18, pin 3 (5V signal) |
| Servo 5V and GND | Any endstop/probe header, J9–J12: pin 1 = +5V, pin 2 = GND |
| SD card | On-board slot |
| Power | DC barrel jack, 12–24V |

### Servo wiring

**The servo can't be plugged straight into any header. Repin its connector or use dupont jumpers.**

- J18 pin 1 is the raw input voltage (12–24V), not 5V. Never connect the servo's red wire to J18.
- The endstop/probe headers are ordered `+5V, GND, signal`, while a servo plug is `GND, +5V, signal`. Plugged in as-is, the servo gets 5V on its ground wire and ground on its power wire.

```
Servo brown  (GND)    ->  J12 pin 2 (GND)
Servo red    (+5V)    ->  J12 pin 1 (+5V)
Servo orange (signal) ->  J18 pin 3 (laser TTL)
```

The laser output's red LED flickers along with the servo signal. That's expected. Don't connect anything to the laser/spindle screw terminal (J7).

**Alternative:** to keep the whole servo on the probe header J12, wire the servo signal to J12 pin 3 and build with `build_flags = -DMURAL_BOARD_MKS_DLC32 -DPEN_SERVO_PIN=22`. The probe input has an RC filter and a pull-up on it, so the signal is weaker than on J18. Prefer J18 if the pen jitters.

### Power

Use the barrel jack. Don't feed power into the laser/spindle screw terminal (J7): its negative terminal is a MOSFET switch, not ground.

The 2-pin XH2.54 fan headers (J6/J13) can be back-fed as a power input, but that bypasses the board's fuse, so get the polarity right.

## Things to check on first power-up

- The motors don't twitch at power-on.
- The OLED shows the starting screen and the SD card mounts.
- The belts retract and extend in the right direction. If a motor runs backwards, flip its `LEFT_DIR_INVERTED`/`RIGHT_DIR_INVERTED` in the MKS DLC32 section of `src/board.h`, or swap one coil pair on that motor's connector.
