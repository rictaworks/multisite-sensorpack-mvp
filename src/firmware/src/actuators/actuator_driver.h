#pragma once

#include "actuator_state.h"

// GPIO-driving side of actuator control (GitHub issue #24). Hardware
// dependent (Arduino digitalWrite against the pin map in config.h, same
// LED_PIN/FAN_RELAY_PIN defined for issue #4's boot self-test) - NOT
// unit-testable on the host. See src/firmware/README.md for what is/isn't
// covered by automated tests, and src/firmware/src/actuators/actuator_state.h
// for the pure logic that decides *what* to drive.

namespace actuators {

// Writes `desired_state` to the physical LED/fan pins. Only actuators the
// batch actually mentioned (led_recognized / fan_recognized) are written;
// an actuator omitted from the current command batch is left at its
// current physical state (no implicit reset - see actuator_state.h).
void apply_desired_state(const ActuatorDesiredState& desired_state);

}  // namespace actuators
