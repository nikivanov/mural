#ifndef Crc32_h
#define Crc32_h
#include <Arduino.h>

// Small standalone, incremental CRC32 (IEEE 802.3 / zlib) implementation.
// Kept independent of any chip-specific ROM routine so it behaves identically
// to the client-side implementation in data/www/crc32.js.

// Returns the initial CRC32 accumulator value to start a new incremental computation.
uint32_t crc32_init();

// Feeds len bytes of data into an in-progress CRC32 computation, returning the updated accumulator.
uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t len);

// Converts an accumulator value into the final CRC32 result.
uint32_t crc32_finalize(uint32_t crc);

#endif
