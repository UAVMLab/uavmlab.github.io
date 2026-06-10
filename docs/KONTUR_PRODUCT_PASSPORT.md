# UAVMLab
## UAV Propulsion System Test Stand
### Product Passport  |  Sintez LLC  |  Rev 1.0 — 2026-05-30

---

## General Description

**UAVMLab** is a laboratory test stand for measurement, fine-tuning, and endurance testing of UAV propulsion assemblies under controlled indoor conditions. The system enables comprehensive evaluation of the complete drive chain — brushless motor, propeller, ESC, and battery pack — as an integrated unit.

The stand measures thrust, current, voltage, power, RPM, ESC temperature, and motor temperature simultaneously and in real time. In addition to motor and propeller characterisation, the system supports ESC thermal stress profiling and battery internal resistance estimation, enabling full-stack qualification of the propulsion system without field testing.

Control and data collection are performed through a dedicated web application (PWA) accessed via **Google Chrome** on any PC, laptop, mobile phone or tablet with Bluetooth support. Test results are exported manually as PDF (primary) or CSV.

---

## Key Advantages

- **Process automation**: eliminates lengthy and repetitive field testing.
- **Budget efficiency**: early identification of inefficient or problematic component combinations — including ESC and battery pack — before committing to production.
- **Reliability improvement**: evidence-based component selection for the final product.
- **Flight time optimization**: identification of the most efficient operating regimes across motor, propeller, ESC, and battery combinations.
- **ESC qualification**: thermal stress profiling and load characterisation of the ESC under controlled, repeatable conditions.
- **Battery assessment**: measurement of battery internal resistance via current-pulse method to evaluate pack health and suitability for high-current applications.
- **Risk reduction**: automatic detection of overheating, overcurrent, and unstable behavior across the full drive chain.
- **Quality assurance**: development grounded in verified, measured performance data.

---

## Purpose and Typical Applications

The stand is designed for safe, reproducible testing of UAV propulsion systems in laboratory conditions — covering performance characterisation, thermal qualification, configuration comparison, and optimal component matching across the complete drive chain: motor, propeller, ESC, and battery pack.

**Tasks the stand solves:**

- Verify manufacturer-declared motor and propeller specifications against measured data.
- Compare performance of components from different suppliers under identical conditions.
- Experimentally measure real parameters of a motor/propeller/ESC/battery assembly.
- Match motors and propellers by similar performance characteristics.
- Select optimal operating regimes for UAV power systems.
- Characterise ESC thermal behaviour under sustained and two-segment high-load profiles.
- Estimate battery pack internal resistance to assess pack health and suitability for high-discharge applications.

---

## Product Characteristics

> *Voltage, current, power, RPM, and ESC temperature are sourced from ESC KISS telemetry — their accuracy depends on the installed ESC. Thrust is measured by a dedicated 50 kg strain-gauge load cell. Motor temperature is measured by a non-contact IR sensor.*
>
> **Note:** The measurement ranges and electrical ratings listed for voltage, current, power, RPM, and ESC temperature reflect the specifications of the **ESC supplied with the stand** (BLHeli32 16S 100 A). These parameters are determined by the ESC hardware and firmware, not by the stand itself. If the user replaces the ESC with an alternative unit that supports DShot600 and KISS telemetry, the applicable measurement ranges, current ratings, and accuracy specifications will be those of the substitute ESC.

### Measured Parameters

| Parameter | Range | Unit | Source |
|---|---|---|---|
| Thrust | 0 – 50 | kg | QLSensor 50 kg load cell + HX711 ADC |
| Voltage | 11.1 – 67.2 (3S - 16S) | V | ESC KISS telemetry |
| Current | 0 – 100 (continuous) | A | ESC KISS telemetry |
| Power | 0 – 6 700 | W | ESC KISS telemetry (V × I) |
| RPM | 0 – 500 000 eRPM | rpm | ESC KISS telemetry |
| Motor temperature | −40 – +380 | °C | GY-906 IR sensor (non-contact) |
| ESC temperature | 0 – 140 | °C | ESC KISS telemetry |

### Physical Characteristics

| Parameter | Value |
|---|---|
| Dimensions (L × W × H) | 279 × 279 × 406 mm (11 × 11 × 16 in) |
| Weight (without motor, propeller, ESC, battery) | ≈ 1.4 kg |
| Maximum propeller diameter | 9" |
| Compatible motor stator sizes | 08xx – 35xx |

### Power Supply

| Parameter | Value |
|---|---|
| Battery input | 3S – 16S LiPo (11.1 V – 67.2 V) |
| External stabilized supply | Up to 67.2 V |
| ESC continuous current (standard) | 100 A |
| ESC burst current (standard) | 120 A |
| Compatible ESC | Any ESC with DShot600 + KISS telemetry |

### Operating Conditions

| Parameter | Value | Notes |
|---|---|---|
| Ambient temperature | +5 °C … +40 °C | Indoors |
| Relative humidity | Up to 80 % | Non-condensing |
| Altitude | 0 – 3 000 m | — |

---

## Test and Analysis Modes

### Manual Control (Control Tab)

The operator arms the stand with a slide-to-arm gesture and sets motor throttle (DShot value 48–2047) freely via the throttle slider. Requires an active profile before arming. Motor stops automatically on Bluetooth disconnection.

### Automated Analysis Modes (Analyze Tab)

| Mode | Description | Parameters |
|---|---|---|
| Static Throttle Sweep | Automatically sweeps throttle from minimum to maximum, recording all 7 channels at each step; builds thrust, power, and efficiency vs. throttle curves | Start Throttle (%), End Throttle (%), Step Size (%), Dwell per Step (s), Ramp Rate (%/s), Repeats |
| Step Response | Applies instantaneous throttle steps; records dynamic response of thrust, RPM, current | Low Throttle (%), High Throttle (%), On Duration (s), Off Duration (s), Cycles, Ramp Rate (%/s) |
| Fixed Throttle Endurance | Holds a user-defined throttle for a set duration; monitors temperature rise and performance drift | Throttle (%), Duration (min), Cooldown (min) |
| Battery IR (Current Steps) | Steps current through the motor in increments to estimate battery internal resistance from voltage sag | Baseline Throttle (%), Pulse Amplitude (%), Pulse On (s), Pulse Off (s), Pulses |
| KV Estimation | Measures back-EMF at multiple voltage steps to calculate motor KV constant; requires propeller removal and variable supply | Throttle (%), Voltage Steps, Dwell per Step (s), Current Ceiling (A) |
| ESC Thermal Stress | Runs a two-segment high-load profile to characterize ESC thermal behavior over time | Segment 1 Throttle (%), Segment 1 Duration (s), Segment 2 Throttle (%), Segment 2 Duration (s) |
| Prop/Motor Mapping | Sweeps multiple throttle points and maps thrust, RPM, and efficiency per propeller/motor combination | Repeats, Ambient Temp (°C), Notes |
| Efficiency Analysis | Computes specific thrust (g/W) and propulsive efficiency across the operating range | Start Throttle (%), End Throttle (%), Step Size (%), Dwell per Step (s), Ramp Rate (%/s) |

---

## Completeness of Delivery

| Item | Qty |
|---|---|
| Test stand (aluminium frame with motor mounting plate) | 1 pc. |
| GY-906 IR motor temperature sensor | 1 pc. |
| QLSensor 50 kg miniature load cell (thrust sensor) | 1 pc. |
| HX711 24-bit ADC module (load cell amplifier) | 1 pc. |
| BLHeli32 16S 100 A ESC (standard configuration) | 1 pc. |
| ESP32 microcontroller (ECU, mounted) | 1 pc. |
| Power cables and connectors (XT60 / XT90) | 1 set |
| Signal and sensor cable harness | 1 set |
| USB cable (ECU programming / power) | 1 pc. |
| Web application — PWA at uavmlab.github.io | 1 licence |

> **Not included**: motor under test, propeller under test, battery pack, battery charger, host device.

---

## Typical Use Scenario

The stand is installed in a laboratory with at least 1.5 × propeller diameter of clearance around the propeller plane. The propulsion assembly (motor + propeller) is secured to the motor mounting plate. The power source — a LiPo battery (3S–16S) or external stabilized supply up to 67.2 V — connects to the ESC via XT60 or XT90 connector. The ESC is pre-configured for DShot600 and KISS telemetry output.

The operator opens the **UAVMLab** web application in Chrome on any Bluetooth-enabled device, pairs with the stand, loads or creates a motor profile (motor KV, pole count, safety limits), and arms the stand using the slide-to-arm gesture. The application controls throttle in real time, records all 7 sensor channels, displays live telemetry, and allows the user to export results as a timestamped PDF or CSV file.

---

## Companion Application

The **UAVMLab** web application is a Progressive Web App (PWA) available at **uavmlab.github.io**. No installation is required. Requires **Google Chrome** or **Microsoft Edge** with Web Bluetooth API support.

| Tab | Function |
|---|---|
| Connection | Scan for and connect to the stand via BLE; view device status and RSSI |
| Control | Arm/disarm stand; manual throttle slider; live telemetry display (all 7 channels) |
| Analyze | Select and run automated analysis modes; view live and post-test graphs |
| Profiles | Create, edit, load, and delete up to 10 motor/propeller configuration profiles |
| Navigation | Assisted flight-path planning tools (in development) |
| Logs | Real-time event and error log |
| Results | Post-run performance graphs: Power Efficiency, Thrust Efficiency, Thermal Profile |

---

## Operating Procedures

### Step 1 — Power On

**ECU (controller)**: Connect a **5V USB-C adapter**. The onboard LED illuminates, confirming the controller is powered and the BLE radio is active.

**Propulsion circuit**: Connect a LiPo battery (**3S–16S, 11.1–67.2 V**, rated for at least **100 A continuous** discharge) to the ESC via the XT60 or XT90 power connector. Secure the stand mechanically before energising the motor circuit.

> ⚠️ Always power the ECU before connecting the propulsion battery. Never connect or disconnect the battery while the motor is armed.

---

### Step 2 — Connect via Bluetooth

1. Open **Google Chrome** on a device with Bluetooth enabled.
2. Enable Web Bluetooth access on Chrome flag (chrome://flags/#enable-web-bluetooth-new-permissions-backend and chrome://flags/#enable-web-bluetooth) and relaunch the Chrome browser.
3. Navigate to **uavmlab.github.io**.
4. Open the **Connection** tab.
5. Press **Scan & Connect** — a browser Bluetooth dialog lists nearby BLE devices.
6. Select **UAVMLab.Sintez** detected device from the list.
7. Once connected, the status indicator updates and the device name and firmware version appear in the Device Snapshot card.
8. Previously paired devices are saved in the **Device History** list for one-tap reconnection.

---

### Step 3 — Load a Profile

A motor/propeller profile must be active before arming.

1. Open the **Profiles** tab.
2. Select an existing profile or create a new one (motor KV, pole count, propeller diameter, arming throttle, safety limits and other given parameters).
3. Tap **Set Active** — the active profile name appears in the Control and Analyze tabs.

---

### Step 4 — Manual Control

1. Open the **Control** tab. Live telemetry (Voltage, Current, Power, RPM, Thrust, ESC Temp, Motor Temp) updates in real time once connected.
2. Drag the **Slide to ARM** handle fully to the right to arm the stand. The **Force** checkbox bypasses the safety interlocks.
3. Use the **Throttle** slider to set motor speed (DShot value 48–2047, displayed as 0–100 %).
4. Return the slider to minimum and press **Disarm** to stop the motor. The motor also stops automatically on Bluetooth disconnection.

---

### Step 5 — Automated Analysis

1. Open the **Analyze** tab.
2. Select a mode from the dropdown:

| Mode | Purpose |
|---|---|
| Static Throttle Sweep | Full-range characterisation — RPM, thrust, current vs throttle |
| Step Response | Acceleration dynamics and ESC response time |
| Fixed Throttle Endurance | Thermal and voltage-sag behaviour over time |
| Battery IR | Battery internal resistance via current-pulse method |
| KV Estimation | Motor KV constant from RPM vs voltage scatter |
| ESC Thermal Stress | ESC thermal management under two-segment load |
| Prop/Motor Mapping | Repeatable multi-sweep performance database |
| Efficiency Analysis | Thrust-per-watt and g/1000 RPM optimisation |

3. Adjust the mode-specific parameters that appear below the selector.
4. Press **Start** — the stand arms automatically, executes the sequence, and a progress bar tracks completion. All 9 channels (time, throttle, voltage, current, power, RPM, thrust, ESC temp, motor temp) are recorded at **20 Hz**.
5. Press **Stop** at any time to abort. The motor ramps down and disarms automatically at sequence end.
6. Analysis graphs render in the **Analysis Graphs** card after the run completes.

> ⚠️ For KV Estimation, the user must remove the propeller and use a stable variable power supply to step voltage step by step following the on-screen instructions. For all other modes, a LiPo battery is recommended for realistic load conditions.

---

### Step 6 — Obtaining and Exporting Results

After a test run, two export formats are available:

| Format | How to export | Contents |
|---|---|---|
| **PDF** *(primary)* | Press the ↓ icon in the Analysis Graphs card header | Landscape PDF — chart image, motor profile, test mode, parameters, and timestamp |
| **CSV** *(also available)* | Same ↓ button — raw data download | Time-series table of all 9 measurement columns; suitable for spreadsheet, Python, or MATLAB analysis |

Cumulative performance summaries (Power Efficiency, Thrust Efficiency, Thermal Profile charts) are viewable in the **Results** tab and persist across sessions.

---

*UAVMLab — UAV Propulsion System Test Stand*

*Sintez LLC  |  uavmlab.github.io*

*Author: WM Nipun Dhananjaya | 30.05.2026*