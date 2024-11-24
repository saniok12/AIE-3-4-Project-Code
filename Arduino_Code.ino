#include <TinyGPSPlus.h>       // TinyGPS++ library for parsing GPS data
#include <HardwareSerial.h>    // Access to hardware UART capabilities of ESP32
#include <lmic.h>              // LMIC library for LoRaWAN communication
#include <hal/hal.h>           // Hardware Abstraction Layer for LMIC
#include <SPI.h>               // SPI library

TinyGPSPlus gps;              // Instance of TinyGPSPlus
HardwareSerial ss(1);         // UART1 on ESP32

// LoRaWAN credentials
static const u1_t PROGMEM DEVEUI[8] = { 0x3E, 0xC3, 0x06, 0xD0, 0x7E, 0xD5, 0xB3, 0x70 };
static const u1_t PROGMEM APPEUI[8] = { 0xEF, 0xCD, 0xAB, 0x90, 0x78, 0x56, 0x34, 0x12 };
static const u1_t PROGMEM APPKEY[16] = { 0x6F, 0x6C, 0x01, 0x52, 0x04, 0xAD, 0x40, 0x54, 0xEF, 0x73, 0x03, 0xC3, 0x89, 0x9E, 0xEB, 0xF5 };

// Pin mapping for ESP32 with SX1276
const lmic_pinmap lmic_pins = {
    .nss = 5,       // LORA_CS
    .rxtx = LMIC_UNUSED_PIN,
    .rst = 14,      // LORA_RST
    .dio = {26, 33, 32}  // LORA_IRQ and others
};

void os_getArtEui(u1_t* buf) { memcpy_P(buf, APPEUI, 8); }
void os_getDevEui(u1_t* buf) { memcpy_P(buf, DEVEUI, 8); }
void os_getDevKey(u1_t* buf) { memcpy_P(buf, APPKEY, 16); }

void onEvent (ev_t ev) {
    switch(ev) {
        case EV_JOINING:
            Serial.println(F("EV_JOINING"));
            break;
        case EV_JOINED:
            Serial.println(F("EV_JOINED"));
            LMIC_setLinkCheckMode(0);
            break;
        case EV_TXCOMPLETE:
            Serial.println(F("EV_TXCOMPLETE"));
            if (LMIC.txrxFlags & TXRX_ACK) {
                Serial.println(F("Received ACK"));
            }
            if (LMIC.dataLen) {
                Serial.print(F("Received "));
                Serial.print(LMIC.dataLen);
                Serial.println(F(" bytes of payload"));
            }
            break;
        default:
            break;
    }
}

void setup() {
    Serial.begin(9600);                  // Initialize Serial Monitor
    ss.begin(9600, SERIAL_8N1, 16, 17);  // Initialize UART1 (TX=17, RX=16)

    os_init();      // Initialize LMIC
    LMIC_reset();   // Reset the MAC state

    LMIC_setClockError(MAX_CLOCK_ERROR * 1 / 100);  // Adjust for clock error

    LMIC_startJoining();  // Start joining process

    // Configure channels according to the Europe 863-870 MHz frequency plan
    LMIC_setupChannel(0, 868100000, DR_RANGE_MAP(DR_SF12, DR_SF7), BAND_CENTI);
    LMIC_setupChannel(1, 868300000, DR_RANGE_MAP(DR_SF12, DR_SF7), BAND_CENTI);
    LMIC_setupChannel(2, 868500000, DR_RANGE_MAP(DR_SF12, DR_SF7), BAND_CENTI);
    // Additional channels can be configured here

    LMIC.dn2Dr = DR_SF12;  // Set RX2 window data rate to SF12

    LMIC_setDrTxpow(DR_SF7, 14);  // Set data rate and transmit power

    Serial.println("Setup complete.");
}

void loop() {
    os_runloop_once();  // Run the LMIC loop

    static unsigned long lastTransmission = 0;

    // Check if device has joined the network
    if (LMIC.devaddr == 0) {
        // Not joined yet
        return;
    }

    // Check if a transmission is pending
    if (LMIC.opmode & OP_TXRXPEND) {
        return;
    }

    // Send data every 30 seconds
    if (millis() - lastTransmission > 30000) {
        while (ss.available() > 0) {
            gps.encode(ss.read());
        }

        if (gps.location.isValid()) {
            float latitude = gps.location.lat();
            float longitude = gps.location.lng();

            // Convert latitude and longitude to 3-byte signed integers (1e-5 degrees)
            int32_t lat = (int32_t)(latitude * 1e5);
            int32_t lon = (int32_t)(longitude * 1e5);

            uint8_t payload[6];
            payload[0] = (lat >> 16) & 0xFF;
            payload[1] = (lat >> 8) & 0xFF;
            payload[2] = lat & 0xFF;
            payload[3] = (lon >> 16) & 0xFF;
            payload[4] = (lon >> 8) & 0xFF;
            payload[5] = lon & 0xFF;

            LMIC_setTxData2(1, payload, sizeof(payload), 0);  // Schedule transmission
            Serial.println("Packet queued");

            lastTransmission = millis();
        } else {
            Serial.println("Waiting for GPS fix...");
            lastTransmission = millis();
        }
    }
}
