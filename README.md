# Trauma Trainer: ESP32 Firmware & Telemetry Dashboard

This project is a high-fidelity **Trauma Trainer** telemetry system, consisting of:
1. **Firmware:** An ESP32 microcontroller application that reads five Force-Sensitive Resistors (FSRs) to monitor direct pressure and tourniquet application, giving real-time feedback via a 9-pixel NeoPixel LED ring and a physical SSD1306 128x64 OLED display.
2. **Dashboard:** A web-based visualizer that connects to the ESP32 via the **Web Serial API**, showing dynamic pressure line graphs, individual sensor gauges, a virtual NeoPixel feedback ring, and training state progress. It also includes an **Offline Simulation Mode** to test the system entirely in-browser.

---

## 🛠️ 1. Hardware Connections (ESP32 Pinout)

Connect your components to the ESP32 according to the table below. Note that ESP32 pins `34, 35, 32, 33, 25` are input-capable ADC pins used to read analog voltages from the FSRs (voltage dividers).

| Component | ESP32 Pin | Type | Notes |
| :--- | :---: | :---: | :--- |
| **Direct FSR** | `GPIO 34` | Analog In | Connect to FSR voltage divider circuit |
| **Tourniquet FSR 1** | `GPIO 35` | Analog In | FSR 1 (Left/Outer) |
| **Tourniquet FSR 2** | `GPIO 32` | Analog In | FSR 2 |
| **Tourniquet FSR 3** | `GPIO 33` | Analog In | FSR 3 |
| **Tourniquet FSR 4** | `GPIO 25` | Analog In | FSR 4 (Right/Inner) |
| **NeoPixel Ring (DIN)** | `GPIO 26` | Digital Out | Data line to the 9-pixel NeoPixel Ring |
| **OLED SDA** | `GPIO 21` | I2C Data | Serial Data Line |
| **OLED SCL** | `GPIO 22` | I2C Clock | Serial Clock Line |
| **Common Ground** | `GND` | Ground | Ground line for all components |
| **Power Rails** | `3V3` / `5V` | Power | VCC for OLED (3.3V) and NeoPixels (5V/USB) |

> [!TIP]
> Ensure each FSR is connected in a standard voltage divider circuit using a **10kΩ resistor** pulled down to ground. The node between the FSR and the 10kΩ resistor connects to the designated ESP32 ADC pin.

---

## 💾 2. Compiling and Flashing Firmware

The firmware is structured as a **PlatformIO** project. To upload the code:

1. **Install Prerequisites:** Ensure you have VS Code with the **PlatformIO IDE** extension installed, or run PlatformIO Core CLI.
2. **Open Project:** Open the `firmware/` directory in VS Code / PlatformIO.
3. **Connect Device:** Plug your ESP32 board into your computer's USB port.
4. **Build & Upload:**
   - **Via VS Code GUI:** Click the PlatformIO alien head icon on the left panel, and click **Upload**.
   - **Via CLI:** Run the following command in the `firmware/` folder:
     ```bash
     pio run --target upload
     ```
5. **Serial Monitor:** The firmware communicates at **115200 baud**. You can monitor the raw output using PlatformIO's Serial Monitor (`pio device monitor`) or the Web Serial dashboard.

---

## 📊 3. Running the Telemetry Dashboard

The dashboard is built using standard HTML5, CSS, and Vanilla JavaScript, served by **Vite** for local development.

### Quick Start:
1. **Navigate to Dashboard:**
   ```bash
   cd dashboard
   ```
2. **Install Dependencies:**
   ```bash
   npm install
   ```
3. **Launch Dev Server:**
   ```bash
   npm run dev
   ```
4. **Open Browser:** Click the local URL generated (usually `http://localhost:5173`) in a browser that supports Web Serial (**Google Chrome**, **Microsoft Edge**, or **Opera**).

### Features:
* **Connect Device:** Click the **Connect Device** button, select your ESP32's USB serial port, and start streaming telemetry in real-time.
* **Pressure Visualizers:** View pressure level gauges for both direct wound packing (Direct) and tourniquet pressure (TQ).
* **Sensor Grid:** Monitor the four individual tourniquet sensors (T1-T4) to detect uneven pressure application.
* **LED Ring Simulation:** See a dynamic representation of the NeoPixel ring on the hardware, lighting up Red (low pressure), Cyan (target threshold met, holding), and Green (successfully stopped bleeding).
* **Live Graphing:** Trace real-time pressure curves over time on a high-performance scrolling canvas chart.
* **Log Terminal:** Inspect raw serial strings directly from the board, with actions to clear or copy logs.
* **Simulator Panel:** No hardware? Click **Enable Simulation** in the top right to control the trainer using sliders!
