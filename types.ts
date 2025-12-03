export interface MotorTelemetry {
  timestamp: number;
  rpm: number;
  voltage: number;
  current: number;
  thrust: number; // in grams
  temperature: number; // in Celsius
  throttle: number; // 0-100%
  status: MotorStatus;
  error?: string;
}

export enum MotorStatus {
  DISARMED = 'DISARMED',
  IDLE = 'IDLE',
  RUNNING = 'RUNNING',
  ERROR = 'ERROR',
  CALIBRATING = 'CALIBRATING'
}

export interface ConfigParams {
  polePairs: number;
  kvRating: number;
  currentLimit: number;
  tempLimit: number;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  type: 'info' | 'warning' | 'error' | 'success';
  message: string;
}