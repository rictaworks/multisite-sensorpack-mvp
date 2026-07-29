#pragma once

#include <string>

#include "telemetry_protocol.h"

// HTTP transport side of the telemetry/command cycle (GitHub issue #24,
// requirements.md 1.6 F2/F5). Hardware dependent (Arduino WiFi/HTTPClient) -
// NOT unit-testable on the host, same as src/wifi_provisioning's claim
// submission (issue #23). See src/firmware/README.md for what is/isn't
// covered by automated tests, and telemetry_protocol.h for the pure
// request/response logic this module orchestrates around.

namespace telemetry {

struct TelemetryCycleResult {
    // True iff an HTTP response was actually received from the server
    // (any status code). False covers both "Wi-Fi is not currently
    // connected" (skipped without attempting a request - the offline
    // basic-behavior case) and "every retry attempt failed at the
    // transport layer" (timeout/DNS/connection refused/TLS handshake
    // failure). In both false cases, `response` is default-constructed and
    // must not be used - the caller must not execute commands, must not
    // drain the ack queue, and simply retries on the next scheduled
    // TELEMETRY_INTERVAL_MS tick.
    bool transport_ok;
    TelemetryResponseResult response;
};

// Sends one telemetry cycle: builds the request from `data`, POSTs it to
// {API_BASE_URL}/telemetry with `Authorization: Bearer <device_token>`
// (deviceBearerToken security scheme, src/shared/contracts/openapi.yaml),
// retrying up to TELEMETRY_HTTP_MAX_ATTEMPTS times (config.h) on
// transport-level failure with TELEMETRY_HTTP_RETRY_DELAY_MS between
// attempts. A definitive HTTP error response (any status the server
// actually answered with) is never retried - retrying an unchanged request
// would just repeat the same rejection.
TelemetryCycleResult send_telemetry(const std::string& device_token,
                                     const TelemetryRequestData& data);

}  // namespace telemetry
