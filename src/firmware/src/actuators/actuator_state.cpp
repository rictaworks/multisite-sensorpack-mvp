#include "actuator_state.h"

ApplyCommandsResult resolve_commands(const std::vector<CommandDelivery>& commands) {
    ApplyCommandsResult result{};
    result.desired_state = ActuatorDesiredState{false, false, false, false};

    for (const CommandDelivery& command : commands) {
        const CommandEffect effect = parse_command(command.command_type);

        if (!effect.recognized) {
            result.unrecognized_idempotency_keys.push_back(command.idempotency_key);
            continue;
        }

        if (effect.actuator == Actuator::LED) {
            result.desired_state.led_recognized = true;
            result.desired_state.led_on = effect.desired_state;
        } else if (effect.actuator == Actuator::FAN) {
            result.desired_state.fan_recognized = true;
            result.desired_state.fan_on = effect.desired_state;
        }

        result.applied_idempotency_keys.push_back(command.idempotency_key);
    }

    return result;
}
