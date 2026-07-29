// Host-side (native) unit tests for the hardware-independent actuator
// resolution logic in src/firmware/src/actuators (GitHub issue #24).
//
// Run with: pio test -e native   (from src/firmware/)
//
// These tests intentionally do NOT exercise anything hardware-dependent
// (GPIO digitalWrite) - that lives in
// src/firmware/src/actuators/actuator_driver.cpp and is documented as
// untestable on the host in README.md.

#include <unity.h>

#include "actuator_state.h"

void setUp(void) {}
void tearDown(void) {}

CommandDelivery makeCommand(const std::string& key, const std::string& type) {
    CommandDelivery delivery;
    delivery.idempotency_key = key;
    delivery.command_type = type;
    delivery.issued_at = "2026-07-29T00:00:00Z";
    return delivery;
}

void test_resolve_empty_batch_recognizes_nothing(void) {
    const ApplyCommandsResult result = resolve_commands({});

    TEST_ASSERT_FALSE(result.desired_state.led_recognized);
    TEST_ASSERT_FALSE(result.desired_state.fan_recognized);
    TEST_ASSERT_TRUE(result.applied_idempotency_keys.empty());
    TEST_ASSERT_TRUE(result.unrecognized_idempotency_keys.empty());
}

void test_resolve_single_led_on_command(void) {
    const std::vector<CommandDelivery> commands{makeCommand("k1", "LED_ON")};
    const ApplyCommandsResult result = resolve_commands(commands);

    TEST_ASSERT_TRUE(result.desired_state.led_recognized);
    TEST_ASSERT_TRUE(result.desired_state.led_on);
    TEST_ASSERT_FALSE(result.desired_state.fan_recognized);
    TEST_ASSERT_EQUAL_INT(1, static_cast<int>(result.applied_idempotency_keys.size()));
    TEST_ASSERT_EQUAL_STRING("k1", result.applied_idempotency_keys[0].c_str());
}

void test_resolve_last_command_wins_for_same_actuator(void) {
    // Array order == issued_at ascending per contract; LED_ON then LED_OFF
    // in the same batch must resolve to OFF (most recent instruction wins).
    const std::vector<CommandDelivery> commands{
        makeCommand("k1", "LED_ON"), makeCommand("k2", "LED_OFF")};
    const ApplyCommandsResult result = resolve_commands(commands);

    TEST_ASSERT_TRUE(result.desired_state.led_recognized);
    TEST_ASSERT_FALSE(result.desired_state.led_on);
    TEST_ASSERT_EQUAL_INT(2, static_cast<int>(result.applied_idempotency_keys.size()));
}

void test_resolve_independent_actuators_both_applied(void) {
    const std::vector<CommandDelivery> commands{
        makeCommand("k1", "FAN_ON"), makeCommand("k2", "LED_OFF")};
    const ApplyCommandsResult result = resolve_commands(commands);

    TEST_ASSERT_TRUE(result.desired_state.fan_recognized);
    TEST_ASSERT_TRUE(result.desired_state.fan_on);
    TEST_ASSERT_TRUE(result.desired_state.led_recognized);
    TEST_ASSERT_FALSE(result.desired_state.led_on);
}

void test_resolve_unrecognized_command_is_not_applied_or_acked(void) {
    const std::vector<CommandDelivery> commands{makeCommand("k1", "REBOOT")};
    const ApplyCommandsResult result = resolve_commands(commands);

    TEST_ASSERT_FALSE(result.desired_state.led_recognized);
    TEST_ASSERT_FALSE(result.desired_state.fan_recognized);
    TEST_ASSERT_TRUE(result.applied_idempotency_keys.empty());
    TEST_ASSERT_EQUAL_INT(1,
                           static_cast<int>(result.unrecognized_idempotency_keys.size()));
    TEST_ASSERT_EQUAL_STRING("k1", result.unrecognized_idempotency_keys[0].c_str());
}

void test_resolve_mixed_recognized_and_unrecognized(void) {
    const std::vector<CommandDelivery> commands{
        makeCommand("k1", "FAN_ON"), makeCommand("k2", "UNKNOWN_TYPE")};
    const ApplyCommandsResult result = resolve_commands(commands);

    TEST_ASSERT_TRUE(result.desired_state.fan_recognized);
    TEST_ASSERT_EQUAL_INT(1, static_cast<int>(result.applied_idempotency_keys.size()));
    TEST_ASSERT_EQUAL_STRING("k1", result.applied_idempotency_keys[0].c_str());
    TEST_ASSERT_EQUAL_INT(1,
                           static_cast<int>(result.unrecognized_idempotency_keys.size()));
    TEST_ASSERT_EQUAL_STRING("k2", result.unrecognized_idempotency_keys[0].c_str());
}

int main(int argc, char** argv) {
    UNITY_BEGIN();
    RUN_TEST(test_resolve_empty_batch_recognizes_nothing);
    RUN_TEST(test_resolve_single_led_on_command);
    RUN_TEST(test_resolve_last_command_wins_for_same_actuator);
    RUN_TEST(test_resolve_independent_actuators_both_applied);
    RUN_TEST(test_resolve_unrecognized_command_is_not_applied_or_acked);
    RUN_TEST(test_resolve_mixed_recognized_and_unrecognized);
    return UNITY_END();
}
