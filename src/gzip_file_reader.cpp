#include "gzip_file_reader.h"

GzipFileReader::GzipFileReader(File f) : _file(f) {}

bool GzipFileReader::open(File f) {
    _file = f;
    return begin();
}

bool GzipFileReader::begin() {
    if (!_file) return false;
    tinfl_init(&_decomp);
    _inRemain = _inOffset = 0;
    _writePos = _readPos = _dataCount = 0;
    _done = false;
    return true;
}

bool GzipFileReader::available() const {
    return _dataCount > 0 || !_done;
}

void GzipFileReader::_pump() {
    // Refill input buffer from file when exhausted
    if (_inRemain == 0 && _file.available()) {
        size_t n = min((size_t)IN_BUF_SIZE, (size_t)_file.available());
        _inRemain = _file.read(_inBuf, n);
        _inOffset = 0;
    }
    if (_inRemain == 0) {
        _done = true;
        return;
    }

    // Space from writePos to end of ring (never crosses the boundary in one call)
    size_t outAvail = DICT_SIZE - _writePos;

    // Clear HAS_MORE_INPUT when the current _inBuf holds the final file bytes
    mz_uint32 flags = (_file.available() > 0) ? TINFL_FLAG_HAS_MORE_INPUT : 0;

    size_t inSize = _inRemain;
    tinfl_status status = tinfl_decompress(
        &_decomp,
        _inBuf + _inOffset, &inSize,        // inSize → bytes consumed on return
        _dict,
        _dict + _writePos, &outAvail,        // outAvail → bytes written on return
        flags
    );

    _inOffset  += inSize;
    _inRemain  -= inSize;

    _writePos   = (_writePos + outAvail) % DICT_SIZE;
    _dataCount += outAvail;

    if (status == TINFL_STATUS_DONE) _done = true;
}

String GzipFileReader::readStringUntil(char terminator) {
    String result;
    result.reserve(64);
    while (true) {
        while (_dataCount == 0 && !_done) _pump();
        if (_dataCount == 0) break;
        char c = (char)_dict[_readPos];
        _readPos = (_readPos + 1) % DICT_SIZE;
        _dataCount--;
        if (c == terminator) break;
        result += c;
    }
    return result;
}

size_t GzipFileReader::read(uint8_t* buf, size_t maxLen) {
    size_t total = 0;
    while (total < maxLen) {
        while (_dataCount == 0 && !_done) _pump();
        if (_dataCount == 0) break;
        // Data within a single pump cycle never wraps, but guard anyway
        size_t contiguous = min(_dataCount, DICT_SIZE - _readPos);
        size_t n = min(contiguous, maxLen - total);
        memcpy(buf + total, _dict + _readPos, n);
        _readPos    = (_readPos + n) % DICT_SIZE;
        _dataCount -= n;
        total      += n;
    }
    return total;
}
