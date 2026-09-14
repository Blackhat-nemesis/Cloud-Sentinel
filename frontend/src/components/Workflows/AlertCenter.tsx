import { useState } from 'react';
import { useStore } from '../../store/useStore';
import { ShieldAlert, XCircle, CheckCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { apiUrl } from '../../config/api';

export const AlertCenter = () => {
    const anomalies = useStore(state => state.anomalies);
    const setAnomalies = useStore(state => state.setAnomalies);
    const setResources = useStore(state => state.setResources);
    const [loading, setLoading] = useState(false);

    const handleQuarantine = async (anomaly: any) => {
        if (!anomaly.affectedResourceIds || anomaly.affectedResourceIds === 'global') return;
        if (!window.confirm(`Quarantine ${anomaly.affectedResourceIds.split(',').length} resource(s)? This only updates the CloudSentinel containment simulation.`)) return;
        
        const resourceIds = anomaly.affectedResourceIds.split(',');
        setLoading(true);
        
        try {
            await fetch(apiUrl('/api/containment/quarantine'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resourceIds, confirmed: true })
            });
            
            // Mark anomaly as acknowledged/resolved locally for demo
            setAnomalies(anomalies.map(a => 
                a.id === anomaly.id ? { ...a, status: 'resolved' } : a
            ));
            
            // Refetch resources to update the heatmap
            fetch(apiUrl('/api/resources')).then(r => r.json()).then(setResources);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    if (anomalies.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full text-gray-500 py-10">
                <CheckCircle className="w-12 h-12 mb-2 text-cyber-cyan/50" />
                <p>No active anomalies detected.</p>
                <p className="text-xs mt-1">System is monitoring normally.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col gap-4">
            {anomalies.map(anomaly => (
                <div 
                    key={anomaly.id} 
                    className={`p-4 rounded border ${
                        anomaly.status === 'resolved' ? 'bg-navy-800 border-navy-700 opacity-50' :
                        anomaly.severity === 'critical' ? 'bg-red-900/20 border-red-500/50' : 
                        'bg-amber-900/20 border-amber-500/50'
                    }`}
                >
                    <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2">
                            <ShieldAlert className={`w-5 h-5 ${anomaly.severity === 'critical' ? 'text-red-500' : 'text-amber-500'}`} />
                            <h3 className="font-semibold text-white capitalize">{anomaly.type} Anomaly</h3>
                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                                anomaly.severity === 'critical' ? 'bg-red-500 text-white' : 'bg-amber-500 text-black'
                            }`}>
                                {anomaly.severity}
                            </span>
                        </div>
                        <span className="text-xs flex items-center gap-1 text-gray-400">
                            <Clock className="w-3 h-3" />
                            {format(new Date(anomaly.detectedAt), 'HH:mm:ss')}
                        </span>
                    </div>
                    
                    <p className="text-sm text-gray-300 mb-3">
                        {anomaly.explanation}
                    </p>
                    
                    <div className="flex justify-between items-end">
                        <div className="text-xs text-gray-400">
                            <div>Confidence: <span className="text-white">{anomaly.confidence.toFixed(1)}%</span></div>
                            <div>Score: <span className="text-white">{anomaly.score.toFixed(1)}</span></div>
                        </div>
                        
                        {anomaly.status === 'open' ? (
                            <button 
                                onClick={() => handleQuarantine(anomaly)}
                                disabled={loading || anomaly.affectedResourceIds === 'global'}
                                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50 flex items-center gap-2"
                            >
                                <XCircle className="w-4 h-4" />
                                {anomaly.affectedResourceIds === 'global' ? 'Global Alert' : 'Quarantine Resources'}
                            </button>
                        ) : (
                            <span className="text-xs text-cyber-cyan flex items-center gap-1 font-semibold">
                                <CheckCircle className="w-4 h-4" /> Mitigated
                            </span>
                        )}
                    </div>
                </div>
            ))}
        </div>
    );
};
