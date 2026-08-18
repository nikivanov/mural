#ifndef PrefsKeys_h
#define PrefsKeys_h

// Shared NVS (Preferences) namespace/keys used to persist calibration values
// (top distance between hangers, pen servo angle) across firmware restarts.
static const char* PREFS_NAMESPACE = "mural";
static const char* PREFS_TOP_DISTANCE_KEY = "topDistance";
static const char* PREFS_PEN_ANGLE_KEY = "penAngle";

// NVS namespace/keys used to checkpoint an in-progress drawing (see Runner)
// so it can be resumed after a power loss. Written before executing each
// command line (throttled - see Runner::checkpointIntervalLines), so a
// checkpoint always describes a position at-or-before the belts' true
// physical position, never after it. Cleared on successful completion, on a
// new upload, or when the user discards a resume offer.
static const char* PREFS_CKPT_NAMESPACE = "mural-ckpt";
static const char* PREFS_CKPT_VALID_KEY = "valid";
static const char* PREFS_CKPT_OFFSET_KEY = "offset";
static const char* PREFS_CKPT_EXEC_LINES_KEY = "execLines";
static const char* PREFS_CKPT_X_KEY = "x";
static const char* PREFS_CKPT_Y_KEY = "y";
static const char* PREFS_CKPT_TOP_DIST_KEY = "topDist";
static const char* PREFS_CKPT_PEN_ANGLE_KEY = "penAngle";
// Whether the pen was down (mid-stroke) at the moment this checkpoint was
// written - see Runner::Checkpoint's doc comment.
static const char* PREFS_CKPT_PEN_DOWN_KEY = "penDown";
// Multi-color (docs/multi-color.md): which pen was mounted/active at the
// moment this checkpoint was written, so a resume offer can tell the user
// which pen must be (re-)inserted. colorIndex defaults to 1 and colorName to
// "" for single-color files/jobs that never saw a c<index> command - see
// Runner::writeCheckpoint().
static const char* PREFS_CKPT_COLOR_INDEX_KEY = "colorIdx";
static const char* PREFS_CKPT_COLOR_NAME_KEY = "colorName";

#endif
