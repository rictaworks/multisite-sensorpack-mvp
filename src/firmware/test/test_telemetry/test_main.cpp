// Host-side (native) unit tests for the hardware-independent telemetry
// protocol logic in src/firmware/src/telemetry (GitHub issue #24).
//
// Run with: pio test -e native   (from src/firmware/)
//
// These tests intentionally do NOT exercise anything hardware-dependent
// (Wi-Fi, HTTPClient, retry/backoff timing) - that lives in
// src/firmware/src/telemetry/telemetry_client.cpp and is documented as
// untestable on the host in README.md.

#include <unity.h>

#include "ack_queue.h"
#include "telemetry_protocol.h"

void setUp(void) {}
void tearDown(void) {}

// --- build_telemetry_request_payload ---------------------------------------

void test_build_request_payload_contains_seq_and_readings(void) {
    const TelemetryRequestData data{42, 24.5f, 55.5f, {}};
    const std::string json = build_telemetry_request_payload(data);

    TEST_ASSERT_TRUE(json.find("\"seq\":42") != std::string::npos);
    TEST_ASSERT_TRUE(json.find("\"temperatureC\":24.5") != std::string::npos);
    TEST_ASSERT_TRUE(json.find("\"humidityPct\":55.5") != std::string::npos);
}

void test_build_request_payload_device_reported_at_is_null(void) {
    // No trusted on-device clock - never fabricated (see telemetry_protocol.h).
    const TelemetryRequestData data{1, 20.0f, 40.0f, {}};
    const std::string json = build_telemetry_request_payload(data);

    TEST_ASSERT_TRUE(json.find("\"deviceReportedAt\":null") != std::string::npos);
}

void test_build_request_payload_empty_acks_is_empty_array(void) {
    const TelemetryRequestData data{1, 20.0f, 40.0f, {}};
    const std::string json = build_telemetry_request_payload(data);

    TEST_ASSERT_TRUE(json.find("\"commandAcks\":[]") != std::string::npos);
}

void test_build_request_payload_includes_pending_acks(void) {
    const TelemetryRequestData data{
        1, 20.0f, 40.0f, {"key-aaa", "key-bbb"}};
    const std::string json = build_telemetry_request_payload(data);

    TEST_ASSERT_TRUE(json.find("\"idempotencyKey\":\"key-aaa\"") !=
                      std::string::npos);
    TEST_ASSERT_TRUE(json.find("\"idempotencyKey\":\"key-bbb\"") !=
                      std::string::npos);
}

// --- parse_telemetry_response -----------------------------------------------

void test_parse_response_success_with_commands(void) {
    const std::string body =
        "{\"accepted\":true,\"duplicate\":false,"
        "\"serverTime\":\"2026-07-29T00:00:00Z\","
        "\"commands\":[{\"idempotencyKey\":\"k1\",\"commandType\":\"LED_ON\","
        "\"issuedAt\":\"2026-07-29T00:00:00Z\"}]}";
    const TelemetryResponseResult result = parse_telemetry_response(200, body);

    TEST_ASSERT_TRUE(result.parsed_ok);
    TEST_ASSERT_TRUE(result.accepted);
    TEST_ASSERT_FALSE(result.duplicate);
    TEST_ASSERT_EQUAL_STRING("2026-07-29T00:00:00Z", result.server_time.c_str());
    TEST_ASSERT_EQUAL_INT(1, static_cast<int>(result.commands.size()));
    TEST_ASSERT_EQUAL_STRING("k1", result.commands[0].idempotency_key.c_str());
    TEST_ASSERT_EQUAL_STRING("LED_ON", result.commands[0].command_type.c_str());
}

void test_parse_response_success_no_commands(void) {
    const std::string body =
        "{\"accepted\":true,\"serverTime\":\"2026-07-29T00:00:00Z\","
        "\"commands\":[]}";
    const TelemetryResponseResult result = parse_telemetry_response(200, body);

    TEST_ASSERT_TRUE(result.parsed_ok);
    TEST_ASSERT_TRUE(result.commands.empty());
}

void test_parse_response_accepted_false_is_still_parsed_ok(void) {
    // Value-range rejection/duplicate seq: the contract keeps this a 200
    // with accepted=false, not an HTTP error.
    const std::string body =
        "{\"accepted\":false,\"duplicate\":true,"
        "\"serverTime\":\"2026-07-29T00:00:00Z\",\"commands\":[]}";
    const TelemetryResponseResult result = parse_telemetry_response(200, body);

    TEST_ASSERT_TRUE(result.parsed_ok);
    TEST_ASSERT_FALSE(result.accepted);
    TEST_ASSERT_TRUE(result.duplicate);
}

void test_parse_response_non_200_is_not_parsed_ok(void) {
    const TelemetryResponseResult result =
        parse_telemetry_response(401, "{\"error\":\"invalid_token\"}");

    TEST_ASSERT_FALSE(result.parsed_ok);
    TEST_ASSERT_TRUE(result.commands.empty());
    TEST_ASSERT_TRUE(result.error_message.size() > 0);
}

void test_parse_response_malformed_body_is_not_parsed_ok(void) {
    const TelemetryResponseResult result =
        parse_telemetry_response(200, "not json at all");

    TEST_ASSERT_FALSE(result.parsed_ok);
}

void test_parse_response_missing_required_field_is_not_parsed_ok(void) {
    // Missing "commands" - must not fabricate an empty array for a
    // response that doesn't actually match the contract.
    const std::string body =
        "{\"accepted\":true,\"serverTime\":\"2026-07-29T00:00:00Z\"}";
    const TelemetryResponseResult result = parse_telemetry_response(200, body);

    TEST_ASSERT_FALSE(result.parsed_ok);
}

// --- ack_queue ---------------------------------------------------------------

void test_enqueue_pending_ack_adds_new_key(void) {
    std::vector<std::string> queue;
    enqueue_pending_ack(queue, "key-1");

    TEST_ASSERT_EQUAL_INT(1, static_cast<int>(queue.size()));
    TEST_ASSERT_EQUAL_STRING("key-1", queue[0].c_str());
}

void test_enqueue_pending_ack_dedups(void) {
    std::vector<std::string> queue;
    enqueue_pending_ack(queue, "key-1");
    enqueue_pending_ack(queue, "key-1");

    TEST_ASSERT_EQUAL_INT(1, static_cast<int>(queue.size()));
}

void test_remove_acked_removes_only_confirmed_keys(void) {
    std::vector<std::string> queue{"key-1", "key-2", "key-3"};
    remove_acked(queue, {"key-1", "key-3"});

    TEST_ASSERT_EQUAL_INT(1, static_cast<int>(queue.size()));
    TEST_ASSERT_EQUAL_STRING("key-2", queue[0].c_str());
}

void test_remove_acked_leaves_queue_untouched_when_nothing_confirmed(void) {
    std::vector<std::string> queue{"key-1", "key-2"};
    remove_acked(queue, {"key-does-not-exist"});

    TEST_ASSERT_EQUAL_INT(2, static_cast<int>(queue.size()));
}

int main(int argc, char** argv) {
    UNITY_BEGIN();
    RUN_TEST(test_build_request_payload_contains_seq_and_readings);
    RUN_TEST(test_build_request_payload_device_reported_at_is_null);
    RUN_TEST(test_build_request_payload_empty_acks_is_empty_array);
    RUN_TEST(test_build_request_payload_includes_pending_acks);
    RUN_TEST(test_parse_response_success_with_commands);
    RUN_TEST(test_parse_response_success_no_commands);
    RUN_TEST(test_parse_response_accepted_false_is_still_parsed_ok);
    RUN_TEST(test_parse_response_non_200_is_not_parsed_ok);
    RUN_TEST(test_parse_response_malformed_body_is_not_parsed_ok);
    RUN_TEST(test_parse_response_missing_required_field_is_not_parsed_ok);
    RUN_TEST(test_enqueue_pending_ack_adds_new_key);
    RUN_TEST(test_enqueue_pending_ack_dedups);
    RUN_TEST(test_remove_acked_removes_only_confirmed_keys);
    RUN_TEST(test_remove_acked_leaves_queue_untouched_when_nothing_confirmed);
    return UNITY_END();
}
