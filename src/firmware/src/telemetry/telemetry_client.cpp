#include "telemetry_client.h"

#include <Arduino.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>

#include <cstring>

#include "config.h"

namespace {

bool isHttpsUrl(const std::string& url) {
    return url.rfind("https://", 0) == 0;
}

// One HTTP attempt. Returns http_status <= 0 on any transport-level
// failure (never fabricates a response body/status in that case).
struct HttpAttemptResult {
    int http_status;
    std::string body;
};

HttpAttemptResult postTelemetryOnce(const std::string& device_token,
                                     const std::string& payload) {
    const std::string url = std::string(API_BASE_URL) + "/telemetry";

    HTTPClient http;
    WiFiClientSecure secure_client;
    WiFiClient plain_client;
    bool began = false;

    if (isHttpsUrl(url)) {
        if (strlen(CLAIM_API_ROOT_CA_PEM) == 0) {
            // Fail closed: same root CA fail-closed policy as the claim
            // flow (issue #23) - CLAIM_API_ROOT_CA_PEM is the root CA for
            // API_BASE_URL as a whole (single backend), not claim-specific,
            // despite its name. Never fall back to an unverified TLS
            // connection.
            return HttpAttemptResult{-1, ""};
        }
        secure_client.setCACert(CLAIM_API_ROOT_CA_PEM);
        began = http.begin(secure_client, url.c_str());
    } else {
        began = http.begin(plain_client, url.c_str());
    }

    if (!began) {
        return HttpAttemptResult{-1, ""};
    }

    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization",
                    (std::string("Bearer ") + device_token).c_str());
    http.setTimeout(TELEMETRY_HTTP_TIMEOUT_MS);

    const int http_status = http.POST(
        const_cast<uint8_t*>(reinterpret_cast<const uint8_t*>(payload.data())),
        payload.size());

    std::string body;
    if (http_status > 0) {
        body = http.getString().c_str();
    }
    http.end();

    return HttpAttemptResult{http_status, body};
}

}  // namespace

namespace telemetry {

TelemetryCycleResult send_telemetry(const std::string& device_token,
                                     const TelemetryRequestData& data) {
    if (WiFi.status() != WL_CONNECTED) {
        // Offline basic behavior (requirements.md issue #24 acceptance
        // criteria): do not attempt a request against a radio we know is
        // down, do not fabricate a response, and let the caller simply
        // retry on the next scheduled cycle.
        Serial.println(
            "[WARN] Wi-Fi not connected. Skipping this telemetry cycle "
            "(offline).");
        return TelemetryCycleResult{false, TelemetryResponseResult{}};
    }

    const std::string payload = build_telemetry_request_payload(data);

    for (unsigned int attempt = 1; attempt <= TELEMETRY_HTTP_MAX_ATTEMPTS;
         ++attempt) {
        const HttpAttemptResult attempt_result =
            postTelemetryOnce(device_token, payload);

        if (attempt_result.http_status > 0) {
            const TelemetryResponseResult response = parse_telemetry_response(
                attempt_result.http_status, attempt_result.body);
            return TelemetryCycleResult{true, response};
        }

        Serial.print("[ERROR] Telemetry POST transport failure (attempt ");
        Serial.print(attempt);
        Serial.print("/");
        Serial.print(TELEMETRY_HTTP_MAX_ATTEMPTS);
        Serial.println("). Will retry after backoff if attempts remain.");

        if (attempt < TELEMETRY_HTTP_MAX_ATTEMPTS) {
            delay(TELEMETRY_HTTP_RETRY_DELAY_MS);
        }
    }

    Serial.println(
        "[ERROR] Telemetry POST failed after all retry attempts. Giving up "
        "until the next scheduled cycle.");
    return TelemetryCycleResult{false, TelemetryResponseResult{}};
}

}  // namespace telemetry
