import { useState } from 'react';
import { Shield, X, Globe, AlertTriangle } from 'lucide-react';

interface AWSConnectModalProps {
  onClose: () => void;
  onConnect: (creds: { region: string }) => Promise<{ success: boolean; message?: string }>;
  onDisconnect: () => Promise<void>;
  isConnected: boolean;
}

export function AWSConnectModal({ onClose, onConnect, onDisconnect, isConnected }: AWSConnectModalProps) {
  const [region, setRegion] = useState('us-east-1');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const res = await onConnect({ region });
    setLoading(false);
    if (res && res.success) {
      onClose();
    } else {
      setError(res?.message || 'AWS was not able to validate the provided access credentials or region.');
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    await onDisconnect();
    setLoading(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-navy-900/80 backdrop-blur-sm z-[100] flex items-center justify-center">
      <div className="glass-panel w-[500px] border border-cyber-cyan/30 shadow-[0_0_30px_rgba(0,240,255,0.1)]">
        <div className="flex justify-between items-center p-4 border-b border-navy-700/50">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyber-cyan" />
            <h3 className="font-bold text-white">AWS Integration</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6">
          {isConnected ? (
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mb-2">
                <Shield className="w-8 h-8 text-green-400" />
              </div>
              <h4 className="text-xl font-bold text-white">Connected to Live AWS</h4>
              <p className="text-gray-400 text-center text-sm mb-4">
                CloudSentinel is currently tracking real EC2 instances and estimating costs for your AWS account.
              </p>
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="w-full py-2 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/50 rounded font-semibold transition-colors disabled:opacity-50"
              >
                {loading ? 'Disconnecting...' : 'Disconnect & Return to Simulation'}
              </button>
            </div>
          ) : (
            <form onSubmit={handleConnect} className="flex flex-col gap-4">
              <div className="p-3 bg-navy-800 border border-amber-500/30 rounded flex gap-3 mb-2">
                <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
                <p className="text-xs text-amber-500/90 leading-relaxed">
                  CloudSentinel uses the backend AWS credential chain: environment variables, AWS profile, ECS/EKS task role, or EC2 instance role. No secret key is collected in the browser.
                </p>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-1 uppercase tracking-wider">Region</label>
                <div className="relative">
                  <Globe className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                  <select
                    value={region}
                    onChange={(e) => setRegion(e.target.value)}
                    className="w-full bg-navy-900 border border-navy-600 rounded px-3 py-2 pl-9 text-white focus:outline-none focus:border-cyber-cyan transition-colors appearance-none"
                  >
                    <option value="us-east-1">us-east-1 (N. Virginia)</option>
                    <option value="us-east-2">us-east-2 (Ohio)</option>
                    <option value="us-west-1">us-west-1 (N. California)</option>
                    <option value="us-west-2">us-west-2 (Oregon)</option>
                    <option value="ca-central-1">ca-central-1 (Canada)</option>
                    <option value="eu-west-1">eu-west-1 (Ireland)</option>
                    <option value="eu-west-2">eu-west-2 (London)</option>
                    <option value="eu-central-1">eu-central-1 (Frankfurt)</option>
                    <option value="eu-north-1">eu-north-1 (Stockholm)</option>
                    <option value="ap-south-1">ap-south-1 (Mumbai)</option>
                    <option value="ap-east-1">ap-east-1 (Hong Kong)</option>
                    <option value="ap-southeast-1">ap-southeast-1 (Singapore)</option>
                    <option value="ap-southeast-2">ap-southeast-2 (Sydney)</option>
                    <option value="ap-northeast-1">ap-northeast-1 (Tokyo)</option>
                    <option value="ap-northeast-2">ap-northeast-2 (Seoul)</option>
                    <option value="me-south-1">me-south-1 (Bahrain)</option>
                    <option value="af-south-1">af-south-1 (Cape Town)</option>
                    <option value="sa-east-1">sa-east-1 (São Paulo)</option>
                  </select>
                </div>
              </div>

              {error && (
                <div className="p-3 bg-red-950/40 border border-red-500/50 rounded flex gap-2.5 text-xs text-red-300">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2 bg-cyber-cyan/20 hover:bg-cyber-cyan/30 text-cyber-cyan border border-cyber-cyan/50 rounded font-semibold transition-colors shadow-[0_0_15px_rgba(0,240,255,0.2)] disabled:opacity-50"
              >
                {loading ? 'Connecting...' : 'Connect to AWS'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
