import React from 'react';
import { MotorTelemetry, MotorStatus } from '../types';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Gauge, Activity, Zap, Thermometer, Wind, AlertCircle } from 'lucide-react';

interface DashboardProps {
  data: MotorTelemetry;
  history: MotorTelemetry[];
}

const StatCard: React.FC<{ 
  title: string; 
  value: string | number; 
  unit: string; 
  icon: React.ReactNode; 
  color: string 
}> = ({ title, value, unit, icon, color }) => (
  <div className="bg-gray-800 rounded-xl p-4 border border-gray-700 shadow-lg relative overflow-hidden group">
    <div className={`absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-20 transition-opacity ${color}`}>
      {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { size: 48 })}
    </div>
    <div className="flex items-center gap-3 mb-2">
      <div className={`p-2 rounded-lg bg-gray-900 ${color} bg-opacity-20`}>
        {React.isValidElement(icon) && React.cloneElement(icon as React.ReactElement<any>, { size: 20, className: color.replace('text-', 'text-') })} 
        {/* Simple color pass-through hack for tailwind classes */}
      </div>
      <span className="text-gray-400 text-sm font-medium">{title}</span>
    </div>
    <div className="flex items-baseline gap-1 relative z-10">
      <span className="text-2xl font-bold text-white tracking-tight">{value}</span>
      <span className="text-xs text-gray-500 font-mono">{unit}</span>
    </div>
  </div>
);

export const Dashboard: React.FC<DashboardProps> = ({ data, history }) => {
  const power = (data.voltage * data.current).toFixed(1);
  const efficiency = data.current > 0 ? (data.thrust / (data.voltage * data.current)).toFixed(2) : '0.00';

  return (
    <div className="space-y-6 pb-20">
      {/* Status Banner */}
      <div className={`rounded-lg p-3 flex items-center justify-between border ${
        data.status === MotorStatus.ERROR ? 'bg-red-900/30 border-red-800' : 
        data.status === MotorStatus.RUNNING ? 'bg-green-900/30 border-green-800' :
        'bg-gray-800 border-gray-700'
      }`}>
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full animate-pulse ${
            data.status === MotorStatus.ERROR ? 'bg-red-500' : 
            data.status === MotorStatus.RUNNING ? 'bg-green-500' :
            data.status === MotorStatus.DISARMED ? 'bg-gray-500' : 'bg-blue-500'
          }`} />
          <span className="font-mono font-bold text-gray-200">{data.status}</span>
        </div>
        {data.error && (
          <div className="flex items-center gap-2 text-red-400 text-sm">
            <AlertCircle size={16} />
            <span>{data.error}</span>
          </div>
        )}
      </div>

      {/* Primary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <StatCard 
          title="Thrust" 
          value={data.thrust.toFixed(0)} 
          unit="g" 
          icon={<Wind />} 
          color="text-emerald-400" 
        />
        <StatCard 
          title="Speed" 
          value={data.rpm.toLocaleString()} 
          unit="RPM" 
          icon={<Gauge />} 
          color="text-cyan-400" 
        />
        <StatCard 
          title="Current" 
          value={data.current.toFixed(2)} 
          unit="A" 
          icon={<Zap />} 
          color="text-amber-400" 
        />
        <StatCard 
          title="Voltage" 
          value={data.voltage.toFixed(2)} 
          unit="V" 
          icon={<Activity />} 
          color="text-purple-400" 
        />
        <StatCard 
          title="Power" 
          value={power} 
          unit="W" 
          icon={<Zap />} 
          color="text-rose-400" 
        />
        <StatCard 
          title="Temp" 
          value={data.temperature.toFixed(1)} 
          unit="°C" 
          icon={<Thermometer />} 
          color="text-orange-400" 
        />
      </div>

      {/* Efficiency Metric */}
      <div className="bg-gray-900 rounded-lg p-4 border border-gray-800 flex items-center justify-between">
        <span className="text-gray-400 text-sm">Efficiency (g/W)</span>
        <span className="text-xl font-mono text-white">{efficiency}</span>
      </div>

      {/* Real-time Charts */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-4 shadow-lg">
        <h3 className="text-gray-400 text-sm mb-4 font-medium flex items-center gap-2">
          <Activity size={16} /> Live Telemetry (RPM vs Thrust)
        </h3>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={history}>
              <defs>
                <linearGradient id="colorRpm" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorThrust" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
              <XAxis dataKey="timestamp" hide />
              <YAxis yAxisId="left" stroke="#94a3b8" fontSize={12} tickFormatter={(v) => `${v/1000}k`} />
              <YAxis yAxisId="right" orientation="right" stroke="#94a3b8" fontSize={12} />
              <Tooltip 
                contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                itemStyle={{ fontSize: '12px' }}
                labelStyle={{ display: 'none' }}
              />
              <Area 
                yAxisId="left"
                type="monotone" 
                dataKey="rpm" 
                stroke="#06b6d4" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorRpm)" 
                isAnimationActive={false}
              />
              <Area 
                yAxisId="right"
                type="monotone" 
                dataKey="thrust" 
                stroke="#10b981" 
                strokeWidth={2}
                fillOpacity={1} 
                fill="url(#colorThrust)" 
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="flex justify-center gap-6 mt-2 text-xs">
            <div className="flex items-center gap-2">
                <div className="w-3 h-1 bg-cyan-500 rounded-full"></div>
                <span className="text-gray-400">RPM</span>
            </div>
            <div className="flex items-center gap-2">
                <div className="w-3 h-1 bg-emerald-500 rounded-full"></div>
                <span className="text-gray-400">Thrust</span>
            </div>
        </div>
      </div>
    </div>
  );
};