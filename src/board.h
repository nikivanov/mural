#ifndef Board_h
#define Board_h

// Board-specific pins and capabilities. Exactly one MURAL_BOARD_* macro is set per
// PlatformIO env via build_flags (see platformio.ini).

// Microstepping used by both boards. On FluidNC it's written to the TMC2209s over UART;
// on the MKS DLC32 it must match the driver DIP switches (TMC2209 standalone: all OFF = 1/8).
constexpr int MICROSTEPS = 8;

#if defined(MURAL_BOARD_FLUIDNC)

#define MURAL_HAS_TMC_UART 1

constexpr int LEFT_STEP_PIN = 14;
constexpr int LEFT_DIR_PIN = 12;
constexpr int LEFT_UART_ADDR = 0;
constexpr int LEFT_DIAG_PIN = 36;

constexpr int RIGHT_STEP_PIN = 25;
constexpr int RIGHT_DIR_PIN = 26;
constexpr int RIGHT_UART_ADDR = 1;
constexpr int RIGHT_DIAG_PIN = 39;

constexpr int MOTOR_ENABLE_PIN = 13;   // Shared, active LOW

constexpr bool LEFT_DIR_INVERTED = true;
constexpr bool RIGHT_DIR_INVERTED = false;

constexpr int TMC_UART_RX_PIN = 16;
constexpr int TMC_UART_TX_PIN = 17;
constexpr float TMC_R_SENSE = 0.11;
constexpr int TMC_RMS_CURRENT_MA = 707;

#ifndef PEN_SERVO_PIN
#define PEN_SERVO_PIN 21
#endif

constexpr int I2C_SDA_PIN = 15;
constexpr int I2C_SCL_PIN = 4;

constexpr int SD_SCK_PIN = 18;
constexpr int SD_MISO_PIN = 19;
constexpr int SD_MOSI_PIN = 23;
constexpr int SD_CS_PIN = 5;

#elif defined(MURAL_BOARD_MKS_DLC32)

#define MURAL_HAS_TMC_UART 0

// STEP/DIR/EN for all drivers go through a single 74HC595 (U3). OE is tied low and MR high,
// so its outputs are random until the first latch; see ShiftRegister::begin().
constexpr int SR_DATA_PIN = 21;    // SER   (I2S_DATA on the schematic)
constexpr int SR_CLOCK_PIN = 16;   // SRCLK (I2S_BCK)
constexpr int SR_LATCH_PIN = 17;   // RCLK  (I2S_WS)

// 74HC595 output bits (Qn).
constexpr int SR_MOTOR_ENABLE_BIT = 0;   // Shared XYZ_EN, active LOW at the drivers
constexpr int SR_LEFT_STEP_BIT = 1;      // X
constexpr int SR_LEFT_DIR_BIT = 2;
constexpr int SR_RIGHT_STEP_BIT = 3;     // Z
constexpr int SR_RIGHT_DIR_BIT = 4;
// Q5/Q6 = Y step/dir (unused), Q7 = beeper (held low).

// Same as FluidNC; not yet verified on hardware. Flip one if that motor runs backwards.
constexpr bool LEFT_DIR_INVERTED = false;
constexpr bool RIGHT_DIR_INVERTED = true;

// Laser TTL output (J18 pin 3): level-shifted to 5V and pulled low at boot.
// Override with -DPEN_SERVO_PIN=22 to use the probe header (J12) instead.
#ifndef PEN_SERVO_PIN
#define PEN_SERVO_PIN 32
#endif

// I2C header J2 (1=3V3, 2=GND, 3=SDA, 4=SCL).
constexpr int I2C_SDA_PIN = 0;
constexpr int I2C_SCL_PIN = 4;

constexpr int SD_SCK_PIN = 14;
constexpr int SD_MISO_PIN = 12;
constexpr int SD_MOSI_PIN = 13;
constexpr int SD_CS_PIN = 15;

#else
#error "No board selected. Build with a PlatformIO env from platformio.ini (e.g. pio run -e fluidnc)."
#endif

#endif
