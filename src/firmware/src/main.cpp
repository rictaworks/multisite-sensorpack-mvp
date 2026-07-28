// ESP32 sensor pack firmware - scaffold (GitHub issue #4).
//
// Scope: Wi-Fi connect, DHT22 read, and a minimal LED/fan control stub only.
// Device claim (issue #23) and telemetry/command networking + ACK (issue
// #24) are NOT implemented here - see README.md for what is and isn't
// covered by this scaffold.
//
// Pin numbers, Wi-Fi credentials, and the (future) API endpoint are never
// hardcoded here; they come from include/config.h (git-ignored), generated
// by copying include/config.example.h.

#include <Arduino.h>
#include <DHT.h>
#include <WiFi.h>

#include "command_mapper.h"
#include "config.h"
#include "telemetry_format.h"

static DHT dht(DHT_PIN, DHT_SENSOR_TYPE);
static uint32_t g_nextSeq = 0;

static void setActuator(Actuator actuator, bool energized) {
    const int pin = (actuator == Actuator::LED) ? LED_PIN : FAN_RELAY_PIN;
    digitalWrite(pin, energized ? HIGH : LOW);
}

static void connectToWiFi() {
    if (strlen(WIFI_SSID) == 0) {
        // Fail closed: no fallback network, no silently-skipped connection.
        Serial.println(
            "[FATAL] WIFI_SSID is empty. Copy include/config.example.h to "
            "include/config.h and set real Wi-Fi credentials.");
        while (true) {
            delay(1000);
        }
    }

    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    Serial.print("[INFO] Connecting to Wi-Fi");

    const unsigned long startedAt = millis();
    while (WiFi.status() != WL_CONNECTED) {
        if (millis() - startedAt > WIFI_CONNECT_TIMEOUT_MS) {
            Serial.println();
            Serial.println(
                "[ERROR] Wi-Fi connection timed out. Will retry on next "
                "boot cycle; not proceeding with a disconnected radio.");
            return;
        }
        delay(500);
        Serial.print(".");
    }

    Serial.println();
    Serial.print("[INFO] Wi-Fi connected. IP: ");
    Serial.println(WiFi.localIP());
}

// One-shot actuator wiring self-test at boot. This only proves the pin
// config + command_mapper wiring is correct; it is not the real command
// dispatch loop (that arrives with HTTP command polling in issue #24).
static void runActuatorSelfTestOnce() {
    const CommandEffect ledOn = parse_command("LED_ON");
    if (ledOn.recognized) {
        setActuator(ledOn.actuator, ledOn.desired_state);
    }
    delay(200);
    const CommandEffect ledOff = parse_command("LED_OFF");
    if (ledOff.recognized) {
        setActuator(ledOff.actuator, ledOff.desired_state);
    }
}

void setup() {
    Serial.begin(115200);

    pinMode(LED_PIN, OUTPUT);
    pinMode(FAN_RELAY_PIN, OUTPUT);
    // Fail-safe boot state: both actuators OFF until an explicit command
    // says otherwise. No actuator is ever energized by default.
    digitalWrite(LED_PIN, LOW);
    digitalWrite(FAN_RELAY_PIN, LOW);

    dht.begin();
    connectToWiFi();
    runActuatorSelfTestOnce();

    Serial.println(
        "[INFO] Firmware scaffold ready. Claim (#23) and telemetry/command "
        "networking (#24) are implemented in later issues.");
}

void loop() {
    static unsigned long lastReadAt = 0;
    const unsigned long now = millis();

    if (now - lastReadAt < TELEMETRY_INTERVAL_MS) {
        return;
    }
    lastReadAt = now;

    const float humidity = dht.readHumidity();
    const float temperature = dht.readTemperature();

    if (isnan(humidity) || isnan(temperature)) {
        // DHT22 read failures happen (timing-sensitive 1-wire protocol).
        // We log and skip this cycle rather than transmitting/fabricating
        // a substitute value.
        Serial.println(
            "[ERROR] DHT22 read failed (NaN). Skipping this cycle.");
        return;
    }

    if (!is_valid_reading(temperature, humidity)) {
        Serial.println(
            "[ERROR] DHT22 reading outside the documented valid range "
            "(requirements.md F2.4). Discarding sample.");
        return;
    }

    const TelemetryReading reading{DEVICE_TOKEN, g_nextSeq++, temperature,
                                    humidity};
    const std::string payload = format_telemetry_payload(reading);

    // Networking (HTTP POST to the backend, issue #24) is intentionally not
    // implemented yet; we only log what would be sent.
    Serial.print(
        "[DEBUG] Telemetry payload (not transmitted - HTTP wiring is "
        "issue #24): ");
    Serial.println(payload.c_str());
}
