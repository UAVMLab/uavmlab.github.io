import { MotorTelemetry, MotorStatus } from '../types';

// Interface definitions for Web Bluetooth API
interface BluetoothDevice extends EventTarget {
  id: string;
  name?: string;
  gatt?: BluetoothRemoteGATTServer;
}

interface BluetoothRemoteGATTServer {
  device: BluetoothDevice;
  connected: boolean;
  connect(): Promise<BluetoothRemoteGATTServer>;
  disconnect(): void;
  getPrimaryService(service: string): Promise<BluetoothRemoteGATTService>;
}

interface BluetoothRemoteGATTService {
  getCharacteristic(characteristic: string): Promise<BluetoothRemoteGATTCharacteristic>;
}

interface BluetoothRemoteGATTCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<BluetoothRemoteGATTCharacteristic>;
  writeValue(value: BufferSource): Promise<void>;
}

// Custom UUIDs for the ESP32 Service - In a real app these match the ESP32 firmware
const SERVICE_UUID = "4fafc201-1fb5-459e-8fcc-c5c9c331914b";
const CHARACTERISTIC_NOTIFY_UUID = "beb5483e-36e1-4688-b7f5-ea07361b26a8";
const CHARACTERISTIC_WRITE_UUID = "a8b3f46a-5c21-4870-891d-5564887332d7";

export class BluetoothService {
  private device: BluetoothDevice | null = null;
  private server: BluetoothRemoteGATTServer | null = null;
  private notifyChar: BluetoothRemoteGATTCharacteristic | null = null;
  private writeChar: BluetoothRemoteGATTCharacteristic | null = null;
  
  private onDataCallback: ((data: MotorTelemetry) => void) | null = null;
  private onDisconnectCallback: (() => void) | null = null;

  // Connection Logic
  async connect(): Promise<void> {
    const nav = navigator as any;
    if (!nav.bluetooth) {
      throw new Error("Web Bluetooth is not supported in this browser.");
    }

    // Changed from filtering by name to acceptAllDevices to ensure the device shows up in the picker
    // regardless of its advertised name (e.g. if it's just 'ESP32' or unnamed).
    this.device = await nav.bluetooth.requestDevice({
      acceptAllDevices: true,
      optionalServices: [SERVICE_UUID]
    });

    if (!this.device) throw new Error("No device selected");

    this.device.addEventListener('gattserverdisconnected', this.handleDisconnect.bind(this));

    this.server = await this.device.gatt?.connect() || null;
    if (!this.server) throw new Error("Could not connect to GATT Server");

    const service = await this.server.getPrimaryService(SERVICE_UUID);
    
    this.notifyChar = await service.getCharacteristic(CHARACTERISTIC_NOTIFY_UUID);
    this.writeChar = await service.getCharacteristic(CHARACTERISTIC_WRITE_UUID);

    await this.notifyChar.startNotifications();
    this.notifyChar.addEventListener('characteristicvaluechanged', this.handleNotification.bind(this));
  }

  async disconnect() {
    if (this.device && this.device.gatt?.connected) {
      this.device.gatt.disconnect();
    }
  }

  // Data Handling
  private handleNotification(event: Event) {
    const target = event.target as BluetoothRemoteGATTCharacteristic;
    if (!target.value) return;

    const data = this.parseTelemetry(target.value);
    if (this.onDataCallback && data) {
      this.onDataCallback(data);
    }
  }

  private handleDisconnect() {
    this.device = null;
    this.server = null;
    if (this.onDisconnectCallback) this.onDisconnectCallback();
  }

  // Helpers
  setDataHandler(callback: (data: MotorTelemetry) => void) {
    this.onDataCallback = callback;
  }

  setDisconnectHandler(callback: () => void) {
    this.onDisconnectCallback = callback;
  }

  // Outbound Commands
  async sendCommand(command: string): Promise<void> {
    if (!this.writeChar) return; // Silent fail in demo/disconnected
    const encoder = new TextEncoder();
    await this.writeChar.writeValue(encoder.encode(command));
  }

  // Parsing Logic (Assuming a simple JSON string or binary struct from ESP32)
  // For this example, we'll assume the ESP32 sends a JSON string for simplicity
  // Real high-freq apps would use a DataView/ArrayBuffer struct
  private parseTelemetry(value: DataView): MotorTelemetry | null {
    try {
      const decoder = new TextDecoder('utf-8');
      const jsonString = decoder.decode(value);
      const raw = JSON.parse(jsonString);
      
      return {
        timestamp: Date.now(),
        rpm: raw.r || 0,
        voltage: raw.v || 0,
        current: raw.i || 0,
        thrust: raw.t || 0,
        temperature: raw.tp || 0,
        throttle: raw.th || 0,
        status: raw.s || MotorStatus.IDLE,
        error: raw.err
      };
    } catch (e) {
      console.error("Failed to parse BT packet", e);
      return null;
    }
  }
}

export const bluetoothManager = new BluetoothService();