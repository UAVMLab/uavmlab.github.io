import React, { useState, useEffect, useCallback } from 'react';
import { MotorStatus } from '../types';
import { Power, ShieldAlert, ShieldCheck, PlayCircle, StopCircle, RefreshCw } from 'lucide-react';

interface ControlsProps {
  status: MotorStatus;
  throttle: number;
  onThrottleChange: (val: number) => void;
  onCommand: (cmd: string) => void;
}

export const Controls: React.FC<ControlsProps> = ({ status, throttle, onThrottleChange, onCommand }) => {
  const [localThrottle, setLocalThrottle] = useState(throttle);
  const isArmed = status !== MotorStatus.DISARMED;

  // Debounce logic for throttle could go here, but for smooth UI we update local state immediately
  // and parent handles the transmission rate limiting if needed.
  useEffect(() => {
    setLocalThrottle(throttle);
  }, [throttle]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!isArmed) return;
    const val = parseInt(e.target.value);
    setLocalThrottle(val);
    onThrottleChange(val);
  };

  const stopMotor = () => {
    setLocalThrottle(0);
    onThrottleChange(0);
    onCommand("STOP");
  };

  const toggleArm = () => {
    if (isArmed) {
      onCommand("DISARM");
    } else {
      onCommand("ARM");
    }
  };

  const startTestSequence = () => {
    if (!isArmed) return;
    // Example: send a command to run an automated sweep on the ESP32
    onCommand("AUTO_SWEEP");
  };

  return (
    <div className="flex flex-col h-full space-y-8 pb-24">
      
      {/* Arming Section */}
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 shadow-lg flex flex-col items-center justify-center gap-4">
        <div className="text-center">
            <h2 className="text-gray-300 font-medium mb-1">Safety Lock</h2>
            <p className="text-xs text-gray-500">Motor must be armed before operation</p>
        </div>
        
        <button
          onClick={toggleArm}
          className={`w-full max-w-xs py-4 rounded-xl font-bold text-lg flex items-center justify-center gap-3 transition-all transform active:scale-95 ${
            isArmed 
              ? 'bg-red-500/10 text-red-500 border-2 border-red-500 hover:bg-red-500 hover:text-white' 
              : 'bg-emerald-500 text-white shadow-emerald-500/30 shadow-lg hover:bg-emerald-400'
          }`}
        >
          {isArmed ? <ShieldAlert size={24} /> : <ShieldCheck size={24} />}
          {isArmed ? 'DISARM SYSTEM' : 'ARM SYSTEM'}
        </button>
      </div>

      {/* Throttle Control */}
      <div className={`flex-1 bg-gray-800 rounded-xl p-6 border border-gray-700 relative ${!isArmed ? 'opacity-50 pointer-events-none grayscale' : ''}`}>
        <div className="absolute top-4 left-6 right-6 flex justify-between items-center">
             <span className="text-cyan-400 font-bold tracking-wider">THROTTLE</span>
             <span className="text-3xl font-mono font-bold text-white">{localThrottle}%</span>
        </div>
        
        <div className="h-full flex items-center justify-center pt-8">
            <div className="relative h-[300px] w-24 bg-gray-900 rounded-full border border-gray-700 shadow-inner flex justify-center">
                {/* Track Fill */}
                <div 
                    className="absolute bottom-0 w-full bg-cyan-900/40 rounded-b-full transition-all duration-75"
                    style={{ height: `${localThrottle}%` }}
                />
                <div 
                    className="absolute bottom-0 w-2 bg-cyan-500/50 h-full rounded-full"
                />
                
                {/* Input Range (Vertical) */}
                <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    value={localThrottle}
                    onChange={handleSliderChange}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
                    style={{ writingMode: 'vertical-lr' as any, direction: 'rtl' }} 
                    /* Note: vertical input support varies, usually wrapper rotation is better, 
                       but for simplicity in this generated code we assume standard touch interaction or rotation via CSS */
                />
                
                {/* Handle Visual */}
                <div 
                    className="absolute w-20 h-20 bg-gray-200 rounded-full shadow-xl border-4 border-cyan-500 z-10 pointer-events-none transition-all duration-75 flex items-center justify-center"
                    style={{ bottom: `calc(${localThrottle}% - 40px)` }}
                >
                    <div className="w-2 h-2 bg-cyan-500 rounded-full"></div>
                </div>
            </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <button 
          onClick={stopMotor}
          disabled={!isArmed}
          className="bg-red-900/50 border border-red-800 text-red-200 p-4 rounded-xl flex items-center justify-center gap-2 hover:bg-red-900/80 active:scale-95 transition-all disabled:opacity-50"
        >
          <StopCircle /> STOP
        </button>
        <button 
          onClick={startTestSequence}
          disabled={!isArmed}
          className="bg-indigo-900/50 border border-indigo-800 text-indigo-200 p-4 rounded-xl flex items-center justify-center gap-2 hover:bg-indigo-900/80 active:scale-95 transition-all disabled:opacity-50"
        >
          <RefreshCw /> AUTO TEST
        </button>
      </div>

    </div>
  );
};