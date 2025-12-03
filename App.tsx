import React, { useState, useEffect, useCallback, useRef } from 'react';
import { bluetoothManager } from './services/bluetooth';
import { MotorTelemetry, MotorStatus, LogEntry, ConfigParams } from './types';
import { Dashboard } from './components/Dashboard';
import { Controls } from './components/Controls';
import { ConfigPanel } from './components/ConfigPanel';
import { Bluetooth, BluetoothConnected, LayoutDashboard, Sliders, Settings as SettingsIcon, Terminal, Download, Code, X, PlayCircle, AlertTriangle } from 'lucide-react';

const MOCK_DATA = false; // Set to true to force mock data without BT

function App() {
  // State
  const [isConnected, setIsConnected] = useState(false);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'controls' | 'config' | 'logs'>('dashboard');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [showFirmwareGuide, setShowFirmwareGuide] = useState(false);
  const [connectionError, setConnectionError] = useState<string | null>(null);
  const [isBluetoothSupported, setIsBluetoothSupported] = useState(true);
  
  // Telemetry State
  const [telemetry, setTelemetry] = useState<MotorTelemetry>({
    timestamp: Date.now(),
    rpm: 0,
    voltage: 12.6,
    current: 0,
    thrust: 0,
    temperature: 25,
    throttle: 0,
    status: MotorStatus.DISARMED
  });
  
  const [history, setHistory] = useState<MotorTelemetry[]>([]);
  const [config, setConfig] = useState<ConfigParams>({
    polePairs: 14,
    kvRating: 2300,
    currentLimit: 40,
    tempLimit: 85
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);

  // Simulation Interval Ref
  const demoInterval = useRef<number | null>(null);

  // Check Browser Support
  useEffect(() => {
    const nav = navigator as any;
    if (!nav.bluetooth) {
        setIsBluetoothSupported(false);
        addLog('warning', 'Web Bluetooth not supported in this browser. Use Chrome (Android/Desktop) or Bluefy (iOS).');
    }
  }, []);

  // Install Prompt Listener
  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setInstallPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    installPrompt.userChoice.then((choiceResult: any) => {
      if (choiceResult.outcome === 'accepted') {
        setInstallPrompt(null);
      }
    });
  };

  // Logging Helper
  const addLog = (type: LogEntry['type'], message: string) => {
    setLogs(prev => [{
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
      type,
      message
    }, ...prev].slice(0, 50));
  };

  // Bluetooth Handlers
  const handleConnect = async () => {
    setConnectionError(null);
    try {
      if (MOCK_DATA) {
         startSimulation();
         setIsConnected(true);
         addLog('success', 'Connected to Demo Motor Simulator');
         return;
      }

      await bluetoothManager.connect();
      setIsConnected(true);
      addLog('success', 'Bluetooth Connected to ESP32');
      
      bluetoothManager.setDataHandler((data) => {
        updateTelemetry(data);
      });

      bluetoothManager.setDisconnectHandler(() => {
        setIsConnected(false);
        addLog('warning', 'Device Disconnected');
        setTelemetry(prev => ({ ...prev, status: MotorStatus.DISARMED, rpm: 0, current: 0 }));
      });

    } catch (error: any) {
      console.error(error);
      const msg = error.message || "Unknown connection error";
      setConnectionError(msg);
      addLog('error', `Connection Failed: ${msg}`);
    }
  };

  const handleDisconnect = () => {
    if (demoInterval.current) {
        clearInterval(demoInterval.current);
        demoInterval.current = null;
    }
    bluetoothManager.disconnect();
    setIsConnected(false);
    addLog('info', 'Disconnected by user');
  };

  const updateTelemetry = (data: MotorTelemetry) => {
    setTelemetry(data);
    setHistory(prev => [...prev.slice(-30), data]); // Keep last 30 points
  };

  // Simulation Logic (For Demo)
  const startSimulation = () => {
    if (demoInterval.current) clearInterval(demoInterval.current);
    setConnectionError(null);
    setIsConnected(true);
    addLog('info', 'Started Demo Simulation Mode');
    
    let simThrottle = 0;
    let simRpm = 0;
    let simTemp = 25;

    demoInterval.current = window.setInterval(() => {
      setTelemetry(prev => {
        // Simple physics simulation
        const targetRpm = prev.status === MotorStatus.RUNNING ? prev.throttle * 250 : 0; // Max 25000 RPM
        simRpm = simRpm + (targetRpm - simRpm) * 0.1;
        
        // Thrust approx proportional to RPM squared
        const thrust = Math.pow(simRpm / 1000, 2) * 2.5; 
        
        // Current approx proportional to torque (thrust)
        const current = thrust * 0.05 + (simRpm > 100 ? 0.5 : 0);

        // Temp heating up
        if (current > 5) simTemp += 0.1;
        else simTemp = Math.max(25, simTemp - 0.1);

        const newData: MotorTelemetry = {
            timestamp: Date.now(),
            rpm: Math.round(simRpm + Math.random() * 50),
            voltage: 16.8 - (current * 0.05), // Voltage sag
            current: Math.max(0, parseFloat(current.toFixed(2))),
            thrust: Math.max(0, Math.round(thrust)),
            temperature: parseFloat(simTemp.toFixed(1)),
            throttle: prev.throttle,
            status: prev.status,
            error: simTemp > 80 ? 'OVERHEAT WARNING' : undefined
        };
        
        setHistory(h => [...h.slice(-30), newData]);
        return newData;
      });
    }, 100);
  };

  // Command Handlers
  const handleThrottleChange = (val: number) => {
    // In real app: sendCommand(`SET_THROTTLE:${val}`);
    // In demo, we update state which drives simulation
    setTelemetry(prev => ({ ...prev, throttle: val }));
    if (!MOCK_DATA && !demoInterval.current) {
        bluetoothManager.sendCommand(JSON.stringify({ cmd: 'THROTTLE', val }));
    }
  };

  const handleCommand = (cmd: string) => {
    addLog('info', `Sending Command: ${cmd}`);
    
    if (cmd === "ARM") {
        setTelemetry(prev => ({ ...prev, status: MotorStatus.RUNNING }));
    } else if (cmd === "DISARM") {
        setTelemetry(prev => ({ ...prev, status: MotorStatus.DISARMED, throttle: 0 }));
    } else if (cmd === "STOP") {
        setTelemetry(prev => ({ ...prev, throttle: 0 }));
    }

    if (!MOCK_DATA && !demoInterval.current) {
        bluetoothManager.sendCommand(JSON.stringify({ cmd }));
    }
  };

  const handleConfigSave = (newConfig: ConfigParams) => {
    setConfig(newConfig);
    addLog('success', 'Configuration Updated');
    if (!MOCK_DATA && !demoInterval.current) {
        bluetoothManager.sendCommand(JSON.stringify({ cmd: 'CONFIG', data: newConfig }));
    }
  };

  // Render
  return (
    <div className="min-h-screen bg-gray-900 text-gray-100 flex flex-col font-sans">
      
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 sticky top-0 z-50 safe-top">
        <div className="max-w-3xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-brand-600 flex items-center justify-center">
              <Wind className="text-white" size={18} />
            </div>
            <h1 className="font-bold text-lg tracking-tight">Aero<span className="text-brand-500">Dyne</span></h1>
          </div>
          
          <div className="flex gap-2">
            {installPrompt && (
              <button
                onClick={handleInstallClick}
                className="flex items-center gap-2 px-3 py-2 rounded-full text-xs font-medium bg-brand-600 text-white hover:bg-brand-500 transition-colors"
              >
                <Download size={14} /> Install App
              </button>
            )}
            <button
              onClick={isConnected ? handleDisconnect : handleConnect}
              className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all ${
                isConnected 
                  ? 'bg-brand-500/10 text-brand-500 border border-brand-500/50 hover:bg-brand-500/20' 
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              {isConnected ? <BluetoothConnected size={16} /> : <Bluetooth size={16} />}
              {isConnected ? 'Connected' : 'Connect'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto p-4">
          {!isConnected && !demoInterval.current ? (
             <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-fade-in">
                
                {/* Connection Error Banner */}
                {connectionError && (
                    <div className="w-full max-w-sm bg-red-900/20 border border-red-800 p-4 rounded-xl flex items-start gap-3 text-left">
                        <AlertTriangle className="text-red-500 shrink-0 mt-1" size={20} />
                        <div>
                            <h3 className="text-red-400 font-bold text-sm">Connection Failed</h3>
                            <p className="text-red-200 text-xs mt-1">{connectionError}</p>
                            <p className="text-gray-400 text-xs mt-2">Make sure your ESP32 is powered on and not connected to another device.</p>
                        </div>
                    </div>
                )}
                
                {/* Browser Warning */}
                {!isBluetoothSupported && (
                    <div className="w-full max-w-sm bg-amber-900/20 border border-amber-800 p-4 rounded-xl flex items-start gap-3 text-left">
                        <AlertTriangle className="text-amber-500 shrink-0 mt-1" size={20} />
                        <div>
                            <h3 className="text-amber-400 font-bold text-sm">Browser Not Supported</h3>
                            <p className="text-amber-200 text-xs mt-1">
                                Web Bluetooth is not supported on this browser (e.g., iOS Safari). 
                            </p>
                            <p className="text-gray-400 text-xs mt-2">
                                For iOS, please use the <strong>Bluefy</strong> app. For Android/PC, use <strong>Chrome</strong>.
                            </p>
                        </div>
                    </div>
                )}

                <div className="w-24 h-24 bg-gray-800 rounded-full flex items-center justify-center shadow-2xl relative">
                    <span className="absolute inset-0 rounded-full bg-brand-500 opacity-20 animate-ping"></span>
                    <Bluetooth size={48} className="text-brand-500 relative z-10" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Connect Device</h2>
                    <p className="text-gray-400 max-w-xs mx-auto text-sm">Pair with your ESP32 Motor Analyzer to view real-time telemetry and control the ESC.</p>
                </div>
                
                <div className="flex flex-col gap-3 w-full max-w-xs">
                    <button 
                        onClick={handleConnect} 
                        disabled={!isBluetoothSupported}
                        className="bg-brand-600 text-white w-full py-4 rounded-xl font-bold text-lg shadow-lg shadow-brand-500/20 hover:bg-brand-500 transition-all transform active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Start Connection
                    </button>
                    
                    <button 
                        onClick={startSimulation}
                        className="bg-gray-800 text-gray-300 w-full py-3 rounded-xl font-medium border border-gray-700 hover:bg-gray-700 transition-all flex items-center justify-center gap-2"
                    >
                        <PlayCircle size={18} /> Enter Demo Mode
                    </button>

                    <button 
                        onClick={() => setShowFirmwareGuide(true)}
                        className="text-gray-500 text-xs hover:text-brand-400 mt-4 flex items-center justify-center gap-1 transition-colors"
                    >
                        <Code size={14} /> Firmware Setup Guide
                    </button>
                </div>
             </div>
          ) : (
            <>
                {activeTab === 'dashboard' && <Dashboard data={telemetry} history={history} />}
                {activeTab === 'controls' && (
                    <Controls 
                        status={telemetry.status} 
                        throttle={telemetry.throttle} 
                        onThrottleChange={handleThrottleChange} 
                        onCommand={handleCommand}
                    />
                )}
                {activeTab === 'config' && <ConfigPanel config={config} onSave={handleConfigSave} />}
                {activeTab === 'logs' && (
                    <div className="space-y-4 pb-20">
                        {logs.length === 0 && <div className="text-center text-gray-500 mt-10">No logs yet...</div>}
                        {logs.map(log => (
                            <div key={log.id} className="flex gap-3 text-sm font-mono border-b border-gray-800 pb-2">
                                <span className="text-gray-500">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                <span className={`flex-1 ${
                                    log.type === 'error' ? 'text-red-400' : 
                                    log.type === 'success' ? 'text-green-400' : 
                                    log.type === 'warning' ? 'text-amber-400' : 'text-gray-300'
                                }`}>{log.message}</span>
                            </div>
                        ))}
                    </div>
                )}
            </>
          )}
        </div>
      </main>

      {/* Firmware Guide Modal */}
      {showFirmwareGuide && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="bg-gray-900 w-full max-w-lg max-h-[90vh] rounded-2xl border border-gray-700 flex flex-col shadow-2xl overflow-hidden">
                <div className="p-4 border-b border-gray-700 flex justify-between items-center bg-gray-800">
                    <h3 className="font-bold text-white flex items-center gap-2">
                        <Code size={18} className="text-brand-500"/> ESP32 Firmware Setup
                    </h3>
                    <button onClick={() => setShowFirmwareGuide(false)} className="text-gray-400 hover:text-white p-2">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto space-y-6 text-sm">
                    <div>
                        <h4 className="text-brand-400 font-bold mb-2">1. Required UUIDs</h4>
                        <div className="bg-gray-950 p-4 rounded-lg font-mono text-xs text-gray-300 space-y-2 border border-gray-800">
                            <p><span className="text-gray-500">Service:</span><br/>4fafc201-1fb5-459e-8fcc-c5c9c331914b</p>
                            <p><span className="text-gray-500">Notify Char (Telemetry):</span><br/>beb5483e-36e1-4688-b7f5-ea07361b26a8</p>
                            <p><span className="text-gray-500">Write Char (Commands):</span><br/>a8b3f46a-5c21-4870-891d-5564887332d7</p>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-brand-400 font-bold mb-2">2. JSON Data Format (Notification)</h4>
                        <p className="text-gray-400 mb-2 text-xs">Send this JSON string via the Notify Characteristic:</p>
                        <pre className="bg-gray-950 p-4 rounded-lg font-mono text-xs text-green-400 overflow-x-auto border border-gray-800">
{`{
  "r": 12000,    // RPM
  "v": 16.8,     // Voltage
  "i": 12.5,     // Current (A)
  "t": 850,      // Thrust (g)
  "tp": 45.2,    // Temp (C)
  "th": 50,      // Throttle %
  "s": "RUNNING" // Status
}`}
                        </pre>
                    </div>

                    <div>
                        <h4 className="text-brand-400 font-bold mb-2">3. Command Handling</h4>
                        <p className="text-gray-400 mb-2 text-xs">App sends these strings to Write Characteristic:</p>
                        <div className="space-y-2">
                            <div className="flex gap-2 items-center"><span className="bg-gray-800 px-2 py-1 rounded text-xs font-mono">ARM</span> <span className="text-gray-500">- Enable motor</span></div>
                            <div className="flex gap-2 items-center"><span className="bg-gray-800 px-2 py-1 rounded text-xs font-mono">DISARM</span> <span className="text-gray-500">- Disable motor</span></div>
                            <div className="flex gap-2 items-center"><span className="bg-gray-800 px-2 py-1 rounded text-xs font-mono">{"{\"cmd\":\"THROTTLE\",\"val\":50}"}</span></div>
                        </div>
                    </div>
                </div>
                <div className="p-4 border-t border-gray-800 bg-gray-800/50 text-center">
                    <button onClick={() => setShowFirmwareGuide(false)} className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
                        Close Guide
                    </button>
                </div>
            </div>
        </div>
      )}

      {/* Navigation Bar */}
      {isConnected && (
        <nav className="bg-gray-800 border-t border-gray-700 fixed bottom-0 w-full z-40 safe-bottom">
            <div className="max-w-3xl mx-auto flex justify-around">
                <NavButton 
                    active={activeTab === 'dashboard'} 
                    onClick={() => setActiveTab('dashboard')} 
                    icon={<LayoutDashboard size={20} />} 
                    label="Monitor" 
                />
                <NavButton 
                    active={activeTab === 'controls'} 
                    onClick={() => setActiveTab('controls')} 
                    icon={<Sliders size={20} />} 
                    label="Control" 
                />
                <NavButton 
                    active={activeTab === 'config'} 
                    onClick={() => setActiveTab('config')} 
                    icon={<SettingsIcon size={20} />} 
                    label="Config" 
                />
                <NavButton 
                    active={activeTab === 'logs'} 
                    onClick={() => setActiveTab('logs')} 
                    icon={<Terminal size={20} />} 
                    label="Logs" 
                />
            </div>
        </nav>
      )}
    </div>
  );
}

const NavButton = ({ active, onClick, icon, label }: any) => (
    <button 
        onClick={onClick} 
        className={`flex-1 py-3 flex flex-col items-center gap-1 text-[10px] font-medium transition-colors ${
            active ? 'text-brand-400' : 'text-gray-500 hover:text-gray-300'
        }`}
    >
        {icon}
        <span>{label}</span>
    </button>
);

// Lucide icon helper for the header logo
const Wind = ({ className, size }: {className?: string, size?: number}) => (
    <svg 
        xmlns="http://www.w3.org/2000/svg" 
        width={size} 
        height={size} 
        viewBox="0 0 24 24" 
        fill="none" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round" 
        className={className}
    >
        <path d="M17.7 7.7a2.5 2.5 0 1 1 1.8 4.3H2" />
        <path d="M9.6 4.6A2 2 0 1 1 11 8H2" />
        <path d="M12.6 19.4A2 2 0 1 0 14 16H2" />
    </svg>
);

export default App;