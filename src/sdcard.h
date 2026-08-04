#ifndef SdCard_h
#define SdCard_h
#include "display.h"

// Mounts the SD card that stores drawing commands, blocking on the boot
// screen until it succeeds. Halts forever (screen shows "NO CARD") if no
// card is detected, or if it still can't be formatted/mounted after the
// on-screen countdown.
void initSdCardOrHalt(Display *display);

#endif
