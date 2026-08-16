#!/usr/bin/env python3
"""Flash-budget regression gate.

Parses partitions.csv to find the factory (app) and spiffs/littlefs (data)
partition sizes, then checks:

  (a) the built firmware .bin fits inside the factory app partition.
  (b) the built littlefs image has at least MIN_FS_HEADROOM_BYTES of free
      space left inside its partition, reserved for user command files
      that get written at runtime.

Exits non-zero with a clear actual-vs-budget message on any violation.

Usage:
    python tools/check_sizes.py [--project-dir PATH] [--env esp32dev]
"""

import argparse
import csv
import os
import sys

MIN_FS_HEADROOM_BYTES = 512 * 1024  # 512KB reserved for user command files at runtime.

# Must match the parameters PlatformIO's LittleFS image builder uses
# (see builder/main.py in the espressif32 platform: build_fs_image()).
FS_BLOCK_SIZE = 4096


def parse_size(value):
    """Parse a partitions.csv size field like '1200K', '0x6000', or '2800K' into bytes."""
    value = value.strip()
    if not value:
        raise ValueError("empty size field")
    if value.lower().startswith("0x"):
        return int(value, 16)
    if value[-1].upper() == "K":
        return int(value[:-1]) * 1024
    if value[-1].upper() == "M":
        return int(value[:-1]) * 1024 * 1024
    return int(value)


def parse_partitions_csv(path):
    """Return a dict of partition name -> size in bytes."""
    partitions = {}
    with open(path, newline="") as f:
        reader = csv.reader(f)
        for row in reader:
            row = [c.strip() for c in row]
            if not row or not row[0] or row[0].startswith("#"):
                continue
            if len(row) < 5:
                continue
            name, ptype, subtype, offset, size = row[:5]
            try:
                partitions[name] = parse_size(size)
            except ValueError:
                continue
    return partitions


def find_partition(partitions, names):
    for name in names:
        if name in partitions:
            return name, partitions[name]
    return None, None


def get_littlefs_used_bytes(image_path, fs_size):
    """Mount the built littlefs image and sum up the size of all files in it."""
    from littlefs import LittleFS

    block_count = fs_size // FS_BLOCK_SIZE
    fs = LittleFS(
        block_size=FS_BLOCK_SIZE,
        block_count=block_count,
        read_size=1,
        prog_size=1,
        cache_size=FS_BLOCK_SIZE,
        lookahead_size=32,
        block_cycles=500,
        name_max=64,
        mount=False,
    )
    with open(image_path, "rb") as f:
        fs.context.buffer = bytearray(f.read())
    fs.mount()

    total = 0

    def walk(path):
        nonlocal total
        for entry in fs.listdir(path):
            full = path.rstrip("/") + "/" + entry
            st = fs.stat(full)
            if st.type == 1:  # file
                total += st.size
            else:
                walk(full)

    walk("/")
    return total


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--project-dir", default=".", help="Path to the PlatformIO project root")
    parser.add_argument("--env", default="esp32dev", help="PlatformIO environment name")
    args = parser.parse_args()

    project_dir = os.path.abspath(args.project_dir)
    partitions_csv = os.path.join(project_dir, "partitions.csv")
    build_dir = os.path.join(project_dir, ".pio", "build", args.env)
    firmware_bin = os.path.join(build_dir, "firmware.bin")
    littlefs_bin = os.path.join(build_dir, "littlefs.bin")

    failures = []

    if not os.path.isfile(partitions_csv):
        print(f"ERROR: partitions.csv not found at {partitions_csv}")
        sys.exit(2)

    partitions = parse_partitions_csv(partitions_csv)

    app_name, app_size = find_partition(partitions, ["factory", "app0", "app"])
    fs_name, fs_size = find_partition(partitions, ["spiffs", "littlefs", "storage"])

    if app_size is None:
        print(f"ERROR: could not find an app/factory partition in {partitions_csv}")
        sys.exit(2)
    if fs_size is None:
        print(f"ERROR: could not find a spiffs/littlefs partition in {partitions_csv}")
        sys.exit(2)

    # --- (a) firmware .bin vs factory app partition ---
    if not os.path.isfile(firmware_bin):
        print(f"ERROR: firmware binary not found at {firmware_bin} (did 'pio run' succeed?)")
        sys.exit(2)

    firmware_size = os.path.getsize(firmware_bin)
    print(f"Firmware binary : {firmware_size:>10,} bytes")
    print(f"Factory partition ('{app_name}') budget: {app_size:>10,} bytes")
    if firmware_size > app_size:
        failures.append(
            f"Firmware .bin ({firmware_size:,} bytes) exceeds the '{app_name}' factory "
            f"partition budget ({app_size:,} bytes) by {firmware_size - app_size:,} bytes."
        )
    else:
        print(f"  -> OK, {app_size - firmware_size:,} bytes headroom.\n")

    # --- (b) littlefs image used bytes vs spiffs/littlefs partition, with headroom ---
    if not os.path.isfile(littlefs_bin):
        print(f"ERROR: littlefs image not found at {littlefs_bin} (did 'pio run -t buildfs' succeed?)")
        sys.exit(2)

    used_bytes = get_littlefs_used_bytes(littlefs_bin, fs_size)
    headroom = fs_size - used_bytes
    print(f"LittleFS used bytes: {used_bytes:>10,} bytes")
    print(f"Data partition ('{fs_name}') budget: {fs_size:>10,} bytes")
    print(f"Required headroom  : {MIN_FS_HEADROOM_BYTES:>10,} bytes (reserved for user command files)")
    print(f"Actual headroom    : {headroom:>10,} bytes")

    if used_bytes > fs_size:
        failures.append(
            f"LittleFS image contents ({used_bytes:,} bytes) exceed the '{fs_name}' "
            f"partition budget ({fs_size:,} bytes) by {used_bytes - fs_size:,} bytes."
        )
    elif headroom < MIN_FS_HEADROOM_BYTES:
        failures.append(
            f"LittleFS headroom ({headroom:,} bytes free of {fs_size:,} byte '{fs_name}' "
            f"partition) is below the required {MIN_FS_HEADROOM_BYTES:,} bytes "
            f"reserved for user command files. Short by {MIN_FS_HEADROOM_BYTES - headroom:,} bytes."
        )
    else:
        print("  -> OK.\n")

    if failures:
        print("\nFLASH BUDGET CHECK FAILED:")
        for msg in failures:
            print(f"  - {msg}")
        sys.exit(1)

    print("\nFlash budget check passed.")


if __name__ == "__main__":
    main()
