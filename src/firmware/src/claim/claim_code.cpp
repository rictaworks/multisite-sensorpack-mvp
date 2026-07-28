#include "claim_code.h"

#include <ArduinoJson.h>

bool is_valid_claim_code_format(const std::string& code) {
    // ^[A-Z0-9]{8}$ - exactly 8 characters, each an uppercase letter or
    // digit. No lowercase/whitespace/normalization is accepted here; the
    // caller must supply an already-correctly-formatted code.
    if (code.size() != 8) {
        return false;
    }
    for (const char c : code) {
        const bool is_upper = (c >= 'A' && c <= 'Z');
        const bool is_digit = (c >= '0' && c <= '9');
        if (!is_upper && !is_digit) {
            return false;
        }
    }
    return true;
}

std::string build_claim_request_payload(const std::string& code) {
    // ArduinoJson (not manual string concatenation) so the payload is
    // always well-formed JSON with correct escaping, even though `code`
    // itself is restricted to [A-Z0-9] and needs none here - this keeps a
    // single, safe serialization path if the request body ever grows
    // additional fields.
    JsonDocument doc;
    doc["code"] = code;

    std::string out;
    serializeJson(doc, out);
    return out;
}

ClaimResult parse_claim_response(int http_status_code,
                                  const std::string& response_body) {
    ClaimResult result{};
    result.success = false;
    result.device_id = 0;

    JsonDocument doc;
    const DeserializationError parse_error =
        deserializeJson(doc, response_body);

    if (parse_error) {
        // Malformed body - fail closed. We do not fabricate a
        // device_id/device_token from a response we could not parse, even
        // if http_status_code claimed success.
        result.error_message =
            std::string("malformed_response_body: ") + parse_error.c_str();
        return result;
    }

    if (http_status_code != 201) {
        // Contract: 401 (invalid/expired/used-up/locked code) or 429
        // (IP rate limit) both return the shared Error schema. We surface
        // whatever message the server provided; if it provided none, we
        // still report failure rather than guessing a reason.
        const char* server_message = doc["message"] | doc["error"] | "";
        result.error_message = (server_message != nullptr && server_message[0] != '\0')
                                    ? std::string(server_message)
                                    : std::string("claim_failed_http_") +
                                          std::to_string(http_status_code);
        return result;
    }

    // 201: must match DeviceClaimResponse { deviceId: int64, deviceToken:
    // string } exactly - both fields required, no partial success.
    if (!doc["deviceId"].is<long long>() || !doc["deviceToken"].is<const char*>()) {
        result.error_message =
            "malformed_response_body: missing deviceId/deviceToken";
        return result;
    }

    const char* device_token = doc["deviceToken"];
    if (device_token == nullptr || device_token[0] == '\0') {
        result.error_message = "malformed_response_body: empty deviceToken";
        return result;
    }

    result.success = true;
    result.device_id = doc["deviceId"].as<long long>();
    result.device_token = std::string(device_token);
    return result;
}
