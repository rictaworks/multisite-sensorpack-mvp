#pragma once

#include <string>
#include <vector>

#include "command_mapper.h"
#include "telemetry_protocol.h"

// Pure, hardware-independent resolution of a piggybacked command batch
// (GitHub issue #24, requirements.md 1.6 F5 dispatch_command) into a final
// desired actuator state. Deliberately free of Arduino/ESP32 headers so it
// can be compiled and unit tested on the host (see
// src/firmware/test/test_actuators). The hardware-dependent side (actually
// driving the LED/fan GPIO pins) lives in
// src/firmware/src/actuators/actuator_driver.h and is documented there as
// untestable on the host.

struct ActuatorDesiredState {
    // True iff at least one recognized command in the batch targeted the
    // LED. When false, `led_on` is meaningless and the caller must leave
    // the LED's current physical state untouched (commands are "set to
    // this state", not "reset everything else to off" - there is no
    // implicit reset of actuators the batch didn't mention).
    bool led_recognized;
    bool led_on;
    bool fan_recognized;
    bool fan_on;
};

struct ApplyCommandsResult {
    ActuatorDesiredState desired_state;
    // Idempotency keys of commands that were recognized and folded into
    // desired_state - these are safe to enqueue for ACK on the next
    // telemetry request (see ack_queue.h).
    std::vector<std::string> applied_idempotency_keys;
    // Idempotency keys of commands whose commandType this firmware does not
    // recognize. These are deliberately left un-ACKed and un-actuated
    // (coding-style.md "フォールバック処理を書かない" - we never guess an
    // effect for an unknown command type). An un-ACKed command will expire
    // server-side via its TTL and surface to the user as "届きませんでした"
    // (requirements.md F5.4) rather than silently vanishing.
    std::vector<std::string> unrecognized_idempotency_keys;
};

// Resolves `commands` (already issued_at-ascending, per the server
// contract - at most 5 entries) into a final desired actuator state. When
// multiple commands in the same batch target the same actuator, the last
// one in array order wins ("most recent instruction wins", consistent with
// array order == issued_at ascending).
ApplyCommandsResult resolve_commands(const std::vector<CommandDelivery>& commands);
