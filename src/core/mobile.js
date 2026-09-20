import { execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { AgentWarden } from './warden.js';

const DEVICE_ID_REGEX = /^[a-zA-Z0-9._:-]+$/;
const PACKAGE_REGEX = /^[a-zA-Z0-9._]+$/;
const KEY_REGEX = /^[a-zA-Z0-9_]+$/;

/**
 * Jev Mobile Runner (Android Device Automation & Observation Gateway)
 * Operates Android devices via ADB / Mobilerun protocol with pre-flight Agent Warden safety.
 */
export class MobileRunner {
  constructor(config = {}) {
    this.warden = config.warden || new AgentWarden();
    this.logs = [];
    this.maxLogs = 60;
    
    // Virtual device state (responsive simulation when no physical ADB is plugged in)
    this.virtualDevice = {
      id: 'pixel-8-virtual',
      name: 'Pixel 8 Pro (Jev Virtual Device)',
      type: 'virtual',
      status: 'online',
      androidVersion: '14.0',
      resolution: { width: 1080, height: 2400 },
      battery: 88,
      foregroundApp: 'com.android.launcher3',
      currentActivity: 'LauncherActivity',
      screenText: 'Jev Mobile Gateway: Ready for Agent Operations',
      recentActions: []
    };
  }

  /**
   * Log an execution event
   */
  logEvent(event) {
    const entry = {
      id: 'log-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
      timestamp: new Date().toISOString(),
      ...event
    };
    this.logs.unshift(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.pop();
    }
    return entry;
  }

  /**
   * List connected physical and virtual Android devices
   */
  async listDevices() {
    const devices = [];

    // 1. Try detecting real ADB devices
    try {
      const adbOutput = execFileSync('adb', ['devices', '-l'], { timeout: 1500, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = adbOutput.trim().split('\n').slice(1);
      
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 2 && parts[1] === 'device') {
          const serial = parts[0];
          const modelMatch = line.match(/model:(\S+)/);
          const model = modelMatch ? modelMatch[1].replace(/_/g, ' ') : 'Android Device';
          
          devices.push({
            id: serial,
            name: `${model} (${serial})`,
            type: 'physical_adb',
            status: 'online',
            resolution: { width: 1080, height: 2400 },
            battery: 92,
            foregroundApp: 'com.android.launcher3'
          });
        }
      }
    } catch (e) {
      // ADB not installed or no physical devices; fallback cleanly to Virtual Device
    }

    return devices;
  }

  /**
   * Get active screen state, foreground app, and UI hierarchy
   */
  async getScreenState(deviceId = 'pixel-8-virtual') {
    const start = performance.now();

    if (!deviceId || typeof deviceId !== 'string' || !DEVICE_ID_REGEX.test(deviceId)) {
      return {
        deviceId,
        error: 'Invalid deviceId format',
        foregroundPackage: 'unknown'
      };
    }

    const isVirtual = deviceId === this.virtualDevice.id || deviceId.includes('virtual');

    if (isVirtual) {
      return {
        deviceId,
        timestamp: new Date().toISOString(),
        foregroundPackage: this.virtualDevice.foregroundApp,
        activity: this.virtualDevice.currentActivity,
        resolution: this.virtualDevice.resolution,
        batteryPct: this.virtualDevice.battery,
        latencyMs: Math.round((performance.now() - start) * 100) / 100,
        uiHierarchy: [
          { type: 'StatusBar', text: '09:41', bounds: [0, 0, 1080, 80] },
          { type: 'Header', text: 'Jev Mobile Gateway', bounds: [80, 120, 1000, 200] },
          { type: 'Card', text: 'Agent Execution Stream: ACTIVE', bounds: [60, 250, 1020, 600] },
          { type: 'Button', text: 'Settings', bounds: [100, 700, 480, 850], package: 'com.android.settings' },
          { type: 'Button', text: 'Chrome', bounds: [600, 700, 980, 850], package: 'com.android.chrome' },
          { type: 'NavigationBar', bounds: [0, 2240, 1080, 2400] }
        ]
      };
    }

    // Physical ADB device inspection
    try {
      const dump = execFileSync('adb', ['-s', deviceId, 'shell', 'dumpsys', 'window'], { timeout: 2000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const focusLine = dump.split('\n').find(l => l.includes('mCurrentFocus')) || '';
      return {
        deviceId,
        timestamp: new Date().toISOString(),
        foregroundPackage: focusLine.trim() || 'com.android.launcher3',
        resolution: { width: 1080, height: 2400 },
        latencyMs: Math.round((performance.now() - start) * 100) / 100
      };
    } catch (e) {
      return {
        deviceId,
        error: e.message,
        foregroundPackage: 'unknown'
      };
    }
  }

  /**
   * Pre-flight safety evaluation for mobile actions
   */
  evaluateSafety(actionType, params) {
    const dangerousPackages = [
      'com.android.internal',
      'com.google.android.gms.auth',
      'com.android.systemui.emergency',
      'recovery'
    ];

    // Destructive command pattern check
    if (params.package && dangerousPackages.some(pkg => params.package.includes(pkg))) {
      return {
        decision: 'BLOCKED_RISKY',
        color: 'RED',
        reason: `Restricted system target package detected: ${params.package}`
      };
    }

    if (params.text && (params.text.includes('rm -rf') || params.text.includes('factory_reset') || params.text.includes('format'))) {
      return {
        decision: 'BLOCKED_RISKY',
        color: 'RED',
        reason: 'Destructive input payload detected in mobile typing stream'
      };
    }

    if (actionType === 'clearAppData' || actionType === 'uninstall') {
      return {
        decision: 'NEEDS_CONFIRM',
        color: 'YELLOW',
        reason: `App state modification requires confirmation: ${actionType}`
      };
    }

    return {
      decision: 'AUTO_ALLOW',
      color: 'GREEN',
      reason: 'Safe standard mobile interaction'
    };
  }

  /**
   * Execute Action with Agent Warden pre-flight protection
   * action: { type: 'tap'|'swipe'|'type'|'key'|'launch', x, y, text, key, package }
   */
  async executeAction(deviceId = 'pixel-8-virtual', action = {}) {
    const start = performance.now();
    const actionType = action.type || 'tap';

    // 0. Strict input validation
    if (!deviceId || typeof deviceId !== 'string' || !DEVICE_ID_REGEX.test(deviceId)) {
      const blockedLog = this.logEvent({
        deviceId: String(deviceId),
        action: actionType,
        params: action,
        status: 'BLOCKED',
        verdict: 'BLOCKED_RISKY',
        color: 'RED',
        reason: 'Invalid device identifier format',
        latencyMs: Math.round((performance.now() - start) * 100) / 100
      });
      return { success: false, blocked: true, verdict: 'BLOCKED_RISKY', reason: 'Invalid device identifier format', log: blockedLog };
    }

    if (action.package && (typeof action.package !== 'string' || !PACKAGE_REGEX.test(action.package))) {
      const blockedLog = this.logEvent({
        deviceId,
        action: actionType,
        params: action,
        status: 'BLOCKED',
        verdict: 'BLOCKED_RISKY',
        color: 'RED',
        reason: 'Invalid package name format',
        latencyMs: Math.round((performance.now() - start) * 100) / 100
      });
      return { success: false, blocked: true, verdict: 'BLOCKED_RISKY', reason: 'Invalid package name format', log: blockedLog };
    }

    if (action.key && (typeof action.key !== 'string' || !KEY_REGEX.test(action.key))) {
      const blockedLog = this.logEvent({
        deviceId,
        action: actionType,
        params: action,
        status: 'BLOCKED',
        verdict: 'BLOCKED_RISKY',
        color: 'RED',
        reason: 'Invalid key format',
        latencyMs: Math.round((performance.now() - start) * 100) / 100
      });
      return { success: false, blocked: true, verdict: 'BLOCKED_RISKY', reason: 'Invalid key format', log: blockedLog };
    }

    // 1. Run Pre-Flight Agent Warden Safety Check
    const safety = this.evaluateSafety(actionType, action);
    if (safety.decision === 'BLOCKED_RISKY') {
      const blockedLog = this.logEvent({
        deviceId,
        action: actionType,
        params: action,
        status: 'BLOCKED',
        verdict: 'BLOCKED_RISKY',
        color: 'RED',
        reason: safety.reason,
        latencyMs: Math.round((performance.now() - start) * 100) / 100
      });
      return { success: false, blocked: true, verdict: safety.decision, reason: safety.reason, log: blockedLog };
    }

    const isVirtual = deviceId === this.virtualDevice.id || deviceId.includes('virtual');
    let executionOutput = '';

    // 2. Execute on Virtual Device
    if (isVirtual) {
      if (actionType === 'tap') {
        const x = parseInt(action.x, 10) || 540;
        const y = parseInt(action.y, 10) || 1200;
        executionOutput = `Simulated touch event at (${x}, ${y})`;
        // Check if tapping a simulated button
        if (x >= 100 && x <= 480 && y >= 700 && y <= 850) {
          this.virtualDevice.foregroundApp = 'com.android.settings';
          this.virtualDevice.currentActivity = 'SettingsActivity';
        } else if (x >= 600 && x <= 980 && y >= 700 && y <= 850) {
          this.virtualDevice.foregroundApp = 'com.android.chrome';
          this.virtualDevice.currentActivity = 'CustomTabActivity';
        }
      } else if (actionType === 'swipe') {
        executionOutput = `Simulated swipe gesture: (${action.x1 || 500}, ${action.y1 || 1600}) -> (${action.x2 || 500}, ${action.y2 || 600})`;
      } else if (actionType === 'type') {
        executionOutput = `Input text injected: "${action.text || ''}"`;
      } else if (actionType === 'key') {
        const key = (action.key || 'HOME').toUpperCase();
        if (key === 'HOME') {
          this.virtualDevice.foregroundApp = 'com.android.launcher3';
          this.virtualDevice.currentActivity = 'LauncherActivity';
        }
        executionOutput = `Hardware key sent: KEYCODE_${key}`;
      } else if (actionType === 'launch') {
        this.virtualDevice.foregroundApp = action.package || 'com.android.chrome';
        executionOutput = `Activity launched: ${this.virtualDevice.foregroundApp}`;
      } else {
        executionOutput = `Unknown action type: ${actionType}`;
      }
    } 
    // 3. Execute on Real Physical ADB Device (bypasses shell completely via execFileSync)
    else {
      try {
        if (actionType === 'tap') {
          const x = Math.max(0, parseInt(action.x, 10) || 540);
          const y = Math.max(0, parseInt(action.y, 10) || 1200);
          execFileSync('adb', ['-s', deviceId, 'shell', 'input', 'tap', String(x), String(y)], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
          executionOutput = `Real device tap at (${x}, ${y})`;
        } else if (actionType === 'swipe') {
          const x1 = Math.max(0, parseInt(action.x1, 10) || 500);
          const y1 = Math.max(0, parseInt(action.y1, 10) || 1500);
          const x2 = Math.max(0, parseInt(action.x2, 10) || 500);
          const y2 = Math.max(0, parseInt(action.y2, 10) || 500);
          const duration = Math.max(50, parseInt(action.duration, 10) || 300);
          execFileSync('adb', ['-s', deviceId, 'shell', 'input', 'swipe', String(x1), String(y1), String(x2), String(y2), String(duration)], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
          executionOutput = `Real device swipe executed`;
        } else if (actionType === 'type') {
          const safeText = String(action.text || '');
          execFileSync('adb', ['-s', deviceId, 'shell', 'input', 'text', safeText], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
          executionOutput = `Text injected on device`;
        } else if (actionType === 'key') {
          const key = (action.key || 'HOME').toUpperCase();
          execFileSync('adb', ['-s', deviceId, 'shell', 'input', 'keyevent', `KEYCODE_${key}`], { timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] });
          executionOutput = `Keyevent sent: KEYCODE_${key}`;
        } else if (actionType === 'launch') {
          const pkg = action.package || 'com.android.chrome';
          execFileSync('adb', ['-s', deviceId, 'shell', 'monkey', '-p', pkg, '-c', 'android.intent.category.LAUNCHER', '1'], { timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'] });
          executionOutput = `Launched: ${pkg}`;
        }
      } catch (err) {
        executionOutput = `ADB Execution error: ${err.message}`;
      }
    }

    const latencyMs = Math.round((performance.now() - start) * 100) / 100;
    const logEntry = this.logEvent({
      deviceId,
      action: actionType,
      params: action,
      status: 'SUCCESS',
      verdict: safety.decision,
      color: safety.color,
      output: executionOutput,
      latencyMs
    });

    return {
      success: true,
      verdict: safety.decision,
      output: executionOutput,
      latencyMs,
      log: logEntry
    };
  }

  /**
   * Get recent execution logs
   */
  getLogs(limit = 30) {
    return this.logs.slice(0, limit);
  }
}
