// Host-side (native) unit tests for the hardware-independent claim-flow
// logic in src/firmware/src/claim (GitHub issue #23).
//
// Run with: pio test -e native   (from src/firmware/)
//
// These tests intentionally do NOT exercise anything hardware-dependent
// (AP mode Wi-Fi, the HTTP client, NVS/Preferences persistence) - that part
// cannot be verified on the host. See src/firmware/src/wifi_provisioning
// and README.md for what is and isn't covered by this scaffold.

#include <unity.h>

#include "claim_code.h"

void setUp(void) {}
void tearDown(void) {}

// --- is_valid_claim_code_format -------------------------------------------
// Mirrors the OpenAPI contract pattern (^[A-Z0-9]{8}$, see
// src/shared/contracts/openapi.yaml DeviceClaimRequest.code).

void test_valid_claim_code_accepts_8_uppercase_alnum(void) {
    TEST_ASSERT_TRUE(is_valid_claim_code_format("A1B2C3D4"));
    TEST_ASSERT_TRUE(is_valid_claim_code_format("00000000"));
    TEST_ASSERT_TRUE(is_valid_claim_code_format("ZZZZZZZZ"));
}

void test_valid_claim_code_rejects_wrong_length(void) {
    TEST_ASSERT_FALSE(is_valid_claim_code_format("A1B2C3D"));    // 7 chars
    TEST_ASSERT_FALSE(is_valid_claim_code_format("A1B2C3D45"));  // 9 chars
    TEST_ASSERT_FALSE(is_valid_claim_code_format(""));           // empty
}

void test_valid_claim_code_rejects_lowercase(void) {
    // No silent uppercasing/normalization - lowercase input is rejected,
    // not fixed up.
    TEST_ASSERT_FALSE(is_valid_claim_code_format("a1b2c3d4"));
}

void test_valid_claim_code_rejects_non_alnum(void) {
    TEST_ASSERT_FALSE(is_valid_claim_code_format("A1B2-C3D"));
    TEST_ASSERT_FALSE(is_valid_claim_code_format("A1B2 C3D"));
}

// --- build_claim_request_payload ------------------------------------------

void test_build_claim_request_payload_contains_code_field(void) {
    const std::string payload = build_claim_request_payload("A1B2C3D4");
    TEST_ASSERT_TRUE(payload.find("\"code\":\"A1B2C3D4\"") !=
                      std::string::npos);
}

// --- parse_claim_response ---------------------------------------------------

void test_parse_claim_response_success_201(void) {
    const std::string body =
        "{\"deviceId\":42,\"deviceToken\":\"tok-abc123\"}";
    const ClaimResult result = parse_claim_response(201, body);

    TEST_ASSERT_TRUE(result.success);
    TEST_ASSERT_EQUAL_INT64(42, result.device_id);
    TEST_ASSERT_EQUAL_STRING("tok-abc123", result.device_token.c_str());
}

void test_parse_claim_response_failure_401(void) {
    const std::string body =
        "{\"error\":\"invalid_or_expired_code\",\"message\":\"code not "
        "found\"}";
    const ClaimResult result = parse_claim_response(401, body);

    TEST_ASSERT_FALSE(result.success);
    TEST_ASSERT_TRUE(result.error_message.size() > 0);
}

void test_parse_claim_response_failure_429(void) {
    const ClaimResult result =
        parse_claim_response(429, "{\"error\":\"rate_limited\"}");
    TEST_ASSERT_FALSE(result.success);
}

void test_parse_claim_response_malformed_body_is_failure_not_fallback(void) {
    // A 201 with a body that doesn't actually match DeviceClaimResponse
    // must NOT be treated as success by fabricating a device_id/token.
    const ClaimResult result = parse_claim_response(201, "not json at all");
    TEST_ASSERT_FALSE(result.success);
}

void test_parse_claim_response_missing_fields_is_failure(void) {
    // 201 status but missing the required deviceToken field.
    const ClaimResult result =
        parse_claim_response(201, "{\"deviceId\":42}");
    TEST_ASSERT_FALSE(result.success);
}

int main(int argc, char** argv) {
    UNITY_BEGIN();
    RUN_TEST(test_valid_claim_code_accepts_8_uppercase_alnum);
    RUN_TEST(test_valid_claim_code_rejects_wrong_length);
    RUN_TEST(test_valid_claim_code_rejects_lowercase);
    RUN_TEST(test_valid_claim_code_rejects_non_alnum);
    RUN_TEST(test_build_claim_request_payload_contains_code_field);
    RUN_TEST(test_parse_claim_response_success_201);
    RUN_TEST(test_parse_claim_response_failure_401);
    RUN_TEST(test_parse_claim_response_failure_429);
    RUN_TEST(test_parse_claim_response_malformed_body_is_failure_not_fallback);
    RUN_TEST(test_parse_claim_response_missing_fields_is_failure);
    return UNITY_END();
}
