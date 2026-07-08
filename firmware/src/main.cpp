#include <Arduino.h>
#include <Adafruit_NeoPixel.h>
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>

#define SCREEN_WIDTH 128
#define SCREEN_HEIGHT 64
#define OLED_RESET -1
Adafruit_SSD1306 display(SCREEN_WIDTH, SCREEN_HEIGHT, &Wire, OLED_RESET);

// -------------------- FSR PINS --------------------
const int directFsrPin = 34;
const int tourniquetFsr1Pin = 35;
const int tourniquetFsr2Pin = 32;
const int tourniquetFsr3Pin = 33;
const int tourniquetFsr4Pin = 25;
const int neoPixelPin = 26;
const int pixelCount = 9;
Adafruit_NeoPixel strip(pixelCount, neoPixelPin, NEO_GRB + NEO_KHZ800);

const float directScaleFactor = 220.0;
const float tourniquetScaleFactor = 220.0;
const float stopPressureThreshold = 16.0;
const unsigned long successHoldTime = 2000;
unsigned long stopPressureStartTime = 0;
bool stopPressureActive = false;
bool successAchieved = false;

// Gather stable analog readings by averaging 10 samples
int getAverageAnalogRead(int pin) {
  int total = 0;
  for (int i = 0; i < 10; i++) {
    total += analogRead(pin);
    delay(2);
  }
  return total / 10;
}

// Update the physical OLED display with real-time pressure values
void updateOLED(
  int directValue,
  float directPounds,
  int t1,
  int t2,
  int t3,
  int t4,
  int tourniquetAverage,
  float tourniquetPounds
) {
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("Trauma Trainer");
  
  display.setCursor(0, 12);
  display.print("Direct: ");
  display.print(directValue);
  display.print(" / ");
  display.print(directPounds, 1);
  display.println(" lb");
  
  display.setCursor(0, 24);
  display.print("TQ Avg: ");
  display.print(tourniquetAverage);
  display.print(" / ");
  display.print(tourniquetPounds, 1);
  display.println(" lb");
  
  display.setCursor(0, 38);
  display.print("T1:");
  display.print(t1);
  display.print(" T2:");
  display.print(t2);
  
  display.setCursor(0, 50);
  display.print("T3:");
  display.print(t3);
  display.print(" T4:");
  display.print(t4);
  
  display.display();
}

// Light up all pixels green to signal successful application of pressure
void showSuccess() {
  strip.clear();
  for (int i = 0; i < pixelCount; i++) {
    strip.setPixelColor(i, strip.Color(0, 80, 0));
  }
  strip.show();
}

// Adjust NeoPixel ring feedback based on pressure level and hold time
void showPressureBrightness(float pressure) {
  if (pressure >= stopPressureThreshold) {
    if (!stopPressureActive) {
      stopPressureActive = true;
      successAchieved = false;
      stopPressureStartTime = millis();
    }
    
    // Check if the pressure has been held above threshold long enough
    if (millis() - stopPressureStartTime >= successHoldTime) {
      successAchieved = true;
    }
    
    if (successAchieved) {
      showSuccess();
    } else {
      // Cyan/teal pulse indicating pressure is sufficient, holding to confirm
      for (int i = 0; i < pixelCount; i++) {
        strip.setPixelColor(i, strip.Color(0, 80, 80));
      }
      strip.show();
    }
    return;
  }
  
  // If pressure drops below threshold, reset timer and status
  stopPressureActive = false;
  successAchieved = false;
  
  // Calculate brightness using precise floating point math
  float ratio = pressure / stopPressureThreshold;
  if (ratio < 0.0) ratio = 0.0;
  if (ratio > 1.0) ratio = 1.0;
  int brightness = 5 + (int)(115.0 * ratio); // Scales from 5 to 120
  
  strip.clear();
  for (int i = 0; i < pixelCount; i++) {
    strip.setPixelColor(i, strip.Color(brightness, 0, 0)); // Red warning light
  }
  strip.show();
}

void setup() {
  Serial.begin(115200);
  
  // Initialize NeoPixel strip
  strip.begin();
  strip.setBrightness(40);
  strip.clear();
  strip.show();
  
  // Initialize I2C OLED display (ESP32 pins SDA=21, SCL=22)
  Wire.begin(21, 22);
  if (!display.begin(SSD1306_SWITCHCAPVCC, 0x3C)) {
    Serial.println("OLED failed to initialize");
    while (true);
  }
  
  display.clearDisplay();
  display.setTextSize(1);
  display.setTextColor(SSD1306_WHITE);
  display.setCursor(0, 0);
  display.println("OLED Ready");
  display.display();
  
  Serial.println("Direct FSR + Four Tourniquet FSRs + NeoPixel + OLED Initialized");
}

void loop() {
  int directValue = getAverageAnalogRead(directFsrPin);
  int t1 = getAverageAnalogRead(tourniquetFsr1Pin);
  int t2 = getAverageAnalogRead(tourniquetFsr2Pin);
  int t3 = getAverageAnalogRead(tourniquetFsr3Pin);
  int t4 = getAverageAnalogRead(tourniquetFsr4Pin);
  
  int tourniquetAverage = (t1 + t2 + t3 + t4) / 4;
  float directPounds = directValue / directScaleFactor;
  float tourniquetPounds = tourniquetAverage / tourniquetScaleFactor;
  
  // Update NeoPixel visual feedback based on Tourniquet pressure
  showPressureBrightness(tourniquetPounds);
  
  // Update the OLED physical display
  updateOLED(
    directValue,
    directPounds,
    t1,
    t2,
    t3,
    t4,
    tourniquetAverage,
    tourniquetPounds
  );
  
  // Send data to Serial port for local/web dashboard plotting
  Serial.print("Direct ADC: ");
  Serial.print(directValue);
  Serial.print(" | Direct lb: ");
  Serial.print(directPounds, 2);
  Serial.print(" | T1: ");
  Serial.print(t1);
  Serial.print(" | T2: ");
  Serial.print(t2);
  Serial.print(" | T3: ");
  Serial.print(t3);
  Serial.print(" | T4: ");
  Serial.print(t4);
  Serial.print(" | Tourniquet Avg: ");
  Serial.print(tourniquetAverage);
  Serial.print(" | Tourniquet lb: ");
  Serial.println(tourniquetPounds, 2);
  
  delay(150);
}
