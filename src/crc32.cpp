#include "crc32.h"

static uint32_t crcTable[256];
static bool crcTableInitialized = false;

static void initCrcTable() {
    for (uint32_t n = 0; n < 256; n++) {
        uint32_t c = n;
        for (int k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320UL ^ (c >> 1)) : (c >> 1);
        }
        crcTable[n] = c;
    }
    crcTableInitialized = true;
}

uint32_t crc32_init() {
    if (!crcTableInitialized) {
        initCrcTable();
    }
    return 0xFFFFFFFFUL;
}

uint32_t crc32_update(uint32_t crc, const uint8_t *data, size_t len) {
    if (!crcTableInitialized) {
        initCrcTable();
    }
    for (size_t i = 0; i < len; i++) {
        crc = crcTable[(crc ^ data[i]) & 0xFF] ^ (crc >> 8);
    }
    return crc;
}

uint32_t crc32_finalize(uint32_t crc) {
    return crc ^ 0xFFFFFFFFUL;
}
