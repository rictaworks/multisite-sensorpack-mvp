#include "ap_provisioning.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <Preferences.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>

#include <cstring>

#include "claim_code.h"
#include "config.h"

namespace {

// NVS namespace/keys for the claimed-state (Wi-Fi + device token). Kept
// distinct from WiFiManager's own internal NVS usage.
constexpr const char* kPrefsNamespace = "sensorpack";
constexpr const char* kKeyDeviceToken = "dev_token";
constexpr const char* kKeyWifiSsid = "wifi_ssid";
constexpr const char* kKeyWifiPassword = "wifi_pw";

bool isHttpsUrl(const std::string& url) {
    return url.rfind("https://", 0) == 0;
}

// Builds a per-device AP name (chip-id suffix) so multiple unclaimed
// devices in range of each other don't present identical AP names to the
// installer.
std::string buildApSsid() {
    char suffix[7];
    snprintf(suffix, sizeof(suffix), "%06X",
              static_cast<unsigned int>(ESP.getEfuseMac() & 0xFFFFFFu));
    return std::string(PROVISIONING_AP_SSID_PREFIX) + suffix;
}

// Submits the claim code to POST {API_BASE_URL}/devices/claim. Assumes STA
// Wi-Fi is already connected (WiFiManager guarantees this before its
// portal call returns true).
ClaimResult submitClaim(const std::string& code) {
    const std::string url = std::string(API_BASE_URL) + "/devices/claim";

    HTTPClient http;
    WiFiClientSecure secure_client;
    WiFiClient plain_client;
    bool began = false;

    if (isHttpsUrl(url)) {
        if (strlen(CLAIM_API_ROOT_CA_PEM) == 0) {
            // Fail closed: never fall back to an unverified TLS connection.
            // See config.example.h CLAIM_API_ROOT_CA_PEM for how to
            // configure this once the production domain/cert is known.
            ClaimResult result{};
            result.success = false;
            result.device_id = 0;
            result.error_message = "https_root_ca_not_configured";
            return result;
        }
        secure_client.setCACert(CLAIM_API_ROOT_CA_PEM);
        began = http.begin(secure_client, url.c_str());
    } else {
        began = http.begin(plain_client, url.c_str());
    }

    if (!began) {
        ClaimResult result{};
        result.success = false;
        result.device_id = 0;
        result.error_message = "http_begin_failed";
        return result;
    }

    http.addHeader("Content-Type", "application/json");
    http.setTimeout(PROVISIONING_CLAIM_HTTP_TIMEOUT_MS);

    const std::string payload = build_claim_request_payload(code);
    // HTTPClient::POST takes a non-const uint8_t* even though it only
    // reads the buffer; const_cast is safe here since payload is a local
    // we own and POST() does not mutate it.
    const int http_status = http.POST(
        const_cast<uint8_t*>(
            reinterpret_cast<const uint8_t*>(payload.data())),
        payload.size());

    std::string body;
    if (http_status > 0) {
        body = http.getString().c_str();
    }
    http.end();

    if (http_status <= 0) {
        // Transport-level failure (timeout, DNS, connection refused, TLS
        // handshake failure) - never fabricate a device token from a
        // request that never actually completed.
        ClaimResult result{};
        result.success = false;
        result.device_id = 0;
        result.error_message =
            std::string("http_transport_error_") + std::to_string(http_status);
        return result;
    }

    return parse_claim_response(http_status, body);
}

void persistClaim(const std::string& wifi_ssid,
                   const std::string& wifi_password,
                   const std::string& device_token) {
    Preferences prefs;
    prefs.begin(kPrefsNamespace, /*readOnly=*/false);
    prefs.putString(kKeyWifiSsid, wifi_ssid.c_str());
    prefs.putString(kKeyWifiPassword, wifi_password.c_str());
    prefs.putString(kKeyDeviceToken, device_token.c_str());
    prefs.end();
}

}  // namespace

namespace wifi_provisioning {

bool has_stored_device_token() {
    Preferences prefs;
    prefs.begin(kPrefsNamespace, /*readOnly=*/true);
    const bool has_token =
        prefs.isKey(kKeyDeviceToken) && prefs.getString(kKeyDeviceToken, "").length() > 0;
    prefs.end();
    return has_token;
}

StoredCredentials load_stored_credentials() {
    StoredCredentials creds;
    Preferences prefs;
    prefs.begin(kPrefsNamespace, /*readOnly=*/true);
    creds.wifi_ssid = prefs.getString(kKeyWifiSsid, "").c_str();
    creds.wifi_password = prefs.getString(kKeyWifiPassword, "").c_str();
    creds.device_token = prefs.getString(kKeyDeviceToken, "").c_str();
    prefs.end();
    return creds;
}

void run_provisioning_flow() {
    WiFiManager wm;
    const std::string ap_ssid = buildApSsid();

    // Custom field rendered alongside WiFiManager's built-in SSID/password
    // fields on the same captive-portal form (requirements.md F1.3: "ESP32
    // は初回起動時にAPモードで立ち上がり、ユーザーがスマホ等からWi-Fi情報と
    // クレームコードを入力する").
    WiFiManagerParameter claim_code_param(
        "claim_code", "Claim code (8 characters, from the dashboard)", "",
        9);
    wm.addParameter(&claim_code_param);

    std::string last_submitted_code;
    unsigned int attempts_on_current_code = 0;

    while (true) {
        Serial.print("[INFO] Entering AP-mode provisioning. Connect to Wi-Fi '");
        Serial.print(ap_ssid.c_str());
        Serial.println(
            "' and open the captive portal to enter site Wi-Fi + claim code.");

        // startConfigPortal (not autoConnect) is used deliberately: it
        // always shows the portal, even if Wi-Fi credentials from a
        // previous attempt already work, so the installer always gets a
        // chance to (re)submit the claim code after a claim failure.
        const bool wifi_joined =
            wm.startConfigPortal(ap_ssid.c_str(), PROVISIONING_AP_PASSWORD);

        if (!wifi_joined) {
            Serial.println(
                "[ERROR] Wi-Fi join failed/timed out during provisioning. "
                "Re-opening the portal for retry.");
            continue;
        }

        const std::string submitted_code = claim_code_param.getValue();

        if (submitted_code != last_submitted_code) {
            last_submitted_code = submitted_code;
            attempts_on_current_code = 0;
        }

        if (!is_valid_claim_code_format(submitted_code)) {
            // Client-side pre-check only (does not replace server-side
            // validation) - never sends an obviously malformed code.
            Serial.println(
                "[ERROR] Claim code failed format validation (expected 8 "
                "uppercase alphanumeric characters). Re-opening the portal "
                "for retry.");
            continue;
        }

        if (attempts_on_current_code >= PROVISIONING_MAX_CLAIM_ATTEMPTS) {
            // Client-side courtesy mirroring the server-side lockout
            // (requirements.md F1.5); the server remains the actual
            // security boundary. Requires a fresh code before trying again.
            Serial.println(
                "[ERROR] Max claim attempts reached for this code. Issue a "
                "new claim code from the dashboard and re-enter it.");
            last_submitted_code.clear();
            attempts_on_current_code = 0;
            continue;
        }

        const ClaimResult result = submitClaim(submitted_code);
        attempts_on_current_code++;

        if (!result.success) {
            Serial.print("[ERROR] Claim failed: ");
            Serial.println(result.error_message.c_str());
            continue;
        }

        Serial.println(
            "[INFO] Claim succeeded. Persisting credentials and restarting.");
        persistClaim(std::string(WiFi.SSID().c_str()),
                     std::string(WiFi.psk().c_str()), result.device_token);
        delay(500);
        ESP.restart();
        return;  // Unreachable in practice; ESP.restart() does not return.
    }
}

}  // namespace wifi_provisioning
