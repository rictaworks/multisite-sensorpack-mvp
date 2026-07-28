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
// There is deliberately no static WIFI_SSID/WIFI_PASSWORD macro here. Since
// issue #23, the site Wi-Fi SSID/password are captured once via the
// AP-mode claim flow (wifi_provisioning) and persisted to NVS; main.cpp
// reads them from there on every boot after the first. connectToWiFi()
// fails closed (halts with a logged error) if the resolved SSID is empty,
// rather than falling back to any default network.
#define WIFI_CONNECT_TIMEOUT_MS 20000UL

// ---------------------------------------------------------------------------
// Backend API
// ---------------------------------------------------------------------------
// Base URL + wire format per src/shared/contracts/openapi.yaml (issue #5).
// Full telemetry/command HTTP transport is wired up in issue #24; the claim
// request (POST {API_BASE_URL}/devices/claim) is wired up in issue #23.
#define API_BASE_URL ""

// PEM-encoded root CA certificate for API_BASE_URL when it is https://.
// Left empty in this template. The claim flow (issue #23) fails closed
// (refuses to submit the claim code) rather than falling back to an
// unverified/insecure TLS connection when the scheme is https and this is
// empty (OWASP A02 - cryptographic failures). Fill this in once the
// production backend domain/cert (Railway, per deploy.md) is finalized.
// http:// (e.g. local bench testing) does not require this.
#define CLAIM_API_ROOT_CA_PEM ""

// Note: there is no static DEVICE_TOKEN macro either, for the same reason -
// the device token is issued by the server at claim time (issue #23) and
// persisted to NVS; main.cpp reads it from there. No token is ever
// fabricated or defaulted here.

// ---------------------------------------------------------------------------
// AP-mode Wi-Fi provisioning + device claim (issue #23, requirements.md F1)
// ---------------------------------------------------------------------------
// On first boot (no device token stored in NVS yet), the ESP32 raises its
// own Wi-Fi access point so an installer's phone/laptop can connect
// directly and submit the site Wi-Fi credentials + an 8-character claim
// code issued from the dashboard. This AP password is the ESP32's own
// setup-mode password (printed on the device label in production), not a
// site/network secret - it is intentionally kept in the template. Change
// it per fleet/batch if desired.
#define PROVISIONING_AP_SSID_PREFIX "SensorPack-Setup-"
#define PROVISIONING_AP_PASSWORD "sensorpack-setup"

// How long to try the installer-supplied Wi-Fi credentials before reporting
// failure back on the provisioning web page (fail closed - never silently
// falls back to a previous/default network).
#define PROVISIONING_WIFI_CONNECT_TIMEOUT_MS 20000UL

// How long to wait for the claim_device HTTP response before treating the
// attempt as failed and allowing the installer to retry.
#define PROVISIONING_CLAIM_HTTP_TIMEOUT_MS 10000UL

// Matches the server-side lockout in requirements.md F1.5 (5 failed
// verifications invalidate the code). The firmware mirrors this only to
// stop hammering an already-doomed code; the server remains the source of
// truth for lockout.
#define PROVISIONING_MAX_CLAIM_ATTEMPTS 5

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
