#pragma once

#include <string>
#include <vector>

// Pure, hardware-independent management of the "pending command ACK" queue
// (GitHub issue #24, requirements.md 1.6 F5.3: "ESP32は実行後、次回テレメト
// リに実行結果ACK（冪等ID）を同梱する").
//
// The queue holds idempotency keys of commands this device has already
// executed locally but has not yet had confirmed-delivered to the server
// (i.e. not yet included in a /telemetry request that received a 200
// response). It is deliberately a plain std::vector<std::string> owned by
// the caller (main.cpp) rather than a class with hidden state, per
// coding-style.md's "グローバル変数を禁止する" - state stays scoped to
// whichever function/owner holds the vector.

// Adds `idempotency_key` to `queue` unless it is already present. Duplicate
// enqueue calls happen naturally (e.g. the same command batch could be
// resolved more than once in edge cases); we avoid growing the queue with
// redundant entries rather than relying on the server's "同一冪等IDの重複
// ACKは無視する" dedup to paper over it.
void enqueue_pending_ack(std::vector<std::string>& queue,
                          const std::string& idempotency_key);

// Removes every key in `confirmed_keys` from `queue`. Used after a
// /telemetry request that carried `confirmed_keys` as commandAcks receives
// a 200 response - only then is delivery confirmed, so keys are never
// dropped speculatively before that (a transport failure leaves the queue
// untouched, so the same keys are retried on the next cycle).
void remove_acked(std::vector<std::string>& queue,
                   const std::vector<std::string>& confirmed_keys);
