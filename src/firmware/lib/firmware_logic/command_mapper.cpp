#include "command_mapper.h"

CommandEffect parse_command(const std::string& command_type_code) {
    if (command_type_code == "LED_ON") {
        return CommandEffect{true, Actuator::LED, true};
    }
    if (command_type_code == "LED_OFF") {
        return CommandEffect{true, Actuator::LED, false};
    }
    if (command_type_code == "FAN_ON") {
        return CommandEffect{true, Actuator::FAN, true};
    }
    if (command_type_code == "FAN_OFF") {
        return CommandEffect{true, Actuator::FAN, false};
    }
    return CommandEffect{false, Actuator::UNKNOWN, false};
}
