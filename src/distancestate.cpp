#include "Preferences.h"

namespace DistanceState {
    const auto NAMESPACE = "muralprefs";
    const auto PROPERTY = "distance";
    Preferences prefs;

    int readStoredDistance() {
        prefs.begin(NAMESPACE);
        auto distance = prefs.getInt(PROPERTY, -1);
        prefs.end();

        return distance;
    }
    
    void storeDistance(int distance) {
        prefs.begin(NAMESPACE);
        prefs.putInt(PROPERTY, distance);
        prefs.end();
    }

    void deleteStoredDistance() {
        prefs.begin(NAMESPACE);
        prefs.remove(PROPERTY);
        prefs.end();
    }
}