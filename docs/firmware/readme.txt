If the online firmware flasher doesn't work for you, you can flash the firmware manually.
You'll need Python 3 and whatever dependencies esptool.py requires.
You may need to specify the full path to esptool.py
You will also need to specify the port for your ESP32. 

python esptool.py --chip esp32 --port "REPLACE_ME" --baud 460800 --before default_reset --after hard_reset write_flash -z --flash_mode dio --flash_freq 40m --flash_size 4MB 0x1000 bootloader.bin 0x8000 partitions.bin 0xe000 boot_app0.bin 0x10000 firmware.bin 0x13C000 littlefs.bin