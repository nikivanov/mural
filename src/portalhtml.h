#ifndef PortalHtml_h
#define PortalHtml_h

#include <WiFiManager.h>

// Skins WiFiManager's captive portal to match the Mural UI, with Mural specific text and a
// "Use without WiFi" option that POSTs to /offline
void applyPortalTheme(WiFiManager &wifiManager);

// Response to POST /offline, shown briefly before Mural restarts in hotspot mode
extern const char OFFLINE_PAGE_HTML[];

#endif
