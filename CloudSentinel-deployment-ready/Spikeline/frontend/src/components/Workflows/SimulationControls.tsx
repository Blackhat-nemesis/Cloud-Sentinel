import { useState } from 'react';
import { Play, Activity, AlertTriangle, CheckCircle, RefreshCcw, ShieldAlert } from 'lucide-react';
import { apiUrl } from '../../config/api';

export const SimulationControls = ({ isAwsConnected = false }: { isAwsConnected?: boolean }) => {
    const [loading, setLoading] = useState(false);
    const [activePreset, setActivePreset] = useState('normal');

    const handlePreset = async (preset: string) => {
        setLoading(true);
        try {
            const endpoint = apiUrl(isAwsConnected ? '/api/aws/analyze' : '/api/simulation/start');
            const payload = isAwsConnected ? { mode: preset } : { preset };
            await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            setActivePreset(preset);
        } finally {
            setLoading(false);
        }
    };

    const handleReset = async () => {
        setLoading(true);
        try {
            await fetch(apiUrl('/api/simulation/reset'), { method: 'POST' });
            setActivePreset('normal');
            window.location.reload(); // simple way to clear all frontend state
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="glass-panel p-6">
            <h2 className="text-lg font-semibold mb-4 text-white flex items-center gap-2">
                <Play className="w-5 h-5 text-cyber-cyan" /> {isAwsConnected ? 'Live AWS Analysis Mode' : 'Attack Simulation Mode'}
            </h2>
            
            <div className="grid grid-cols-2 gap-4">
                <button 
                    onClick={() => handlePreset('normal')}
                    disabled={loading}
                    className={`p-3 rounded border text-left transition-colors ${
                        activePreset === 'normal' ? 'bg-cyber-cyan/20 border-cyber-cyan text-white' : 'bg-navy-800 border-navy-700 hover:border-cyber-cyan/50'
                    }`}
                >
                    <div className="font-semibold flex items-center gap-2"><CheckCircle className="w-4 h-4 text-cyber-cyan"/> Normal Operations</div>
                    <div className="text-xs text-gray-400 mt-1">{isAwsConnected ? 'Refresh live AWS inventory and baseline.' : 'Stable spend, approved regions, normal load.'}</div>
                </button>

                <button 
                    onClick={() => handlePreset('spike')}
                    disabled={loading}
                    className={`p-3 rounded border text-left transition-colors ${
                        activePreset === 'spike' ? 'bg-amber-500/20 border-amber-500 text-white' : 'bg-navy-800 border-navy-700 hover:border-amber-500/50'
                    }`}
                >
                    <div className="font-semibold flex items-center gap-2"><Activity className="w-4 h-4 text-amber-500"/> Sudden GPU Spike</div>
                    <div className="text-xs text-gray-400 mt-1">{isAwsConnected ? 'Evaluate real AWS spend velocity; creates nothing.' : 'Provisions 15 mid-tier GPUs causing velocity anomaly.'}</div>
                </button>

                <button 
                    onClick={() => handlePreset('cryptojacking')}
                    disabled={loading}
                    className={`p-3 rounded border text-left transition-colors ${
                        activePreset === 'cryptojacking' ? 'bg-red-500/20 border-red-500 text-white' : 'bg-navy-800 border-navy-700 hover:border-red-500/50'
                    }`}
                >
                    <div className="font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500"/> Full Cryptojacking Attack</div>
                    <div className="text-xs text-gray-400 mt-1">{isAwsConnected ? 'Scan real GPU resources and unauthorized regions.' : '50 p4d.24xlarge across unauthorized regions via leaked key.'}</div>
                </button>

                <button 
                    onClick={() => handlePreset('false-positive')}
                    disabled={loading}
                    className={`p-3 rounded border text-left transition-colors ${
                        activePreset === 'false-positive' ? 'bg-blue-500/20 border-blue-500 text-white' : 'bg-navy-800 border-navy-700 hover:border-blue-500/50'
                    }`}
                >
                    <div className="font-semibold flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-blue-500"/> False Positive Scenario</div>
                    <div className="text-xs text-gray-400 mt-1">{isAwsConnected ? 'Evaluate approved/tagged GPU workloads.' : 'Legitimate high-utilization GPU workload with valid ticket.'}</div>
                </button>
            </div>

            <div className="mt-6 pt-4 border-t border-navy-700 flex justify-end">
                <button 
                    onClick={handleReset}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-navy-800 hover:bg-navy-700 border border-navy-600 rounded text-sm text-gray-300"
                >
                    <RefreshCcw className="w-4 h-4" /> Reset Environment
                </button>
            </div>
        </div>
    );
};
