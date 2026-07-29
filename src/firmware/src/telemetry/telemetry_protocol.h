#pragma once

#include <cstdint>
#include <string>
#include <vector>

// Pure, hardware-independent wire-format logic for the telemetry/command
// piggyback cycle (GitHub issue #24, requirements.md 1.6 F2 ingest_telemetry
// / F5 dispatch_command). Deliberately free of Arduino/ESP32/HTTP headers so
// it can be compiled and unit tested on the host (see
// src/firmware/test/test_telemetry).
//
// Wire format is the authoritative OpenAPI contract from issue #5
// (src/shared/contracts/openapi.yaml):
//   POST {API_BASE_URL}/telemetry   (Authorization: Bearer <device_token>)
//     request  -> TelemetryIngestRequest
//       { seq: int, temperatureC: number, humidityPct: number,
//         deviceReportedAt: string|null, commandAcks: [{idempotencyKey}] }
//     "200"    -> TelemetryIngestResponse
//       { accepted: bool, duplicate: bool, serverTime: string,
//         commands: [{idempotencyKey, commandType, issuedAt}] (max 5) }
//     "400"/"401"/"410" -> Error { ... } (see openapi.yaml components.schemas.Error)
//
// The hardware-dependent side (Wi-Fi/HTTPClient transport, retry
// orchestration) lives in src/firmware/src/telemetry/telemetry_client.h and
// is documented there as untestable on the host.

struct TelemetryRequestData {
    uint32_t seq;
    float temperature_c;
    float humidity_pct;
    // Idempotency keys of commands already executed locally but not yet
    // confirmed-ACKed to the server (requirements.md F5.3). The caller owns
    // the queue this snapshot came from - see ack_queue.h. There is no
    // client-side "deviceReportedAt" wall-clock timestamp populated here:
    // the firmware has no trusted/synchronized clock, and the contract
    // treats this field as reference-only (server receive time is
    // authoritative), so we deliberately send null rather than fabricate a
    // value from an unsynchronized millis()-derived clock.
    std::vector<std::string> pending_command_acks;
};

// Builds the /telemetry POST body as a JSON string per
// TelemetryIngestRequest above.
std::string build_telemetry_request_payload(const TelemetryRequestData& data);

// One command piggybacked in a TelemetryIngestResponse.
struct CommandDelivery {
    std::string idempotency_key;
    std::string command_type;
    std::string issued_at;
};

struct TelemetryResponseResult {
    // False when the HTTP status was not 200, or the 200 body did not
    // parse as a well-formed TelemetryIngestResponse. Callers MUST NOT act
    // on `commands` or treat `accepted`/`duplicate` as meaningful unless
    // this is true - there is no fallback that fabricates a response from
    // a status/body we could not fully understand (fail closed).
    bool parsed_ok;
    bool accepted;
    bool duplicate;
    std::string server_time;
    // Piggybacked commands, in the array order the server sent them
    // (issued_at ascending per contract, at most 5). Empty when
    // !parsed_ok.
    std::vector<CommandDelivery> commands;
    // Populated iff !parsed_ok, for on-device logging.
    std::string error_message;
};

// Parses the server's response to POST /telemetry.
//
// `http_status_code` is required (rather than inferring outcome from body
// shape alone) because the OpenAPI contract distinguishes success (200,
// TelemetryIngestResponse, even when accepted=false/duplicate=true for a
// rejected/deduplicated sample) from failure (400/401/410, shared Error
// schema) via HTTP status.
TelemetryResponseResult parse_telemetry_response(int http_status_code,
                                                  const std::string& response_body);
