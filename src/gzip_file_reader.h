#pragma once
#include <FS.h>
#include <Arduino.h>
#include <esp32/rom/miniz.h>

// Streaming deflate-raw decompressor wrapping a LittleFS File.
// Uses tinfl_decompress from ESP32 ROM — no extra library needed.
//
// Ring-buffer mode (no TINFL_FLAG_USING_NON_WRAPPING_OUTPUT_BUF) correctly
// handles deflate back-references up to 32 KB, matching the browser's
// CompressionStream("deflate-raw") default window.
class GzipFileReader {
public:
    static constexpr size_t DICT_SIZE   = 32768; // deflate sliding window
    static constexpr size_t IN_BUF_SIZE = 1024;

    GzipFileReader() = default;
    explicit GzipFileReader(File f);

    // Set file and initialize. Avoids constructing a temporary (which would
    // put the 32 KB _dict on the stack and overflow small RTOS tasks).
    bool   open(File f);

    // Re-initialize with an already-set file (used internally by open()).
    bool   begin();

    // True while there are unread decompressed bytes or more input to process.
    bool   available() const;

    // Read decompressed text up to (and consuming) terminator.
    // Matches the Arduino File::readStringUntil interface.
    String readStringUntil(char terminator);

    // Copy up to maxLen decompressed bytes into buf. Returns bytes copied.
    size_t read(uint8_t* buf, size_t maxLen);

private:
    File               _file;
    tinfl_decompressor _decomp;

    uint8_t  _inBuf[IN_BUF_SIZE];
    uint8_t  _dict[DICT_SIZE];   // tinfl ring buffer (back-reference window)

    size_t   _inRemain  = 0;     // bytes left in _inBuf not yet fed to tinfl
    size_t   _inOffset  = 0;     // read cursor into _inBuf

    size_t   _writePos  = 0;     // next tinfl write position in _dict (ring)
    size_t   _readPos   = 0;     // caller's read cursor in _dict
    size_t   _dataCount = 0;     // decompressed bytes available to caller

    bool     _done = false;

    // Decompress one chunk: reads from _inBuf (refilling from _file if needed)
    // and appends decompressed bytes into _dict at _writePos.
    void _pump();
};
