// Host-side (native) unit tests for the hardware-independent firmware
// logic in src/firmware/lib/firmware_logic.
//
// Run with: pio test -e native   (from src/firmware/)
//
// These tests intentionally do NOT exercise anything hardware-dependent
// (Wi-Fi association, DHT22 timing, relay/MOSFET switching) - that part
// cannot be verified on the host and is documented as such in README.md.

#include <unity.h>

#include "command_mapper.h"
#include "telemetry_format.h"

void setUp(void) {}
void tearDown(void) {}

void test_valid_reading_within_bounds(void) {
    TEST_ASSERT_TRUE(is_valid_reading(25.0f, 50.0f));
}

void test_valid_reading_at_documented_bounds(void) {
    // requirements.md F2.4: temperature -40..85 C, humidity 0..100 %.
    // Boundaries themselves are valid (only strictly-outside is rejected).
    TEST_ASSERT_TRUE(is_valid_reading(-40.0f, 0.0f));
    TEST_ASSERT_TRUE(is_valid_reading(85.0f, 100.0f));
}

void test_invalid_reading_out_of_range(void) {
    TEST_ASSERT_FALSE(is_valid_reading(-40.1f, 50.0f));
    TEST_ASSERT_FALSE(is_valid_reading(85.1f, 50.0f));
    TEST_ASSERT_FALSE(is_valid_reading(25.0f, -0.1f));
    TEST_ASSERT_FALSE(is_valid_reading(25.0f, 100.1f));
}

void test_format_telemetry_payload_contains_expected_fields(void) {
    const TelemetryReading reading{"tok123", 42, 24.5f, 55.5f};
    const std::string json = format_telemetry_payload(reading);

    TEST_ASSERT_TRUE(json.find("\"device_token\":\"tok123\"") !=
                      std::string::npos);
    TEST_ASSERT_TRUE(json.find("\"seq\":42") != std::string::npos);
}

void test_parse_command_led_on(void) {
    const CommandEffect effect = parse_command("LED_ON");
    TEST_ASSERT_TRUE(effect.recognized);
    TEST_ASSERT_TRUE(effect.actuator == Actuator::LED);
    TEST_ASSERT_TRUE(effect.desired_state);
}

void test_parse_command_fan_off(void) {
    const CommandEffect effect = parse_command("FAN_OFF");
    TEST_ASSERT_TRUE(effect.recognized);
    TEST_ASSERT_TRUE(effect.actuator == Actuator::FAN);
    TEST_ASSERT_FALSE(effect.desired_state);
}

void test_parse_command_unknown_is_not_recognized(void) {
    const CommandEffect effect = parse_command("REBOOT");
    TEST_ASSERT_FALSE(effect.recognized);
    TEST_ASSERT_TRUE(effect.actuator == Actuator::UNKNOWN);
}

int main(int argc, char** argv) {
    UNITY_BEGIN();
    RUN_TEST(test_valid_reading_within_bounds);
    RUN_TEST(test_valid_reading_at_documented_bounds);
    RUN_TEST(test_invalid_reading_out_of_range);
    RUN_TEST(test_format_telemetry_payload_contains_expected_fields);
    RUN_TEST(test_parse_command_led_on);
    RUN_TEST(test_parse_command_fan_off);
    RUN_TEST(test_parse_command_unknown_is_not_recognized);
    return UNITY_END();
}
