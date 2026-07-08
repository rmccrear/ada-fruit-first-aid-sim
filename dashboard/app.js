// DOM Elements
const btnConnect = document.getElementById('btn-connect');
const btnToggleSim = document.getElementById('btn-toggle-sim');
const connectionStatus = document.getElementById('connection-status');
const serialTerminal = document.getElementById('serial-terminal');
const btnClearLog = document.getElementById('btn-clear-log');
const btnCopyLog = document.getElementById('btn-copy-log');

// Sim Panel & Sliders
const simPanel = document.getElementById('simulation-panel');
const sliderDirect = document.getElementById('slider-direct');
const sliderT1 = document.getElementById('slider-t1');
const sliderT2 = document.getElementById('slider-t2');
const sliderT3 = document.getElementById('slider-t3');
const sliderT4 = document.getElementById('slider-t4');
const lblSimDirect = document.getElementById('sim-direct-val');
const lblSimT1 = document.getElementById('sim-t1-val');
const lblSimT2 = document.getElementById('sim-t2-val');
const lblSimT3 = document.getElementById('sim-t3-val');
const lblSimT4 = document.getElementById('sim-t4-val');

// Labels & Gauges
const lblDirectLb = document.getElementById('lbl-direct-lb');
const lblDirectAdc = document.getElementById('lbl-direct-adc');
const barDirect = document.getElementById('bar-direct');
const directBadge = document.getElementById('direct-status-badge');

const lblTqLb = document.getElementById('lbl-tq-lb');
const lblTqAdc = document.getElementById('lbl-tq-adc');
const barTq = document.getElementById('bar-tq');
const tqBadge = document.getElementById('tq-status-badge');

const lblT1 = document.getElementById('lbl-t1');
const lblT2 = document.getElementById('lbl-t2');
const lblT3 = document.getElementById('lbl-t3');
const lblT4 = document.getElementById('lbl-t4');
const barT1 = document.getElementById('bar-t1');
const barT2 = document.getElementById('bar-t2');
const barT3 = document.getElementById('bar-t3');
const barT4 = document.getElementById('bar-t4');

// Training Banner & NeoPixels
const trainingBanner = document.getElementById('training-banner');
const bannerTitle = document.getElementById('banner-title');
const bannerDesc = document.getElementById('banner-desc');
const bannerProgress = document.getElementById('banner-progress');
const lblRingState = document.getElementById('lbl-ring-state');
const neopixelsGroup = document.getElementById('neopixels-group');

// Telemetry Canvas
const canvas = document.getElementById('telemetry-chart');
const ctx = canvas.getContext('2d');

// State Variables
let serialPort = null;
let serialReader = null;
let keepReading = false;
let isSimulationMode = false;
let simIntervalId = null;

const CONSTANTS = {
  directScale: 220.0,
  tqScale: 220.0,
  thresholdLb: 16.0,
  holdTimeMs: 2000,
  pixelCount: 9,
  maxPoints: 80
};

let telemetryHistory = [];
let lastTimestamp = Date.now();

// Pressure State Machine (matches hardware logic)
let stopPressureActive = false;
let stopPressureStartTime = 0;
let successAchieved = false;

// Initialize NeoPixel Ring SVG
function initNeoPixelRing() {
  neopixelsGroup.innerHTML = '';
  const cx = 100;
  const cy = 100;
  const r = 80; // Radius of the ring circle
  
  for (let i = 0; i < CONSTANTS.pixelCount; i++) {
    // Distribute 9 pixels evenly. Offset by -90 deg to put pixel 0 at the top.
    const angleRad = (i * (360 / CONSTANTS.pixelCount) - 90) * (Math.PI / 180);
    const px = cx + r * Math.cos(angleRad);
    const py = cy + r * Math.sin(angleRad);
    
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', px);
    circle.setAttribute('cy', py);
    circle.setAttribute('r', '8');
    circle.setAttribute('class', 'pixel-node');
    circle.setAttribute('id', `pixel-${i}`);
    circle.setAttribute('fill', '#111');
    circle.setAttribute('stroke', '#333');
    circle.setAttribute('stroke-width', '1');
    neopixelsGroup.appendChild(circle);
  }
}

// Update NeoPixel SVG Ring Visualizer
function updateNeoPixelRingUI(rgbColor, shadowGlow) {
  const colorStr = `rgb(${rgbColor.r}, ${rgbColor.g}, ${rgbColor.b})`;
  for (let i = 0; i < CONSTANTS.pixelCount; i++) {
    const pixel = document.getElementById(`pixel-${i}`);
    if (pixel) {
      pixel.setAttribute('fill', colorStr);
      if (shadowGlow) {
        pixel.style.filter = `drop-shadow(0 0 6px ${colorStr})`;
      } else {
        pixel.style.filter = 'none';
      }
    }
  }
}

// Helper to determine status category
function getPressureStatusBadge(lb) {
  if (lb >= CONSTANTS.thresholdLb) {
    return successAchieved ? { text: 'SUCCESS', class: 'success' } : { text: 'HOLDING', class: 'holding' };
  } else if (lb > 4.0) {
    return { text: 'MEDIUM', class: 'medium' };
  } else {
    return { text: 'LOW', class: 'low' };
  }
}

// core data update function - parses telemetry structure
function updateTelemetryData(data) {
  const { directAdc, directLb, t1, t2, t3, t4, tqAvgAdc, tqAvgLb } = data;
  const now = Date.now();

  // 1. Update Labels & Gauges
  lblDirectLb.innerText = directLb.toFixed(2);
  lblDirectAdc.innerText = `ADC Value: ${directAdc}`;
  barDirect.style.width = `${Math.min((directLb / 18.6) * 100, 100)}%`;
  
  const dBadgeState = getPressureStatusBadge(directLb);
  directBadge.innerText = dBadgeState.text;
  directBadge.className = `badge ${dBadgeState.class}`;

  lblTqLb.innerText = tqAvgLb.toFixed(2);
  lblTqAdc.innerText = `ADC Avg: ${tqAvgAdc} / Threshold: ${CONSTANTS.thresholdLb.toFixed(1)} lb`;
  barTq.style.width = `${Math.min((tqAvgLb / 18.6) * 100, 100)}%`;

  // Individual sensors
  lblT1.innerText = t1;
  barT1.style.width = `${Math.min((t1 / 4095) * 100, 100)}%`;
  lblT2.innerText = t2;
  barT2.style.width = `${Math.min((t2 / 4095) * 100, 100)}%`;
  lblT3.innerText = t3;
  barT3.style.width = `${Math.min((t3 / 4095) * 100, 100)}%`;
  lblT4.innerText = t4;
  barT4.style.width = `${Math.min((t4 / 4095) * 100, 100)}%`;

  // 2. State Machine Logic for Hold Time and Success (mirroring ESP32 main.cpp)
  let holdProgress = 0;
  if (tqAvgLb >= CONSTANTS.thresholdLb) {
    if (!stopPressureActive) {
      stopPressureActive = true;
      successAchieved = false;
      stopPressureStartTime = now;
    }
    
    const elapsed = now - stopPressureStartTime;
    if (elapsed >= CONSTANTS.holdTimeMs) {
      successAchieved = true;
    }
    
    holdProgress = Math.min((elapsed / CONSTANTS.holdTimeMs) * 100, 100);
  } else {
    stopPressureActive = false;
    successAchieved = false;
    holdProgress = 0;
  }

  const tqBadgeState = getPressureStatusBadge(tqAvgLb);
  tqBadge.innerText = tqBadgeState.text;
  tqBadge.className = `badge ${tqBadgeState.class}`;

  // 3. Update Banner UI
  if (successAchieved) {
    trainingBanner.className = 'card status-banner state-success';
    bannerTitle.innerText = 'TRAINING SUCCESSFUL';
    bannerDesc.innerText = 'Bleeding stopped. Target pressure maintained for 2.0s. Excellent job!';
    bannerProgress.style.width = '100%';
    lblRingState.innerText = 'SUCCESS (GREEN)';
    updateNeoPixelRingUI({ r: 0, g: 180, b: 0 }, true);
  } else if (stopPressureActive) {
    trainingBanner.className = 'card status-banner state-holding';
    bannerTitle.innerText = 'HOLD PRESSURE!';
    bannerDesc.innerText = 'Target threshold reached. Hold steady for 2 seconds to seal the artery...';
    bannerProgress.style.width = `${holdProgress}%`;
    lblRingState.innerText = 'HOLDING (CYAN)';
    
    // Cyan pulse glow
    const pulseStrength = 100 + Math.sin(now / 100) * 50;
    updateNeoPixelRingUI({ r: 0, g: Math.floor(pulseStrength), b: Math.floor(pulseStrength) }, true);
  } else {
    trainingBanner.className = 'card status-banner state-insufficient';
    bannerTitle.innerText = 'APPLY TOURNIQUET';
    bannerDesc.innerText = `Tighten tourniquet until average pressure exceeds target: ${CONSTANTS.thresholdLb.toFixed(1)} lb.`;
    bannerProgress.style.width = `${(tqAvgLb / CONSTANTS.thresholdLb) * 100}%`;
    lblRingState.innerText = 'INSUFFICIENT (RED)';
    
    // Scale red ring brightness matching the firmware mapping 5-120
    const ratio = tqAvgLb / CONSTANTS.thresholdLb;
    const brightness = 5 + Math.max(0, Math.min(1, ratio)) * 115;
    // Map 0-120 hardware scale to 15-240 for browser visibility
    const displayRed = Math.floor(15 + ratio * 225);
    updateNeoPixelRingUI({ r: displayRed, g: 0, b: 0 }, ratio > 0.05);
  }

  // 4. Update History Chart Array
  telemetryHistory.push({
    time: now,
    direct: directLb,
    tq: tqAvgLb
  });
  
  if (telemetryHistory.length > CONSTANTS.maxPoints) {
    telemetryHistory.shift();
  }
  
  drawChart();
}

// Canvas Drawing function
function drawChart() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  
  // Handle device pixel ratio scaling
  const dpr = window.devicePixelRatio || 1;
  if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
  }
  
  ctx.clearRect(0, 0, width, height);

  const padding = { top: 20, right: 20, bottom: 20, left: 30 };
  const graphWidth = width - padding.left - padding.right;
  const graphHeight = height - padding.top - padding.bottom;

  // Max scale representation (0 to 20 lbs)
  const maxVal = 20.0;

  // Helper coordinate mapper
  const getX = (index) => padding.left + (index / (CONSTANTS.maxPoints - 1)) * graphWidth;
  const getY = (val) => padding.top + graphHeight - (Math.max(0, Math.min(maxVal, val)) / maxVal) * graphHeight;

  // 1. Draw Grid Lines & Labels
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#8a99ad';
  ctx.font = '9px Orbitron';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';

  const gridLines = [0, 5, 10, 15, 20];
  gridLines.forEach(v => {
    const y = getY(v);
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
    
    // Add text labels
    ctx.fillText(`${v} lb`, padding.left - 6, y);
  });

  // 2. Draw Stop Pressure Threshold Limit Line (16 lbs)
  const thresholdY = getY(CONSTANTS.thresholdLb);
  ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([5, 4]);
  ctx.beginPath();
  ctx.moveTo(padding.left, thresholdY);
  ctx.lineTo(width - padding.right, thresholdY);
  ctx.stroke();
  ctx.setLineDash([]); // Reset dash

  // Text label for target line
  ctx.fillStyle = '#00f0ff';
  ctx.textAlign = 'left';
  ctx.fillText('TARGET (16.0 lb)', padding.left + 5, thresholdY - 8);

  if (telemetryHistory.length < 2) return;

  // Fill in coordinates
  const points = [];
  const startIdx = CONSTANTS.maxPoints - telemetryHistory.length;
  
  telemetryHistory.forEach((pt, idx) => {
    points.push({
      x: getX(startIdx + idx),
      yDirect: getY(pt.direct),
      yTq: getY(pt.tq)
    });
  });

  // 3. Draw Direct Line (Red)
  ctx.beginPath();
  ctx.strokeStyle = '#ff3b30';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.moveTo(points[0].x, points[0].yDirect);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].yDirect);
  }
  ctx.stroke();

  // Draw gradient fill for Direct Pressure
  ctx.lineTo(points[points.length - 1].x, padding.top + graphHeight);
  ctx.lineTo(points[0].x, padding.top + graphHeight);
  ctx.closePath();
  const directGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
  directGrad.addColorStop(0, 'rgba(255, 59, 48, 0.08)');
  directGrad.addColorStop(1, 'rgba(255, 59, 48, 0)');
  ctx.fillStyle = directGrad;
  ctx.fill();

  // 4. Draw Tourniquet Line (Cyan)
  ctx.beginPath();
  ctx.strokeStyle = '#00f0ff';
  ctx.lineWidth = 3.0;
  ctx.lineJoin = 'round';
  ctx.moveTo(points[0].x, points[0].yTq);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].yTq);
  }
  ctx.stroke();

  // Draw gradient fill for Tourniquet Pressure
  ctx.lineTo(points[points.length - 1].x, padding.top + graphHeight);
  ctx.lineTo(points[0].x, padding.top + graphHeight);
  ctx.closePath();
  const tqGrad = ctx.createLinearGradient(0, padding.top, 0, padding.top + graphHeight);
  tqGrad.addColorStop(0, 'rgba(0, 240, 255, 0.12)');
  tqGrad.addColorStop(1, 'rgba(0, 240, 255, 0)');
  ctx.fillStyle = tqGrad;
  ctx.fill();
}

// Log Terminal Handler
function appendLog(text, type = 'rx') {
  const line = document.createElement('div');
  line.classList.add('terminal-line', type);
  
  const timestamp = new Date().toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
  line.innerText = `[${timestamp}] ${text}`;
  
  serialTerminal.appendChild(line);
  
  // Limit buffer size to 120 lines to keep performance high
  while (serialTerminal.children.length > 120) {
    serialTerminal.removeChild(serialTerminal.firstChild);
  }
  
  // Scroll to bottom
  serialTerminal.scrollTop = serialTerminal.scrollHeight;
}

// Web Serial Connection Logic
async function connectSerial() {
  if (!('serial' in navigator)) {
    alert('Web Serial is not supported in this browser. Please use Chrome, Edge, or Opera.');
    appendLog('Web Serial API unsupported on this browser.', 'error-msg');
    return;
  }

  try {
    serialPort = await navigator.serial.requestPort();
    await serialPort.open({ baudRate: 115200 });
    
    keepReading = true;
    btnConnect.innerHTML = `
      <svg class="btn-icon icon-pulse" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="2" y1="12" x2="22" y2="12"/>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
      </svg>
      DISCONNECT
    `;
    btnConnect.classList.replace('btn-primary', 'btn-secondary');
    
    connectionStatus.className = 'status-indicator connected';
    connectionStatus.querySelector('.status-label').innerText = 'CONNECTED';
    appendLog('Successfully connected to microcontroller.', 'system-msg');
    
    // Disable offline simulator if active
    if (isSimulationMode) {
      toggleSimulation();
    }

    readSerialLoop();
  } catch (error) {
    console.error('Error connecting to serial port:', error);
    appendLog(`Failed to connect: ${error.message}`, 'error-msg');
  }
}

async function disconnectSerial() {
  keepReading = false;
  
  if (serialReader) {
    try {
      await serialReader.cancel();
    } catch (e) {}
  }
  
  if (serialPort) {
    try {
      await serialPort.close();
    } catch (e) {}
    serialPort = null;
  }
  
  btnConnect.innerHTML = `
    <svg class="btn-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
      <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
      <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
      <line x1="6" y1="6" x2="6.01" y2="6"/>
      <line x1="6" y1="18" x2="6.01" y2="18"/>
    </svg>
    CONNECT DEVICE
  `;
  btnConnect.classList.replace('btn-secondary', 'btn-primary');
  
  connectionStatus.className = 'status-indicator disconnected';
  connectionStatus.querySelector('.status-label').innerText = 'DISCONNECTED';
  appendLog('Serial device disconnected.', 'system-msg');
}

// Main serial read loop
async function readSerialLoop() {
  while (serialPort && serialPort.readable && keepReading) {
    const textDecoder = new TextDecoderStream();
    const readableStreamClosed = serialPort.readable.pipeTo(textDecoder.writable);
    const reader = textDecoder.readable.getReader();
    serialReader = reader;
    
    let buffer = '';
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        buffer += value;
        
        // Split by lines
        let lines = buffer.split(/\r?\n/);
        buffer = lines.pop(); // Keep partial line in buffer
        
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.length > 0) {
            appendLog(trimmed, 'rx');
            parseAndProcessLine(trimmed);
          }
        }
      }
    } catch (error) {
      console.error('Serial read loop error:', error);
      if (keepReading) {
        appendLog(`Connection lost: ${error.message}`, 'error-msg');
        disconnectSerial();
      }
      break;
    } finally {
      reader.releaseLock();
      try {
        await readableStreamClosed;
      } catch (e) {}
    }
  }
}

// Parser: extracts numbers from printed line
// Direct ADC: 0 | Direct lb: 0.00 | T1: 0 | T2: 0 | T3: 0 | T4: 0 | Tourniquet Avg: 0 | Tourniquet lb: 0.00
function parseAndProcessLine(line) {
  try {
    const regex = /Direct ADC:\s*(\d+)\s*\|\s*Direct lb:\s*([\d.]+)\s*\|\s*T1:\s*(\d+)\s*\|\s*T2:\s*(\d+)\s*\|\s*T3:\s*(\d+)\s*\|\s*T4:\s*(\d+)\s*\|\s*Tourniquet Avg:\s*(\d+)\s*\|\s*Tourniquet lb:\s*([\d.]+)/i;
    const match = line.match(regex);
    
    if (match) {
      const data = {
        directAdc: parseInt(match[1]),
        directLb: parseFloat(match[2]),
        t1: parseInt(match[3]),
        t2: parseInt(match[4]),
        t3: parseInt(match[5]),
        t4: parseInt(match[6]),
        tqAvgAdc: parseInt(match[7]),
        tqAvgLb: parseFloat(match[8])
      };
      
      updateTelemetryData(data);
    }
  } catch (err) {
    console.error('Line parsing failed:', err, line);
  }
}

// Simulation Engine Mode
function toggleSimulation() {
  isSimulationMode = !isSimulationMode;
  
  if (isSimulationMode) {
    // Enable sim UI
    btnToggleSim.innerText = 'DISABLE SIMULATION';
    btnToggleSim.classList.add('active');
    simPanel.classList.remove('collapsed');
    
    connectionStatus.className = 'status-indicator simulating';
    connectionStatus.querySelector('.status-label').innerText = 'SIMULATING';
    
    if (serialPort) {
      disconnectSerial();
    }
    
    appendLog('Offline simulation mode enabled.', 'system-msg');
    
    // Start periodic update interval (similar to hardware speed - ~150ms)
    simIntervalId = setInterval(runSimulationTick, 150);
  } else {
    // Disable sim UI
    btnToggleSim.innerText = 'ENABLE SIMULATION';
    btnToggleSim.classList.remove('active');
    simPanel.classList.add('collapsed');
    
    connectionStatus.className = 'status-indicator disconnected';
    connectionStatus.querySelector('.status-label').innerText = 'DISCONNECTED';
    
    if (simIntervalId) {
      clearInterval(simIntervalId);
      simIntervalId = null;
    }
    
    // Clear sliders & reset values
    sliderDirect.value = 0;
    sliderT1.value = 0;
    sliderT2.value = 0;
    sliderT3.value = 0;
    sliderT4.value = 0;
    updateSlidersLabels();
    
    // Reset state machines
    stopPressureActive = false;
    successAchieved = false;
    
    appendLog('Simulation mode disabled.', 'system-msg');
    updateTelemetryData({
      directAdc: 0,
      directLb: 0.0,
      t1: 0, t2: 0, t3: 0, t4: 0,
      tqAvgAdc: 0,
      tqAvgLb: 0.0
    });
  }
}

function updateSlidersLabels() {
  const dVal = parseInt(sliderDirect.value);
  const dLb = dVal / CONSTANTS.directScale;
  lblSimDirect.innerText = `${dVal} / ${dLb.toFixed(2)} lb`;
  
  lblSimT1.innerText = sliderT1.value;
  lblSimT2.innerText = sliderT2.value;
  lblSimT3.innerText = sliderT3.value;
  lblSimT4.innerText = sliderT4.value;
}

function runSimulationTick() {
  const dVal = parseInt(sliderDirect.value);
  const t1 = parseInt(sliderT1.value);
  const t2 = parseInt(sliderT2.value);
  const t3 = parseInt(sliderT3.value);
  const t4 = parseInt(sliderT4.value);
  
  const dLb = dVal / CONSTANTS.directScale;
  const tqAvg = Math.floor((t1 + t2 + t3 + t4) / 4);
  const tqLb = tqAvg / CONSTANTS.tqScale;
  
  const simulatedData = {
    directAdc: dVal,
    directLb: dLb,
    t1: t1,
    t2: t2,
    t3: t3,
    t4: t4,
    tqAvgAdc: tqAvg,
    tqAvgLb: tqLb
  };
  
  // Format log output identical to firmware serial printing
  const logString = `Direct ADC: ${dVal} | Direct lb: ${dLb.toFixed(2)} | T1: ${t1} | T2: ${t2} | T3: ${t3} | T4: ${t4} | Tourniquet Avg: ${tqAvg} | Tourniquet lb: ${tqLb.toFixed(2)}`;
  appendLog(logString, 'rx');
  
  // Feed into display updates
  updateTelemetryData(simulatedData);
}

// Window resizing
window.addEventListener('resize', () => {
  drawChart();
});

// Event Listeners
btnConnect.addEventListener('click', () => {
  if (serialPort) {
    disconnectSerial();
  } else {
    connectSerial();
  }
});

btnToggleSim.addEventListener('click', toggleSimulation);

btnClearLog.addEventListener('click', () => {
  serialTerminal.innerHTML = '';
  appendLog('Console logs cleared.', 'system-msg');
});

btnCopyLog.addEventListener('click', () => {
  const lines = Array.from(serialTerminal.querySelectorAll('.terminal-line'))
                     .map(l => l.innerText)
                     .join('\n');
  navigator.clipboard.writeText(lines)
    .then(() => {
      const prevText = btnCopyLog.innerText;
      btnCopyLog.innerText = 'Copied!';
      setTimeout(() => btnCopyLog.innerText = prevText, 1500);
    })
    .catch(err => {
      console.error('Failed to copy text: ', err);
    });
});

// Slider Input Listeners to instantly update label values
[sliderDirect, sliderT1, sliderT2, sliderT3, sliderT4].forEach(slider => {
  slider.addEventListener('input', updateSlidersLabels);
});

// Initial Setup
initNeoPixelRing();
updateSlidersLabels();
drawChart();
updateTelemetryData({
  directAdc: 0,
  directLb: 0.0,
  t1: 0, t2: 0, t3: 0, t4: 0,
  tqAvgAdc: 0,
  tqAvgLb: 0.0
});
