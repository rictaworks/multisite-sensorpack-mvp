#pragma once

#include <string>

// AP-mode Wi-Fi provisioning + device claim orchestration for the ESP32
// sensor pack (GitHub issue #23, requirements.md 1.6 F1 `claim_device`
// steps 3-6).
//
// Uses the mature, actively-maintained tzapu/WiFiManager library for the
// AP-mode captive portal itself (SSID/password capture, DNS redirect, the
// on-device config web server) rather than hand-rolling one - see
// architecture.md ("車輪の再発明を避け...")). This module only owns the
// app-specific parts WiFiManager does not provide: the extra claim-code
// form field, the POST /devices/claim call (delegated to the pure,
// host-tested logic in src/firmware/src/claim/claim_code.h), and
// persisting the resulting device token to NVS via Preferences.
//
// Hardware-dependent (WiFi AP+STA, an HTTP(S) client, NVS) - NOT
// unit-testable on the host. See src/firmware/README.md for what is/isn't
// covered by automated tests.

namespace wifi_provisioning {

// True if a device token from a prior successful claim is already
// persisted in NVS - i.e. this device does not need AP-mode provisioning
// again and can boot straight into normal STA/telemetry operation.
bool has_stored_device_token();

struct StoredCredentials {
    std::string wifi_ssid;
    std::string wifi_password;
    std::string device_token;
};

// Loads the persisted Wi-Fi SSID/password/device token from NVS.
//
// Callers MUST check has_stored_device_token() first. If nothing has been
// stored yet, every field is returned empty - callers must not treat an
// empty device_token as a usable credential (there is no fallback/default
// token).
StoredCredentials load_stored_credentials();

// Blocking. Repeatedly shows the AP-mode captive portal (Wi-Fi SSID +
// password + claim code) until a Wi-Fi join AND a successful claim both
// happen, persists the resulting Wi-Fi credentials + device token to NVS,
// then restarts the device (ESP.restart()) so the normal boot path in
// main.cpp picks up the newly-stored credentials.
//
// Does not return on success. Only returns to the caller in the truly
// exceptional case documented in ap_provisioning.cpp; callers should not
// rely on a return path.
void run_provisioning_flow();

}  // namespace wifi_provisioning
