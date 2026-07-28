#include "telemetry_format.h"

#include <sstream>

bool is_valid_reading(float temperature_c, float humidity_pct) {
    const bool temperature_in_range = temperature_c >= -40.0f && temperature_c <= 85.0f;
    const bool humidity_in_range = humidity_pct >= 0.0f && humidity_pct <= 100.0f;
    return temperature_in_range && humidity_in_range;
}

std::string format_telemetry_payload(const TelemetryReading& reading) {
    std::ostringstream out;
    out << "{"
        << "\"device_token\":\"" << reading.device_token << "\","
        << "\"seq\":" << reading.seq << ","
        << "\"temperature_c\":" << reading.temperature_c << ","
        << "\"humidity_pct\":" << reading.humidity_pct
        << "}";
    return out.str();
}
