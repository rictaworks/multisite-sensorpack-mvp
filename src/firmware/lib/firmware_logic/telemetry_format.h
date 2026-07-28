#pragma once

#include <cstdint>
#include <string>

// Pure, hardware-independent data structures and functions used by the
// firmware. Deliberately free of Arduino/ESP32 headers so they can be
// compiled and unit-tested on the host (see src/firmware/test/test_logic).

struct TelemetryReading {
    std::string device_token;
    uint32_t seq;
    float temperature_c;
    float humidity_pct;
};

// Defensive client-side range check mirroring the server-side validation
// contract documented in requirements.md F2.4 (temperature -40..85 C,
// humidity 0..100 %). This does NOT replace server-side validation; it only
// prevents the firmware from transmitting samples it already knows are
// physically implausible (e.g. a failed/garbled DHT22 read).
//
// Callers MUST discard the sample when this returns false. There is no
// fallback/substitute value - fabricating a reading would defeat the point
// of the check.
bool is_valid_reading(float temperature_c, float humidity_pct);

// Builds the telemetry POST body as a JSON string.
//
// NOTE: field names/wire format are a placeholder consistent with the
// fields explicitly named in requirements.md F2.1 (device token, seq,
// temperature, humidity). The authoritative wire format is the OpenAPI
// contract produced by issue #5; this function must be reconciled with it
// before being wired to a real HTTP client in issue #24.
std::string format_telemetry_payload(const TelemetryReading& reading);
