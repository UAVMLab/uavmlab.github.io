# TECHNICAL PASSPORT
## UAVMLab — UAV Propulsion System Test Stand

---

| | |
|---|---|
| **Organization** | Sintez LLC |
| **Product Name** | UAVMLab — UAV Propulsion System Test Stand |
| **Designation** | TS-UAVMLab |
| **Document Number** | TP-UAVMLab-001 |
| **Firmware Version** | 0.0.1 |
| **Software (App) Version** | 0.0.1 |
| **Date of Issue** | 2026-05-30 |
| **Standard** | GOST 2.601-2019 (Operational Documents) |
| **Language** | English |

---

## TABLE OF CONTENTS

1. [Purpose and Scope](#1-purpose-and-scope)
2. [General Technical Characteristics](#2-general-technical-characteristics)
3. [System Composition](#3-system-composition)
4. [Measurement Channels and Metrological Characteristics](#4-measurement-channels-and-metrological-characteristics)
5. [Control and Communication Interface](#5-control-and-communication-interface)
6. [Software Description](#6-software-description)
7. [Electrical and Power Characteristics](#7-electrical-and-power-characteristics)
8. [Operating Conditions](#8-operating-conditions)
9. [Safety Requirements](#9-safety-requirements)
10. [Wiring and Connection Diagram](#10-wiring-and-connection-diagram)
11. [Configuration and Profile System](#11-configuration-and-profile-system)
12. [Calibration Procedures](#12-calibration-procedures)
13. [Maintenance and Service](#13-maintenance-and-service)
14. [Storage and Transportation](#14-storage-and-transportation)
15. [Completeness of Delivery](#15-completeness-of-delivery)
16. [Acceptance Certificate](#16-acceptance-certificate)
17. [Warranty Obligations](#17-warranty-obligations)

---

## 1. PURPOSE AND SCOPE

**UAVMLab** is a portable, instrumented test stand designed for the research, development, and characterization of UAV (unmanned aerial vehicle) propulsion systems. The stand enables automated and manual measurement of thrust, electrical power parameters, rotational speed, and thermal conditions of a motor–propeller–ESC assembly under controlled conditions.

### 1.1 Intended Application

- Aerodynamic and electromechanical characterization of brushless DC motors and propellers for UAV applications.
- ESC performance evaluation and efficiency mapping.
- Battery system characterization under propulsion loads.
- R&D of propulsion units at any voltage from 3S (≈11.1 V) to 16S (≈67.2 V) LiPo.

### 1.2 Operating Principle

The test stand mounts a motor on a rigid frame above a miniature load cell that measures reaction thrust. A microcontroller unit (MCU) sends throttle commands to the ESC via the **DShot600** digital protocol and simultaneously reads ESC telemetry via the **KISS Telemetry** protocol (UART). An IR thermometer module monitors motor winding temperature without contact. All measured data are streamed wirelessly via **Bluetooth Low Energy (BLE)** to a companion web application running on any modern smartphone or tablet, which provides real-time visualization, profile management, and test automation.

### 1.3 Scope of Application

| Parameter | Value |
|---|---|
| Motor type | Brushless DC (BLDC), outrunner or inrunner |
| ESC compatibility | Any ESC supporting DShot600 digital protocol with KISS Telemetry output |
| Standard supplied ESC | BLHeli32, 16S, 100 A (replaceable by user) |
| Propeller diameter | Limited by physical frame geometry; typically ≤ 28 in |
| Supply voltage range | 11.1 V – 67.2 V (3S – 16S LiPo) |

---

## 2. GENERAL TECHNICAL CHARACTERISTICS

### 2.1 Dimensional and Mass Characteristics

| Parameter | Value |
|---|---|
| Overall dimensions (L × W × H) | 279 × 279 × 406 mm (11 × 11 × 16 in) |
| Mass of stand (without motor, propeller, battery) | ≈ 2.0 kg |

### 2.2 Performance Characteristics

| Parameter | Value |
|---|---|
| Thrust measurement range | 0 – 50 kg (490 N) |
| Motor voltage measurement range | 0 – 100 V (via ESC KISS telemetry) |
| Motor current measurement range | 0 – 300 A (via ESC KISS telemetry) |
| Motor power measurement range | 0 – 30 000 W (derived) |
| RPM measurement range | 0 – 500 000 RPM (via ESC eRPM) |
| ESC temperature measurement range | 0 – 255 °C (via KISS telemetry) |
| Motor winding temperature range | −70 °C to +380 °C (GY-906 IR sensor) |
| Telemetry update rate | ≈ 500 Hz (2 ms cycle) |
| Thrust sensor sampling rate | 80 Hz (HX711 ADC) |

### 2.3 Control Interface

| Parameter | Value |
|---|---|
| Wireless protocol | Bluetooth Low Energy (BLE) 5.0 |
| BLE profile | Nordic UART Service (NUS) over custom GATT |
| Host device requirement | Browser supporting Web Bluetooth API (Chrome/Edge on Android, Windows, Linux, macOS) |
| ESC command protocol | DShot600 (digital, bidirectional) |
| ESC telemetry protocol | KISS Telemetry (UART, 115 200 baud) |

---

## 3. SYSTEM COMPOSITION

The stand consists of three subsystems: **mechanical frame**, **electronic measurement and control unit (ECU)**, and **host software**.

### 3.1 Mechanical Frame

| Item | Description |
|---|---|
| Motor mounting plate | Rigid plate for attachment of motor under test |
| Load cell mounting bracket | Precision bracket for axial alignment of load cell |
| Frame body | Structural assembly, houses all electronics |
| ESC mounting area | Ventilated cavity for ESC under test |
| Cable management | Internal routing for power and signal cables |

### 3.2 Electronic Measurement and Control Unit (ECU)

| No. | Component | Model / Description | Qty |
|---|---|---|---|
| 1 | Microcontroller module | ESP32 NodeMCU-32S (Xtensa LX6 dual-core, 240 MHz, 4 MB Flash, 520 KB SRAM) | 1 |
| 2 | Thrust (force) sensor | QLSensor Miniature Load Cell, 50 kg capacity | 1 |
| 3 | Load cell amplifier/ADC | HX711, 24-bit, 80 Hz sampling | 1 |
| 4 | Motor temperature sensor | GY-906 module (Melexis MLX90614ESF), IR thermometer | 1 |
| 5 | Electronic Speed Controller (default) | BLHeli32, 16S (max 67.2 V), 100 A continuous | 1 |
| 6 | Power distribution / wiring | XT90 / XT150 connectors, high-current wiring | — |

> **Note on ESC interchangeability**: The ECU interfaces with any ESC that supports the **DShot600** protocol for motor control and the **KISS Telemetry** protocol for data output. The BLHeli32 16S 100 A ESC is the standard supplied unit; users may substitute any compatible ESC according to their test requirements.

### 3.3 Host Software

| Component | Description |
|---|---|
| **Firmware** | C++ / Arduino framework (PlatformIO), FreeRTOS RTOS, NimBLE BLE stack. Runs on ECU. |
| **Companion Web Application** | Progressive Web App (PWA), served from `uavmlab.github.io`. Runs in a Web Bluetooth-compatible browser on any OS. No installation required. |

---

## 4. MEASUREMENT CHANNELS AND METROLOGICAL CHARACTERISTICS

### 4.1 Channel 1 — Thrust Force

| Parameter | Value |
|---|---|
| Sensor | QLSensor Miniature Load Cell, 50 kg |
| Transduction principle | Strain gauge, Wheatstone bridge |
| Amplifier/ADC | HX711 24-bit ADC |
| Gain setting | 128× (channel A) |
| ADC resolution | 24 bit |
| Output unit | Grams (g), converted to kg in application |
| Measurement range | 0 – 50 000 g (0 – 50 kg / 0 – 490 N) |
| Sampling rate | 80 Hz |
| Tare (zero) function | Automatic on power-up; manual via BLE command |
| Communication to MCU | Two-wire bit-bang (DOUT on GPIO 4, SCK on GPIO 2) |
| Load cell sensitivity | 2 mV/V (typical for strain-gauge miniature type) |
| Safe overload | 150% of rated capacity |

### 4.2 Channel 2 — Motor Winding Temperature

| Parameter | Value |
|---|---|
| Sensor module | GY-906 (Melexis MLX90614ESF) |
| Measurement principle | Infrared (IR) thermopile, non-contact |
| Communication to MCU | I²C (SMBus), 100 kHz; SDA GPIO 21, SCL GPIO 22 |
| I²C address | 0x5A (7-bit) |
| Object temperature range | −70 °C to +380 °C |
| Ambient temperature range | −40 °C to +125 °C |
| Resolution | 0.02 °C |
| Accuracy (0–50 °C object) | ±0.5 °C |
| Accuracy (wider range) | ±1 °C |
| Field of view | 90° (half-angle) |
| Recommended mounting distance | 5 – 20 mm from motor stator surface |
| Emissivity assumption | 1.0 (factory); 0.90–0.95 recommended for anodized/painted motors |
| Register read | TOBJ1 (0x07); formula: T(°C) = raw × 0.02 − 273.15 |
| Update rate | Every 2 ms (500 Hz aggregation loop) |

### 4.3 Channel 3 — Motor Voltage

| Parameter | Value |
|---|---|
| Source | KISS Telemetry from ESC |
| UART parameters | UART2, RX GPIO 16, 115 200 baud, 8N1 |
| Packet field | Bytes 1–2 (16-bit big-endian), unit: V × 100 |
| Resolution | 0.01 V |
| Measurement range | 0 – 655.35 V (hardware; practical: 0 – 100 V for 16S) |
| Update rate | ≈ 500 Hz |

### 4.4 Channel 4 — Motor Current

| Parameter | Value |
|---|---|
| Source | KISS Telemetry from ESC |
| Packet field | Bytes 3–4 (16-bit big-endian), unit: A × 100 |
| Resolution | 0.01 A |
| Measurement range | 0 – 655.35 A (hardware; practical: 0 – 300 A for 100 A ESC) |
| Update rate | ≈ 500 Hz |

### 4.5 Channel 5 — Motor Electrical Power

| Parameter | Value |
|---|---|
| Source | KISS Telemetry from ESC |
| Packet field | Bytes 5–6 (16-bit big-endian), unit: W |
| Measurement range | 0 – 65 535 W |
| Update rate | ≈ 500 Hz |
| Note | Also derivable as P = U × I from channels 3 & 4 |

### 4.6 Channel 6 — Motor RPM

| Parameter | Value |
|---|---|
| Source | KISS Telemetry from ESC |
| Packet field | Bytes 7–8 (16-bit big-endian), unit: eRPM ÷ 100 |
| Conversion formula | RPM = (eRPM × 200) ÷ motor_pole_count |
| Pole count | User-defined in active profile (default: must be set before arming) |
| Measurement range | 0 – 500 000 RPM (application display limit) |
| Update rate | ≈ 500 Hz |

### 4.7 Channel 7 — ESC Temperature

| Parameter | Value |
|---|---|
| Source | KISS Telemetry from ESC |
| Packet field | Byte 0 (uint8), unit: °C |
| Measurement range | 0 – 255 °C |
| Update rate | ≈ 500 Hz |

### 4.8 KISS Telemetry Protocol Details

| Parameter | Value |
|---|---|
| Packet length | 10 bytes |
| Integrity check | CRC-8 (polynomial 0x07) over first 9 bytes |
| UART interface | UART2, RX-only, GPIO 16, 115 200 baud |
| Telemetry timeout | 2 000 ms; status flag cleared on timeout |
| CRC fault tolerance | Up to 100 consecutive mismatches before marking telemetry lost |

**Packet map:**

| Byte(s) | Field | Unit |
|---|---|---|
| 0 | ESC Temperature | °C |
| 1–2 | Motor Voltage | V × 100 (big-endian) |
| 3–4 | Motor Current | A × 100 (big-endian) |
| 5–6 | Motor Power | W (big-endian) |
| 7–8 | Motor eRPM ÷ 100 | — (big-endian) |
| 9 | CRC-8 | — |

---

## 5. CONTROL AND COMMUNICATION INTERFACE

### 5.1 BLE Architecture

The ECU acts as a BLE **peripheral** (server). The companion app acts as a BLE **central** (client).

| GATT Element | UUID | Direction | Purpose |
|---|---|---|---|
| **Main Service** (Nordic UART) | `6E400001-B5A3-F393-E0A9-E50E24DCCA9E` | — | Primary data channel |
| RX Characteristic | `6E400002-B5A3-F393-E0A9-E50E24DCCA9E` | App → ECU (Write) | Commands to device |
| TX Characteristic | `6E400003-B5A3-F393-E0A9-E50E24DCCA9E` | ECU → App (Notify) | Telemetry to app |
| **Discovery Service** | `F0E00001-7A2C-4E9B-A5CF-2B1A9D5ED001` | — | Device identification |
| Info Characteristic | `F0E00002-7A2C-4E9B-A5CF-2B1A9D5ED001` | Read-only | Device name / ID |

**Advertised device name format**: `UAVMLab.<DeviceID>` (e.g., `UAVMLab.Sintez`)

### 5.2 Telemetry Message Format (JSON over BLE NOTIFY)

All BLE messages are UTF-8 encoded JSON strings.

**Live data frame** (sent at ≈ 500 Hz during active session):

```json
{
  "type": "data",
  "voltage":    <float, V>,
  "current":    <float, A>,
  "power":      <float, W>,
  "rpm":        <uint32, RPM>,
  "thrust":     <float, g>,
  "escTemp":    <float, °C>,
  "motorTemp":  <float, °C>,
  "status":     <uint32, bitmask>,
  "throttle":   <uint16, DShot value 48–2047>
}
```

**Additional message types:**

| `type` field | Direction | Content |
|---|---|---|
| `status` | ECU → App | System status bitmask |
| `version` | ECU → App | Firmware version string |
| `profiles` | ECU → App | Comma-separated list of saved profile names |
| `profile` | ECU ↔ App | Full profile parameter object (read or write) |
| `cur_profile` | ECU → App | Currently active profile object |

### 5.3 DShot600 Motor Control

| Parameter | Value |
|---|---|
| Protocol | DShot600 (bidirectional digital, single-wire) |
| GPIO | 14 (via ESP32 RMT peripheral) |
| Throttle range (DShot) | 48 (stop/off) – 2047 (full throttle) |
| User throttle input | 0 – 100 % → mapped to DShot 48 – 2047 |
| Arm duration | 2 000 ms (zero-throttle frames sent before first spin) |
| Command send rate | 200 Hz (5 ms interval) during control |
| Special commands supported | SPIN_DIRECTION_1 (normal), SPIN_DIRECTION_2 (reversed) |

---

## 6. SOFTWARE DESCRIPTION

### 6.1 Firmware

| Attribute | Value |
|---|---|
| Version | 0.0.1 |
| Language / Framework | C++17, Arduino framework (PlatformIO) |
| RTOS | FreeRTOS (ESP-IDF integrated) |
| BLE stack | NimBLE (Bluedroid disabled) |
| Build system | PlatformIO |
| Target board | espressif32 NodeMCU-32S |

**FreeRTOS Task Architecture:**

| Task | CPU Core | Priority | Stack | Rate |
|---|---|---|---|---|
| DShot Motor Control | Core 1 | 15 | 4 096 B | 5 ms per command; 2 000 ms arm sequence |
| KISS Telemetry RX | Core 1 | 14 | 4 096 B | 2 ms (500 Hz) |
| Sensor Update (HX711 + GY-906) | Core 1 | 13 | 4 096 B | 2 ms (500 Hz) |
| BLE RX Command Dispatcher | Core 0 | 12 | 4 096 B | Event-driven |
| BLE TX Telemetry Broadcaster | Core 0 | 12 | 4 096 B | 2 ms (500 Hz) |

**NVS (Non-Volatile Storage) layout:**

| Namespace | Key | Content |
|---|---|---|
| `USR_PRFS` | `PRF_LST` | Comma-separated list of profile names |
| `USR_PRFS` | `LAST_USD_PRF` | Name of last-used profile |
| `USR_PRFS` | `<profile_name>` | Serialized profile struct |

Maximum profiles storable: **10**.

### 6.2 System Status Bitmask (32-bit)

| Bit | Flag Name | Meaning |
|---|---|---|
| 0 | `USR_CFG_PROF_OK` | User profile loaded and valid |
| 1 | `DSHOT_OK` | DShot peripheral initialized |
| 2 | `KISS_TELEM_OK` | KISS telemetry UART initialized |
| 3 | `HX711_OK` | Load cell ADC initialized |
| 4 | `GY906_SENSOR_OK` | IR temperature sensor detected on I²C |
| 5 | `DSHOT_TASK_RUNNING` | DShot control task active |
| 6 | `KISS_TELEM_TASK_RUNNING` | KISS RX task active |
| 7 | `SENSOR_TASK_RUNNING` | Sensor aggregation task active |
| 8 | `MOTOR_ARMED` | Motor is armed and ready to spin |
| 9 | `MOTOR_SPINNING` | Motor RPM > 10 |
| 10 | `DSHOT_SEND_OK` | Last DShot command sent successfully |
| 11 | `KISS_TELEM_READ_OK` | Last KISS packet CRC valid |
| 12 | `HX711_TARE_OK` | Load cell tare completed |
| 13 | `HX711_READ_OK` | Load cell reading valid |
| 14 | `GY906_SENSOR_READ_OK` | IR temperature reading valid and in range |
| 15 | `WARN_BATTERY_LOW` | Supply voltage below threshold |
| 16 | `WARN_ESC_OVERHEAT` | ESC temperature above profile limit |
| 17 | `WARN_MOTOR_OVERHEAT` | Motor temperature above profile limit |
| 18 | `WARN_OVER_CURRENT` | Current above profile limit |
| 19 | `WARN_OVER_RPM` | RPM above profile limit |
| 20 | `WARN_OVER_THRUST` | Thrust above profile limit |
| 21 | `WARN_FULL_USR_CFG_PRFLS` | Profile storage full (10 profiles reached) |

### 6.3 Companion Web Application

| Attribute | Value |
|---|---|
| Version | 0.0.1 |
| Type | Progressive Web App (PWA) |
| Hosting | GitHub Pages (`uavmlab.github.io`) |
| Browser requirement | Chrome / Edge (Web Bluetooth API required) |
| Operating systems | Android 10+, Windows 10+, Linux, macOS 12+ |

**Application Tabs:**

| Tab | Function |
|---|---|
| **Connection** | BLE device discovery, connect/disconnect, device ID configuration, signal strength (RSSI) display |
| **Control** | Live telemetry display, throttle slider (0–100%), slide-to-arm safety interlock, disarm button, test mode selector, test duration input, run/stop test |
| **Analyze** | Post-test data visualization and analysis results |
| **Navigation** | GPS/waypoint-style test navigation (future) |
| **Profiles** | Create, load, edit, delete motor/propeller/ESC configuration profiles |
| **Logs** | Real-time and historical raw telemetry log viewer (max 5 000 lines) |
| **Results** | Saved test result summaries |

---

## 7. ELECTRICAL AND POWER CHARACTERISTICS

### 7.1 ECU Power Supply

| Parameter | Value |
|---|---|
| ECU logic supply | 5 V USB or onboard 3.3 V regulator (from main bus via BEC/UBEC) |
| MCU operating voltage | 3.3 V |
| MCU quiescent current | ≈ 80 mA (BLE active, all sensors running) |

### 7.2 Motor Power Circuit

| Parameter | Value |
|---|---|
| Input supply voltage range | 11.1 V – 67.2 V (3S – 16S LiPo) |
| Compatible ESC maximum continuous current | As per installed ESC (standard: 100 A) |
| ESC burst current (standard) | 120 A (BLHeli32 16S) |
| Recommended main power connector | XT90 / XT150 (user-selected per cell count and current) |
| Battery cell chemistry | LiPo (primary); LiHV compatible |
| Minimum discharge rating | ≥ 20 C (recommended ≥ 30 C for high-current tests) |

### 7.3 Sensor Power Rails

| Sensor | Supply Voltage | Supplied From |
|---|---|---|
| HX711 | 3.3 V or 5 V | MCU 3.3 V pin |
| GY-906 (MLX90614) | 3.3 V | MCU 3.3 V pin |
| ESP32 | 3.3 V | USB or onboard regulator |

---

## 8. OPERATING CONDITIONS

| Parameter | Normal Operation | Storage |
|---|---|---|
| Ambient temperature | +5 °C to +40 °C | −20 °C to +60 °C |
| Relative humidity | ≤ 80 % non-condensing | ≤ 90 % non-condensing |
| Atmospheric pressure | 86 – 106 kPa | 70 – 106 kPa |
| Operating environment | Indoors; sheltered outdoor (no precipitation) | — |
| Vibration (operating) | The stand is a vibration-generating device; the ECU is isolated from main frame vibration by mechanical damping | — |
| Altitude | 0 – 3 000 m above sea level | — |

> **Caution**: Testing at altitudes above 3 000 m may affect motor cooling and IR temperature readings due to reduced air density.

---

## 9. SAFETY REQUIREMENTS

### 9.1 General Safety

1. **Propeller clearance zone**: A radius of at least **1.5 × propeller diameter** must be kept clear of personnel and objects during any test with the motor armed.
2. **Thrust restraint**: The stand must be **mechanically secured** to a stable surface before arming the motor. The maximum reaction thrust (up to 490 N / 50 kg) must be resisted by the mounting structure.
3. **High voltage**: At 16S (67.2 V), voltages are hazardous. Follow applicable electrical safety standards (IEC 60335, GOST R 52161).
4. **High current**: Motor peak currents may exceed 100 A. Use appropriately rated cables and connectors. Never bypass or short the main power circuit.
5. **Thermal hazards**: ESC and motor temperatures may exceed 100 °C during testing. Do not touch components immediately after a test run.
6. **Fire risk**: Use a LiPo-rated fireproof storage bag or box when charging and storing batteries. Keep a class D fire extinguisher accessible.
7. **Rotating machinery**: All personnel must maintain safe distance from spinning propellers. Safety guards are recommended for high-speed tests.

### 9.2 Software Safety Interlocks

The firmware enforces the following automatic protective actions via the status bitmask:

| Warning Flag | Trigger Condition | Automatic Action |
|---|---|---|
| `WARN_ESC_OVERHEAT` | ESC temp > `maxESCTemp` in profile | Warning broadcast via BLE; operator must disarm |
| `WARN_MOTOR_OVERHEAT` | Motor temp > `maxMotorTemp` in profile | Warning broadcast via BLE |
| `WARN_OVER_CURRENT` | Current > `maxCurrent` in profile | Warning broadcast via BLE |
| `WARN_OVER_RPM` | RPM > `maxRPM` in profile | Warning broadcast via BLE |
| `WARN_OVER_THRUST` | Thrust > `maxThrust` in profile | Warning broadcast via BLE |
| `WARN_BATTERY_LOW` | Voltage below configured threshold | Warning broadcast via BLE |

> **Note**: In firmware version 0.0.1, warnings are informational. Automatic throttle reduction or emergency shutdown on warning is planned for future firmware releases.

### 9.3 Arming Safety Interlock (Software)

- The motor **cannot be armed** unless a valid user profile is loaded (`USR_CFG_PROF_OK`).
- Arming requires a deliberate **slide-to-arm** gesture in the companion app (or `forceArm` override).
- After a BLE disconnection, the motor is automatically commanded to **stop** (DShot throttle = 0).

---

## 10. WIRING AND CONNECTION DIAGRAM

### 10.1 GPIO Pin Assignment (ESP32 NodeMCU-32S)

| GPIO | Direction | Connected To | Protocol / Signal |
|---|---|---|---|
| 2 | Output | HX711 CLK (SCK) | Bit-bang clock |
| 4 | Input | HX711 DOUT | Bit-bang data |
| 14 | Output/Input | ESC signal wire | DShot600 (bidirectional, single wire via RMT) |
| 16 (RX2) | Input | ESC KISS telemetry wire | UART2, 115 200 baud, 8N1, RX only |
| 21 | Bidirectional | GY-906 SDA | I²C data, 100 kHz |
| 22 | Output | GY-906 SCL | I²C clock, 100 kHz |
| 1 (TX0) | Output | USB/UART bridge | Debug serial, 115 200 baud |

### 10.2 Power Wiring

```
[Battery Pack]──(XT90/XT150)──[Main Power Bus]──[ESC Power Input]
                                     │
                              [BEC / 5V UBEC]──[ESP32 VIN / USB 5V]
```

### 10.3 Signal Wiring Summary

```
ESP32 GPIO14 ────────────────────── ESC  DShot Signal Wire
ESP32 GPIO16 (RX2) ──────────────── ESC  KISS Telemetry TX Wire
ESP32 GPIO4  ────────────────────── HX711  DOUT
ESP32 GPIO2  ────────────────────── HX711  SCK
ESP32 GPIO21 ────────────────────── GY-906  SDA
ESP32 GPIO22 ────────────────────── GY-906  SCL
ESP32 GND    ────────────────────── HX711 GND, GY-906 GND, ESC Signal GND
ESP32 3.3 V  ────────────────────── HX711 VCC, GY-906 VCC
```

> **Pull-up resistors**: I²C lines (GPIO 21, 22) require 4.7 kΩ pull-up resistors to 3.3 V if not included on the GY-906 module.

---

## 11. CONFIGURATION AND PROFILE SYSTEM

### 11.1 Profile Parameters

Each user configuration profile stores the following parameters:

| Parameter | Type | Range / Notes |
|---|---|---|
| `profileName` | String | 1–15 characters, no commas |
| `motorKV` | uint16 | Motor KV rating (reference, affects efficiency calculations) |
| `propDiameter` | float | Propeller diameter, inches (reference) |
| `propPitch` | float | Propeller pitch, inches (reference) |
| `numBlades` | uint8 | Number of blades (reference) |
| `batteryCellCount` | uint8 | 0 = unknown; 1–16 for LiPo cell count |
| `motorPoleCount` | uint8 | **Critical**: used for RPM = eRPM × 200 ÷ pole_count conversion |
| `motorDirReverse` | bool | Motor spin direction |
| `armThrottle` | uint16 | DShot arm throttle (48–2047); throttle floor |
| `maxRPM` | uint32 | Safety limit — over-RPM warning threshold |
| `maxESCTemp` | float | Safety limit — ESC overheat warning threshold (°C) |
| `maxMotorTemp` | float | Safety limit — motor overheat warning threshold (°C) |
| `maxCurrent` | float | Safety limit — over-current warning threshold (A) |
| `maxThrust` | float | Safety limit — over-thrust warning threshold (kg) |

### 11.2 Profile Storage

| Attribute | Value |
|---|---|
| Storage medium | ESP32 NVS (Non-Volatile Storage), Flash partition |
| Maximum profiles | 10 |
| Persistence | Survives power cycle and firmware OTA update |
| Namespace | `USR_PRFS` |
| Last-used profile | Automatically restored on power-up |

---

## 12. CALIBRATION PROCEDURES

### 12.1 Load Cell (Thrust Sensor) Tare

**Automatic tare** is performed at firmware startup. The HX711 reads the no-load offset and stores it as the zero reference.

**Manual tare** can be triggered via the companion app at any time from the Control or Connection tab.

**Calibration constant** (gain factor `HX711_GAIN = 21.4`) is compiled into the firmware. To recalibrate:
1. Apply a known reference mass (e.g., 1.000 kg precision weight) to the load cell.
2. Record the raw ADC output.
3. Calculate the new gain as: `GAIN = known_mass_g / raw_ADC_reading`.
4. Update `HX711_GAIN` in `AnalyzerConfig.hpp` and rebuild firmware.

### 12.2 IR Temperature Sensor (GY-906)

The MLX90614 is factory-calibrated. No user calibration is required under normal conditions.

If testing motors with a coating of unknown emissivity:
- Compare GY-906 readings against a contact thermocouple reference on the motor stator.
- Adjust emissivity register (0x0F in EEPROM) via I²C if deviation exceeds ±2 °C.

### 12.3 ESC Telemetry Channels

ESC telemetry (voltage, current, power, RPM) is calibrated internally by the ESC firmware. No separate calibration procedure is required. For accuracy verification:
- Compare voltage reading against a calibrated bench multimeter at the ESC power terminals.
- Compare current reading against a calibrated clamp meter at the main power lead.

---

## 13. MAINTENANCE AND SERVICE

### 13.1 Periodic Maintenance Schedule

| Interval | Action |
|---|---|
| Before each test session | Visually inspect all connectors and cables for damage or heat discoloration |
| Before each test session | Perform load cell tare with no motor/propeller load applied |
| Before each test session | Verify GY-906 mounting distance (5–20 mm from motor stator) |
| After each test session | Discharge or safely store battery per LiPo handling guidelines |
| After every 50 test hours | Inspect motor mounting plate fasteners for loosening from vibration |
| After every 50 test hours | Inspect load cell mounting bracket alignment |
| As required | Update firmware via USB/PlatformIO when new releases are available |

### 13.2 Firmware Update Procedure

1. Install [PlatformIO IDE](https://platformio.org/) or PlatformIO CLI.
2. Clone the firmware repository: `UAMLabDeviceFirmware`.
3. Connect the ESP32 via USB.
4. Run: `pio run --target upload`.
5. Monitor serial output at 115 200 baud to confirm successful startup.

### 13.3 Known Limitations (Firmware v0.0.1)

- Safety warning flags are informational only; automatic motor shutdown on over-limit events is not implemented in this version.
- RSSI signal strength display in the companion app shows a placeholder value (−60 dBm); actual RSSI requires the experimental Web Bluetooth API extension.
- Maximum 10 profiles storable in NVS.

---

## 14. STORAGE AND TRANSPORTATION

| Condition | Requirement |
|---|---|
| Storage temperature | −20 °C to +60 °C |
| Storage humidity | ≤ 90 % non-condensing |
| Protection class | IP20 (no dust/water ingress protection; store in dry, enclosed space) |
| Packaging for transport | Original packaging or rigid case with foam padding |
| Vibration during transport | Protect from shocks > 10 g; cushion electronics with foam |
| Battery storage | Store LiPo batteries at storage voltage (3.8 V/cell) in a LiPo-safe bag, separate from ECU |

---

## 15. COMPLETENESS OF DELIVERY

| No. | Item | Qty |
|---|---|---|
| 1 | UAVMLab test stand mechanical frame assembly | 1 |
| 2 | ESP32 NodeMCU-32S ECU module (mounted) | 1 |
| 3 | QLSensor 50 kg miniature load cell (mounted) | 1 |
| 4 | HX711 load cell amplifier module (mounted) | 1 |
| 5 | GY-906 IR thermometer module (mounted) | 1 |
| 6 | BLHeli32 16S 100 A ESC (mounted, standard configuration) | 1 |
| 7 | Power cables and connectors (XT90 or XT150 per order spec) | 1 set |
| 8 | Signal cable harness (DShot + KISS telemetry + sensor) | 1 set |
| 9 | USB-A to USB-Micro cable (for ECU programming / power) | 1 |
| 10 | This Technical Passport (digital, `docs/TECHNICAL_PASSPORT_V2.md`) | 1 |

> **Not included**: Motor under test, propeller under test, battery pack, battery charger, host device (smartphone/PC).

---

## 16. ACCEPTANCE CERTIFICATE

This section shall be completed upon delivery and commissioning of the test stand.

| Field | Value |
|---|---|
| Stand Serial No. | _________________________________ |
| Date of Manufacture | _________________________________ |
| Date of Acceptance | _________________________________ |
| Accepted by (name/position) | _________________________________ |
| Firmware Version at Delivery | 0.0.1 |
| App Version at Delivery | 0.0.1 |
| Load Cell Tare Verified | ☐ Yes ☐ No |
| GY-906 Sensor I²C Detected | ☐ Yes ☐ No |
| BLE Connection Test Passed | ☐ Yes ☐ No |
| KISS Telemetry Test Passed | ☐ Yes ☐ No |
| DShot Motor Arm Test Passed | ☐ Yes ☐ No |
| Remarks | _________________________________ |

**Signature of manufacturer representative**: ___________________________

**Signature of recipient**: ___________________________

---

## 17. WARRANTY OBLIGATIONS

| Parameter | Value |
|---|---|
| Warranty period | 12 months from date of acceptance |
| Warranty coverage | Manufacturing defects in ECU assembly, sensor mounting, and mechanical frame |
| Exclusions | Damage from improper use, exceeding rated loads, moisture ingress, battery-related damage, damage from propeller strikes |
| Warranty service contact | Sintez LLC — see organization contact details |

> Warranty is void if:
> - The ECU has been modified or reflashed with unauthorized firmware.
> - The load cell has been subjected to loads exceeding 150 % of rated capacity (75 kg).
> - Evidence of physical impact, liquid ingress, or fire damage is present.

---

*End of Technical Passport — Document TP-UAVMLAB-001, Revision 1.0, 2026-05-30*
*Prepared in accordance with GOST 2.601-2019 (Operational Documents) and GOST R 51188.*

