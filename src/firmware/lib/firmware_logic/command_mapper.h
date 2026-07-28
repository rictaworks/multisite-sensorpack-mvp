#pragma once

#include <string>

// Which physical actuator a command targets.
enum class Actuator {
    LED,
    FAN,
    UNKNOWN
};

struct CommandEffect {
    bool recognized;
    Actuator actuator;
    bool desired_state;  // true = energize/ON, false = de-energize/OFF
};

// Maps a command_type_code (requirements.md 1.7 COMMAND_TYPES master data:
// LED_ON, LED_OFF, FAN_ON, FAN_OFF - 4 values total) to an actuator effect.
//
// Unrecognized codes return recognized=false with actuator=UNKNOWN. Callers
// MUST NOT act on an unrecognized command - there is no default/fallback
// actuation for codes this firmware doesn't know about.
CommandEffect parse_command(const std::string& command_type_code);
