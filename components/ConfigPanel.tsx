import React, { useState } from 'react';
import { ConfigParams } from '../types';
import { Save, Settings, RotateCcw } from 'lucide-react';

interface ConfigPanelProps {
  config: ConfigParams;
  onSave: (newConfig: ConfigParams) => void;
}

export const ConfigPanel: React.FC<ConfigPanelProps> = ({ config, onSave }) => {
  const [formData, setFormData] = useState<ConfigParams>(config);
  const [isDirty, setIsDirty] = useState(false);

  const handleChange = (field: keyof ConfigParams, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: parseFloat(value) || 0
    }));
    setIsDirty(true);
  };

  const handleSave = () => {
    onSave(formData);
    setIsDirty(false);
  };

  const handleReset = () => {
    setFormData(config);
    setIsDirty(false);
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
        <div className="flex items-center gap-3 mb-6 pb-4 border-b border-gray-700">
          <Settings className="text-gray-400" />
          <h2 className="text-lg font-medium text-white">Motor Parameters</h2>
        </div>

        <div className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Motor KV Rating</label>
            <div className="relative">
              <input 
                type="number" 
                value={formData.kvRating}
                onChange={(e) => handleChange('kvRating', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
              />
              <span className="absolute right-4 top-3 text-gray-600 font-mono text-sm">RPM/V</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Pole Pairs</label>
            <input 
              type="number" 
              value={formData.polePairs}
              onChange={(e) => handleChange('polePairs', e.target.value)}
              className="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
            />
            <p className="mt-1 text-xs text-gray-600">Total magnetic poles / 2</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Current Limit (Safety)</label>
            <div className="relative">
              <input 
                type="number" 
                value={formData.currentLimit}
                onChange={(e) => handleChange('currentLimit', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
              />
              <span className="absolute right-4 top-3 text-gray-600 font-mono text-sm">Amps</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-400 mb-2">Temperature Cutoff</label>
            <div className="relative">
              <input 
                type="number" 
                value={formData.tempLimit}
                onChange={(e) => handleChange('tempLimit', e.target.value)}
                className="w-full bg-gray-900 border border-gray-700 rounded-lg py-3 px-4 text-white focus:ring-2 focus:ring-brand-500 focus:border-transparent outline-none transition-all"
              />
              <span className="absolute right-4 top-3 text-gray-600 font-mono text-sm">°C</span>
            </div>
          </div>
        </div>

        {isDirty && (
          <div className="mt-8 flex gap-3 animate-fade-in-up">
            <button 
              onClick={handleSave}
              className="flex-1 bg-brand-600 hover:bg-brand-500 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              <Save size={18} /> Apply Changes
            </button>
            <button 
              onClick={handleReset}
              className="px-4 py-3 rounded-lg bg-gray-700 hover:bg-gray-600 text-gray-300 transition-colors"
            >
              <RotateCcw size={18} />
            </button>
          </div>
        )}
      </div>

      <div className="bg-gray-800/50 rounded-xl p-4 border border-gray-700/50">
        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Firmware Info</h3>
        <div className="flex justify-between text-sm">
          <span className="text-gray-400">Version</span>
          <span className="font-mono text-gray-300">ESP32-BLDC-v2.1.0</span>
        </div>
        <div className="flex justify-between text-sm mt-1">
          <span className="text-gray-400">Build Date</span>
          <span className="font-mono text-gray-300">2023-10-15</span>
        </div>
      </div>
    </div>
  );
};