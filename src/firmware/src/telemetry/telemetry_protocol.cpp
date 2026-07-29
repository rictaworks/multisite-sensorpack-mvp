#include "telemetry_protocol.h"

#include <ArduinoJson.h>

std::string build_telemetry_request_payload(const TelemetryRequestData& data) {
    // ArduinoJson (not manual string concatenation) so the payload is
    // always well-formed JSON with correct escaping, matching the pattern
    // already established for the claim request (src/claim/claim_code.cpp).
    JsonDocument doc;
    doc["seq"] = data.seq;
    doc["temperatureC"] = data.temperature_c;
    doc["humidityPct"] = data.humidity_pct;
    // No trusted on-device clock (see telemetry_protocol.h) - always null,
    // never fabricated from millis().
    doc["deviceReportedAt"] = nullptr;

    JsonArray acks = doc["commandAcks"].to<JsonArray>();
    for (const std::string& idempotency_key : data.pending_command_acks) {
        JsonObject ack = acks.add<JsonObject>();
        ack["idempotencyKey"] = idempotency_key;
    }

    std::string out;
    serializeJson(doc, out);
    return out;
}

TelemetryResponseResult parse_telemetry_response(int http_status_code,
                                                   const std::string& response_body) {
    TelemetryResponseResult result{};
    result.parsed_ok = false;
    result.accepted = false;
    result.duplicate = false;

    JsonDocument doc;
    const DeserializationError parse_error = deserializeJson(doc, response_body);

    if (parse_error) {
        // Malformed body - fail closed, regardless of what the status code
        // claimed. Never execute commands parsed from a body we could not
        // actually deserialize.
        result.error_message =
            std::string("malformed_response_body: ") + parse_error.c_str();
        return result;
    }

    if (http_status_code != 200) {
        // Contract: 400 (validation error) / 401 (invalid token) / 410
        // (device deleted) all return the shared Error schema. Surface the
        // server-provided message if present; otherwise report the status.
        const char* server_message = doc["message"] | doc["error"] | "";
        result.error_message = (server_message != nullptr && server_message[0] != '\0')
                                    ? std::string(server_message)
                                    : std::string("telemetry_rejected_http_") +
                                          std::to_string(http_status_code);
        return result;
    }

    // 200: must match TelemetryIngestResponse { accepted, serverTime,
    // commands } - all three required per the contract. `duplicate` is
    // optional (only present when the seq was a repeat).
    if (!doc["accepted"].is<bool>() || !doc["serverTime"].is<const char*>() ||
        !doc["commands"].is<JsonArrayConst>()) {
        result.error_message =
            "malformed_response_body: missing accepted/serverTime/commands";
        return result;
    }

    result.parsed_ok = true;
    result.accepted = doc["accepted"].as<bool>();
    result.duplicate = doc["duplicate"] | false;
    result.server_time = std::string(doc["serverTime"].as<const char*>());

    for (JsonObjectConst command : doc["commands"].as<JsonArrayConst>()) {
        if (!command["idempotencyKey"].is<const char*>() ||
            !command["commandType"].is<const char*>() ||
            !command["issuedAt"].is<const char*>()) {
            // A malformed individual command entry - skip it rather than
            // crash/guess its fields, but keep processing the rest of an
            // otherwise well-formed response.
            continue;
        }
        CommandDelivery delivery;
        delivery.idempotency_key = command["idempotencyKey"].as<const char*>();
        delivery.command_type = command["commandType"].as<const char*>();
        delivery.issued_at = command["issuedAt"].as<const char*>();
        result.commands.push_back(delivery);
    }

    return result;
}
