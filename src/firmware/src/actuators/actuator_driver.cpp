#include "actuator_driver.h"

#include <Arduino.h>

#include "config.h"

namespace actuators {

void apply_desired_state(const ActuatorDesiredState& desired_state) {
    if (desired_state.led_recognized) {
        digitalWrite(LED_PIN, desired_state.led_on ? HIGH : LOW);
        Serial.print("[INFO] LED set to ");
        Serial.println(desired_state.led_on ? "ON" : "OFF");
    }

    if (desired_state.fan_recognized) {
        digitalWrite(FAN_RELAY_PIN, desired_state.fan_on ? HIGH : LOW);
        Serial.print("[INFO] Fan set to ");
        Serial.println(desired_state.fan_on ? "ON" : "OFF");
    }
}

}  // namespace actuators
