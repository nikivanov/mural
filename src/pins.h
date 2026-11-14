#ifndef Pins_h
#define Pins_h

// Board specific pin assignments. The board is selected with a build flag in platformio.ini:
//   (none)              TMC2209 Pen/Laser FluidNC CNC Controller (the original Mural board)
//   -DBOARD_MKS_DLC32   Makerbase MKS DLC32 V2.1
//
// Individual pins can be overridden from platformio.ini as well, e.g. -DPEN_SERVO_PIN=22.

#if defined(BOARD_MKS_DLC32)

// --- MKS DLC32 V2.1 -------------------------------------------------------------------------
// STEP / DIR / ENABLE of the driver sockets are not connected to the ESP32 directly. They hang
// off a 74HC595 shift register (FluidNC calls its outputs I2SO.0 - I2SO.7).
#define STEPPERS_VIA_SHIFT_REGISTER

constexpr int SHIFT_REG_CLOCK_PIN = 16; // I2S BCK -> 74HC595 SRCLK
constexpr int SHIFT_REG_LATCH_PIN = 17; // I2S WS  -> 74HC595 RCLK
constexpr int SHIFT_REG_DATA_PIN = 21;  // I2S DATA -> 74HC595 SER

// Bit numbers within the shift register (== I2SO.n).
constexpr int MOTOR_ENABLE_BIT = 0;     // shared by all sockets, active low
constexpr int LEFT_STEP_BIT = 1;        // X socket
constexpr int LEFT_DIR_BIT = 2;
constexpr int RIGHT_STEP_BIT = 5;       // Y socket
constexpr int RIGHT_DIR_BIT = 6;
// Unused: 3/4 = Z step/dir, 7 = beeper.

// The driver sockets have no UART connection. TMC2209s run standalone: microstepping is set
// with the jumpers below the sockets (must be 1/8, see stepsPerRotation) and the motor
// current with the potentiometer on the driver.

#ifndef PEN_SERVO_PIN
#define PEN_SERVO_PIN 32                // Laser/TTL PWM output on V2.1 (V2.0: 22)
#endif

constexpr int DISPLAY_SDA_PIN = 0;      // I2C header
constexpr int DISPLAY_SCL_PIN = 4;

constexpr int SD_SCK_PIN = 14;          // On-board micro SD slot
constexpr int SD_MISO_PIN = 12;
constexpr int SD_MOSI_PIN = 13;
constexpr int SD_CS_PIN = 15;

#else

// --- TMC2209 Pen/Laser FluidNC CNC Controller -----------------------------------------------
#define HAS_TMC_UART

constexpr int LEFT_STEP_PIN = 14;
constexpr int LEFT_DIR_PIN = 12;
constexpr int LEFT_UART_ADDR = 0;
constexpr int LEFT_DIAG_PIN = 36;

constexpr int RIGHT_STEP_PIN = 25;
constexpr int RIGHT_DIR_PIN = 26;
constexpr int RIGHT_UART_ADDR = 1;
constexpr int RIGHT_DIAG_PIN = 39;

constexpr int MOTOR_ENABLE_PIN = 13;

constexpr int TMC_UART_RX_PIN = 16;
constexpr int TMC_UART_TX_PIN = 17;

#ifndef PEN_SERVO_PIN
#define PEN_SERVO_PIN 21
#endif

constexpr int DISPLAY_SDA_PIN = 15;
constexpr int DISPLAY_SCL_PIN = 4;

constexpr int SD_SCK_PIN = 18;
constexpr int SD_MISO_PIN = 19;
constexpr int SD_MOSI_PIN = 23;
constexpr int SD_CS_PIN = 5;

#endif

#endif
