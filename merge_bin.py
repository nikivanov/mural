import os
from SCons.Script import COMMAND_LINE_TARGETS, AlwaysBuild
Import("env")

# Adds a "mergebin" target that combines bootloader, partition table, boot_app0,
# app and filesystem images into a single binary meant to be flashed at 0x0.
# Usage: pio run -t mergebin  ->  .pio/build/<env>/firmware-merged.bin

def merge_bin(source, target, env):
    board = env.BoardConfig()
    esptool = os.path.join(env.PioPlatform().get_package_dir("tool-esptoolpy"), "esptool.py")

    images = [(offset, env.subst(path)) for offset, path in env.get("FLASH_EXTRA_IMAGES", [])]
    images.append((env.subst("$ESP32_APP_OFFSET"), env.subst("$BUILD_DIR/${PROGNAME}.bin")))
    images.append((hex(env["FS_START"]), env.subst("$BUILD_DIR/${ESP32_FS_IMAGE_NAME}.bin")))

    flash_mode = board.get("build.flash_mode", "dio")
    if flash_mode in ("qio", "qout"):
        flash_mode = "dio"
    flash_freq = "%dm" % (int(board.get("build.f_flash", "40000000L").rstrip("L")) // 1000000)
    flash_size = board.get("upload.flash_size", "4MB")

    cmd = [
        '"$PYTHONEXE"', '"%s"' % esptool,
        "--chip", board.get("build.mcu", "esp32"),
        "merge_bin",
        "--output", '"$BUILD_DIR/firmware-merged.bin"',
        "--flash_mode", flash_mode,
        "--flash_freq", flash_freq,
        "--flash_size", flash_size,
    ]
    for offset, path in images:
        cmd += [offset, '"%s"' % path]
    env.Execute(" ".join(cmd))

dependencies = ["$BUILD_DIR/${PROGNAME}.bin"]
if "mergebin" in COMMAND_LINE_TARGETS:
    # main.py only defines the FS image target for buildfs/uploadfs, and in that
    # mode firmware.bin isn't buildable, so build the FS image here instead.
    fs_image = env.DataToBin("$BUILD_DIR/${ESP32_FS_IMAGE_NAME}", "$PROJECT_DATA_DIR")
    env.NoCache(fs_image)
    AlwaysBuild(fs_image)
    dependencies.append(fs_image)

env.AddCustomTarget(
    name="mergebin",
    dependencies=dependencies,
    actions=merge_bin,
    title="Merge Binaries",
    description="Build a single binary to flash at offset 0x0",
)
