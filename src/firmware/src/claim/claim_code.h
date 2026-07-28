#pragma once

#include <string>

// Pure, hardware-independent logic for the ESP32 device claim flow
// (GitHub issue #23, requirements.md 1.6 F1 `claim_device` steps 3-6).
//
// Deliberately free of Arduino/ESP32/WiFi headers so it can be compiled and
// unit tested on the host (see src/firmware/test/test_logic/test_claim.cpp).
// The hardware-dependent side (AP mode, HTTP transport, NVS persistence)
// lives in src/firmware/src/wifi_provisioning and is documented there as
// untestable on the host.
//
// Wire format is the authoritative OpenAPI contract from issue #5
// (src/shared/contracts/openapi.yaml):
//   POST {API_BASE_URL}/devices/claim
//     request  -> DeviceClaimRequest  { code: string, pattern ^[A-Z0-9]{8}$ }
//     "201"    -> DeviceClaimResponse { deviceId: int64, deviceToken: string }
//     "401"/"429" -> Error { ... } (see openapi.yaml components.schemas.Error)

// Validates a claim code against the format documented in the OpenAPI
// contract (`^[A-Z0-9]{8}$`: exactly 8 uppercase alphanumeric characters).
//
// This is a client-side pre-check only - it does NOT replace server-side
// validation, and it is not a lenient/normalizing check. Codes that fail
// this check (wrong length, lowercase, non-alphanumeric, etc.) are never
// sent to the server; there is no fallback that "fixes up" bad input
// (e.g. no silent uppercasing or trimming) so failures are visible to the
// installer rather than hidden.
bool is_valid_claim_code_format(const std::string& code);

// Builds the JSON request body for POST /devices/claim per
// DeviceClaimRequest in the OpenAPI contract.
//
// The caller MUST have already validated `code` with
// is_valid_claim_code_format() - this function does not re-validate,
// trim, or normalize its input.
std::string build_claim_request_payload(const std::string& code);

// Result of parsing the claim_device HTTP response.
struct ClaimResult {
    bool success;
    long long device_id;        // populated iff success (DeviceClaimResponse.deviceId)
    std::string device_token;   // populated iff success (DeviceClaimResponse.deviceToken)
    std::string error_message;  // populated iff !success, for on-device display/logging
};

// Parses the server's response to POST /devices/claim.
//
// `http_status_code` is required (rather than inferring outcome from body
// shape alone) because the OpenAPI contract distinguishes success (201,
// DeviceClaimResponse) from failure (401 malformed/expired/used-up/locked
// code, 429 rate limited; both return the shared Error schema) via HTTP
// status. Any status other than 201, or a 201 body that fails to parse as
// a well-formed DeviceClaimResponse, is treated as failure - there is no
// fallback that fabricates a device_id/device_token from a partial or
// malformed response.
ClaimResult parse_claim_response(int http_status_code,
                                  const std::string& response_body);
