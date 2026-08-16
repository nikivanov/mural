#ifndef PrefsKeys_h
#define PrefsKeys_h

// Shared NVS (Preferences) namespace/keys used to persist calibration values
// (top distance between hangers, pen servo angle) across firmware restarts.
static const char* PREFS_NAMESPACE = "mural";
static const char* PREFS_TOP_DISTANCE_KEY = "topDistance";
static const char* PREFS_PEN_ANGLE_KEY = "penAngle";

#endif
