#pragma once

// Configuration template for the ESP32 sensor pack firmware.
//
// Copy this file to `config.h` (same directory) and fill in real values
// for your local development board. `config.h` is git-ignored
// (see src/firmware/.gitignore) and must never be committed.
//
// Do NOT hardcode Wi-Fi credentials, API endpoints, or device tokens
// directly in tracked source files (CLAUDE.md secrets policy).

// ---------------------------------------------------------------------------
// Wi-Fi
// ---------------------------------------------------------------------------
// Leave empty in this example file. main.cpp fails closed (halts with a
// logged error) if WIFI_SSID is empty, rather than falling back to any
// default network.
#define WIFI_SSID ""
#define WIFI_PASSWORD ""
#define WIFI_CONNECT_TIMEOUT_MS 20000UL

// ---------------------------------------------------------------------------
// Backend API
// ---------------------------------------------------------------------------
// Exact base URL and wire format are finalized by the OpenAPI contract in
// issue #5; HTTP transport itself is wired up in issue #24. Kept here now so
// the pin/config separation convention is established from the scaffold.
#define API_BASE_URL ""

// Device token issued by the claim flow (issue #23). Intentionally empty
// until claim is implemented; empty string is NOT a usable fallback token,
// it just means "not yet claimed".
#define DEVICE_TOKEN ""

// ---------------------------------------------------------------------------
// Sensor / actuator pin map (ESP32 devkit GPIO numbers)
// ---------------------------------------------------------------------------
// Chosen to avoid ESP32 boot-strapping pins (0, 2, 12, 15) and input-only
// pins (34-39), so they are safe to use as generic digital I/O.
#define DHT_PIN 4          // DHT22 data pin
#define DHT_SENSOR_TYPE DHT22
#define LED_PIN 26         // Status LED (direct GPIO drive)
#define FAN_RELAY_PIN 27   // DC fan, via relay/MOSFET driver stage

// ---------------------------------------------------------------------------
// Timing
// ---------------------------------------------------------------------------
// Matches DEVICES.expected_interval_sec default of 60s documented in
// requirements.md (ER diagram) / F2.1. This is the device telemetry
// interval, distinct from the dashboard's 30s UI polling interval (F6.4).
#define TELEMETRY_INTERVAL_MS 60000UL
