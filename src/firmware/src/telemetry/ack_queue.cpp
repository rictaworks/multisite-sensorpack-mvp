#include "ack_queue.h"

#include <algorithm>

void enqueue_pending_ack(std::vector<std::string>& queue,
                          const std::string& idempotency_key) {
    const bool already_queued =
        std::find(queue.begin(), queue.end(), idempotency_key) != queue.end();
    if (already_queued) {
        return;
    }
    queue.push_back(idempotency_key);
}

void remove_acked(std::vector<std::string>& queue,
                   const std::vector<std::string>& confirmed_keys) {
    queue.erase(
        std::remove_if(queue.begin(), queue.end(),
                        [&confirmed_keys](const std::string& key) {
                            return std::find(confirmed_keys.begin(),
                                              confirmed_keys.end(),
                                              key) != confirmed_keys.end();
                        }),
        queue.end());
}
