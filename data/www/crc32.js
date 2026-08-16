// Small standalone CRC32 (IEEE 802.3 / zlib) implementation, no external deps.
// Must stay in sync with the incremental CRC32 computed by the firmware in
// src/crc32.cpp so that uploaded-command verification can compare a single
// 32-bit number instead of re-downloading and diffing the whole file.

const crcTable = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        }
        table[n] = c >>> 0;
    }
    return table;
})();

// Computes the CRC32 of a Uint8Array (or any array-like of bytes).
export function crc32(bytes) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) {
        crc = (crcTable[(crc ^ bytes[i]) & 0xFF] ^ (crc >>> 8)) >>> 0;
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
}

// Convenience helper for computing the CRC32 of a string, encoded as UTF-8
// (matching how Blob([str]) encodes text by default).
export function crc32OfString(str) {
    return crc32(new TextEncoder().encode(str));
}
