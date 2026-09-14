import { useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import { useStore } from './store/useStore';
import { Shield, Activity, Map, AlertOctagon, BarChart3, TrendingUp } from 'lucide-react';
import { SpendVelocityChart } from './components/Charts/SpendVelocityChart';
import { RegionalHeatmap } from './components/Charts/Heatmap';
import { AlertCenter } from './components/Workflows/AlertCenter';
import { SimulationControls } from './components/Workflows/SimulationControls';
import { AWSConnectModal } from './components/Workflows/AWSConnectModal';
import { format } from 'date-fns';
import { apiUrl, socketUrl } from './config/api';

const socket = io(socketUrl);

const formatCurrency = (value: number | undefined) => {
  if (!value) return '$0.00';
  return value < 1 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
};

function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [timeRange, setTimeRange] = useState('15m');
  const [isAwsModalOpen, setIsAwsModalOpen] = useState(false);
  const [isAwsConnected, setIsAwsConnected] = useState(false);
  const { dashboard, events, setDashboard, addEvent, addAnomaly, setResources, setEvents, setAnomalies } = useStore();

  useEffect(() => {
    const splashTimer = window.setTimeout(() => setShowSplash(false), 3000);
    return () => window.clearTimeout(splashTimer);
  }, []);

  useEffect(() => {
    fetch(apiUrl('/api/aws/status')).then(r => r.json()).then(data => setIsAwsConnected(data.connected));
    fetch(apiUrl('/api/dashboard')).then(r => r.json()).then(setDashboard);
    fetch(apiUrl('/api/resources')).then(r => r.json()).then(setResources);
    fetch(apiUrl('/api/events')).then(r => r.json()).then(data => setEvents(data.reverse()));
    fetch(apiUrl('/api/anomalies')).then(r => r.json()).then(setAnomalies);

    socket.on('metrics', (data) => {
        setDashboard((prev: any) => ({ 
            ...prev, 
            hourlySpend: data.currentHourlySpend,
            activeResources: data.activeResources,
            projected24h: data.currentHourlySpend * 24
        }));
    });
    socket.on('resources', setResources);
    
    socket.on('telemetry', addEvent);
    socket.on('anomaly', addAnomaly);
    socket.on('event', addEvent);

    return () => {
      socket.off('metrics');
      socket.off('resources');
      socket.off('telemetry');
      socket.off('anomaly');
      socket.off('event');
    };
  }, []);

  const handleConnectAWS = async (creds: { region: string }): Promise<{ success: boolean; message?: string }> => {
    try {
      const res = await fetch(apiUrl('/api/aws/connect'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(creds)
      });
      const data = await res.json();
      if (data.success) {
        setIsAwsConnected(true);
        const [dashboard, resources, events, anomalies] = await Promise.all([
          fetch(apiUrl('/api/dashboard')).then(r => r.json()),
          fetch(apiUrl('/api/resources')).then(r => r.json()),
          fetch(apiUrl('/api/events')).then(r => r.json()),
          fetch(apiUrl('/api/anomalies')).then(r => r.json())
        ]);
        setDashboard(dashboard);
        setResources(resources);
        setEvents(events.reverse());
        setAnomalies(anomalies);
        return { success: true };
      } else {
        return { success: false, message: data.message || 'Failed to connect to AWS' };
      }
    } catch (e: any) {
      return { success: false, message: `Network error connecting to backend: ${e.message}` };
    }
  };

  const handleDisconnectAWS = async () => {
    try {
      await fetch(apiUrl('/api/aws/disconnect'), { method: 'POST' });
      setIsAwsConnected(false);
      const [dashboard, resources] = await Promise.all([
        fetch(apiUrl('/api/dashboard')).then(r => r.json()),
        fetch(apiUrl('/api/resources')).then(r => r.json())
      ]);
      setDashboard(dashboard);
      setResources(resources);
    } catch (e) {
      alert('Error disconnecting');
    }
  };

  return (
    <div className="min-h-screen bg-navy-900 text-gray-100 flex flex-col font-sans">
      {showSplash && (
        <div className="splash-screen" role="status" aria-label="Loading CloudSentinel">
          <div className="splash-orbit splash-orbit-one" />
          <div className="splash-orbit splash-orbit-two" />
          <div className="splash-content">
            <div className="splash-logo-wrap">
              <Shield className="splash-logo" />
            </div>
            <div className="splash-brand">
              Cloud<span>Sentinel</span>
            </div>
            <div className="splash-tagline">Real-time cloud cost intelligence</div>
            <div className="splash-loader"><span /></div>
          </div>
        </div>
      )}
      <nav className="h-16 border-b border-navy-700/50 glass-panel rounded-none flex items-center justify-between px-6 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <Shield className="w-8 h-8 text-cyber-cyan" />
          <span className="text-xl font-bold tracking-wider text-white">
            Cloud<span className="text-cyber-cyan">Sentinel</span>
          </span>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <button 
            onClick={() => setIsAwsModalOpen(true)}
            className={`flex items-center gap-2 px-3 py-1 rounded-full border transition-colors ${
              isAwsConnected 
                ? 'bg-green-900/20 border-green-500/30 text-green-400 hover:bg-green-900/40'
                : 'bg-navy-800 border-cyber-cyan/30 text-cyber-cyan hover:bg-navy-700'
            }`}
          >
            <div className={`w-2 h-2 rounded-full animate-pulse ${isAwsConnected ? 'bg-green-400' : 'bg-cyber-cyan'}`}></div>
            <span className="font-medium">{isAwsConnected ? 'LIVE AWS' : 'SIMULATION MODE'}</span>
          </button>
          <div className="h-6 w-px bg-navy-700"></div>
          <div className="flex items-center gap-6 text-gray-400 font-medium">
            <span onClick={() => setActiveTab('overview')} className={`flex items-center gap-2 cursor-pointer ${activeTab === 'overview' ? 'text-white' : 'hover:text-white'}`}><Activity className="w-4 h-4"/> Live Operations</span>
            <span onClick={() => setActiveTab('anomalies')} className={`flex items-center gap-2 cursor-pointer ${activeTab === 'anomalies' ? 'text-white' : 'hover:text-white'}`}><AlertOctagon className="w-4 h-4"/> Anomalies</span>
            <span onClick={() => setActiveTab('resources')} className={`flex items-center gap-2 cursor-pointer ${activeTab === 'resources' ? 'text-white' : 'hover:text-white'}`}><Map className="w-4 h-4"/> Resources</span>
            <span onClick={() => setActiveTab('analytics')} className={`flex items-center gap-2 cursor-pointer ${activeTab === 'analytics' ? 'text-white' : 'hover:text-white'}`}><BarChart3 className="w-4 h-4"/> Analytics</span>
          </div>
        </div>
      </nav>

      <main className="flex-1 p-6 flex flex-col gap-6 w-full mx-auto max-w-[1600px]">
        {activeTab === 'overview' && (
          <>
            <div className="grid grid-cols-5 gap-4">
                <div className="glass-panel p-4 flex flex-col justify-between h-32 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-3 opacity-20 group-hover:opacity-100 transition-opacity"><TrendingUp className="w-12 h-12 text-cyber-cyan"/></div>
                    <span className="text-gray-400 text-sm font-medium z-10">Current Hourly Spend</span>
                    <span className="text-3xl font-bold text-white z-10">{formatCurrency(dashboard?.hourlySpend)}</span>
                </div>
                <div className="glass-panel p-4 flex flex-col justify-between h-32 relative overflow-hidden">
                    <span className="text-gray-400 text-sm font-medium">Projected 24h Spend</span>
                    <span className="text-3xl font-bold text-gray-300">{formatCurrency(dashboard?.projected24h)}</span>
                </div>
                <div className="glass-panel p-4 flex flex-col justify-between h-32 relative overflow-hidden">
                    <span className="text-gray-400 text-sm font-medium">Active Resources</span>
                    <span className="text-3xl font-bold text-white">{dashboard?.activeResources || 0}</span>
                </div>
                <div className={`glass-panel p-4 flex flex-col justify-between h-32 relative overflow-hidden transition-colors ${dashboard?.activeAnomalies > 0 ? 'bg-red-900/20 border-red-500/50 pulse-critical' : ''}`}>
                    <span className="text-gray-400 text-sm font-medium z-10">Active Anomalies</span>
                    <span className={`text-3xl font-bold z-10 ${dashboard?.activeAnomalies > 0 ? 'text-red-500' : 'text-cyber-cyan'}`}>
                        {dashboard?.activeAnomalies || 0}
                    </span>
                </div>
                <div className="glass-panel p-4 flex flex-col justify-between h-32 relative overflow-hidden">
                    <span className="text-gray-400 text-sm font-medium">Risk Score</span>
                    <div className="flex items-end gap-2 z-10">
                        <span className={`text-3xl font-bold ${dashboard?.riskScore > 60 ? 'text-red-500' : dashboard?.riskScore > 30 ? 'text-amber-500' : 'text-green-500'}`}>
                            {dashboard?.riskScore || 0}
                        </span>
                        <span className="text-gray-500 mb-1">/ 100</span>
                    </div>
                </div>
            </div>

        <div className="grid grid-cols-12 gap-6 h-[400px]">
            {/* Main Chart */}
            <div className="col-span-8 glass-panel p-5 flex flex-col">
                <h2 className="text-lg font-semibold mb-4 text-white flex justify-between">
                    Real-Time Spend Velocity
                    <div className="flex gap-2 text-xs">
                        <button onClick={() => setTimeRange('15m')} className={`px-2 py-1 rounded transition-colors ${timeRange === '15m' ? 'bg-navy-700 text-white' : 'text-gray-400 hover:text-white'}`}>15m</button>
                        <button onClick={() => setTimeRange('1h')} className={`px-2 py-1 rounded transition-colors ${timeRange === '1h' ? 'bg-navy-700 text-white' : 'text-gray-400 hover:text-white'}`}>1h</button>
                        <button onClick={() => setTimeRange('6h')} className={`px-2 py-1 rounded transition-colors ${timeRange === '6h' ? 'bg-navy-700 text-white' : 'text-gray-400 hover:text-white'}`}>6h</button>
                    </div>
                </h2>
                <div className="flex-1 min-h-0">
                    <SpendVelocityChart />
                </div>
            </div>
            
            {/* Heatmap */}
            <div className="col-span-4 glass-panel p-5 flex flex-col">
                <h2 className="text-lg font-semibold mb-4 text-white">Regional Heatmap</h2>
                <div className="flex-1 min-h-0">
                    <RegionalHeatmap />
                </div>
            </div>
        </div>

        <div className="grid grid-cols-12 gap-6 h-[400px]">
            {/* Alert Center */}
            <div className="col-span-5 glass-panel p-5 flex flex-col">
                <h2 className="text-lg font-semibold mb-4 text-white flex justify-between items-center">
                    Alert Center
                    <span className="text-xs bg-red-500/20 text-red-400 px-2 py-1 rounded font-bold">
                        {dashboard?.activeAnomalies || 0} CRITICAL
                    </span>
                </h2>
                <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar">
                    <AlertCenter />
                </div>
            </div>

            {/* Event Feed */}
            <div className="col-span-3 glass-panel p-5 flex flex-col">
                <h2 className="text-lg font-semibold mb-4 text-white">Live Event Stream</h2>
                <div className="flex-1 flex flex-col gap-2 overflow-y-auto pr-2 custom-scrollbar">
                    {events.map((e: any, i) => (
                        <div key={i} className="p-3 bg-navy-800 rounded border border-navy-700/50 text-sm">
                            <div className="flex justify-between items-center mb-1">
                                <span className={`font-semibold ${e.eventType.includes('Anomaly') || e.severity === 'critical' ? 'text-red-400' : 'text-cyber-cyan'}`}>
                                    {e.eventType}
                                </span>
                                <span className="text-xs text-gray-500">{format(new Date(e.timestamp), 'HH:mm:ss')}</span>
                            </div>
                            {e.region && <div className="text-xs text-gray-400 mt-1">Region: {e.region}</div>}
                            {e.iamPrincipal && <div className="text-xs text-gray-400">Principal: {e.iamPrincipal}</div>}
                        </div>
                    ))}
                </div>
            </div>

            {/* Controls */}
            <div className="col-span-4 flex flex-col gap-4">
                <SimulationControls isAwsConnected={isAwsConnected} />
            </div>
        </div>
      </>
    )}

        {activeTab === 'anomalies' && (
            <div className="glass-panel p-6 min-h-[500px]">
                <h2 className="text-xl font-bold text-white mb-4">Anomaly History</h2>
                <div className="w-full max-w-3xl">
                    <AlertCenter />
                </div>
            </div>
        )}

        {activeTab === 'resources' && (
            <div className="glass-panel p-6 min-h-[500px]">
                <h2 className="text-xl font-bold text-white mb-4">Cloud Resources</h2>
                <div className="text-gray-400 text-sm flex items-center justify-center h-48 border border-navy-700 border-dashed rounded">
                    Resource inventory view is under construction.
                </div>
            </div>
        )}

        {activeTab === 'analytics' && (
            <div className="glass-panel p-6 min-h-[500px]">
                <h2 className="text-xl font-bold text-white mb-4">Analytics Dashboard</h2>
                <div className="text-gray-400 text-sm flex items-center justify-center h-48 border border-navy-700 border-dashed rounded">
                    Advanced analytics and reporting tools coming soon.
                </div>
            </div>
        )}
      </main>

      {isAwsModalOpen && (
        <AWSConnectModal 
          onClose={() => setIsAwsModalOpen(false)}
          onConnect={handleConnectAWS}
          onDisconnect={handleDisconnectAWS}
          isConnected={isAwsConnected}
        />
      )}
    </div>
  );
}

export default App;
