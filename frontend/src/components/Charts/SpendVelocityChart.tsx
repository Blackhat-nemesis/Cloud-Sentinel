import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useStore } from '../../store/useStore';
import { format } from 'date-fns';

export const SpendVelocityChart = () => {
    const events = useStore(state => state.events).filter(e => e.eventType === 'UsageMetrics').reverse();
    
    const data = events.map(e => {
        const metadata = JSON.parse(e.metadata || '{}');
        return {
            time: format(new Date(e.timestamp), 'HH:mm:ss'),
            spend: e.spend || 0,
            baseline: metadata.totalHourlyCost / 60
        };
    });

    return (
        <div className="w-full h-full min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorSpend" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                        </linearGradient>
                        <linearGradient id="colorBaseline" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#64ffda" stopOpacity={0.3}/>
                            <stop offset="95%" stopColor="#64ffda" stopOpacity={0}/>
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#233554" />
                    <XAxis dataKey="time" stroke="#8892b0" fontSize={12} tickMargin={10} />
                    <YAxis stroke="#8892b0" fontSize={12} tickFormatter={(val) => val < 1 ? `$${val.toFixed(4)}` : `$${val.toFixed(2)}`} />
                    <Tooltip 
                        contentStyle={{ backgroundColor: '#112240', borderColor: '#233554', color: '#fff' }}
                        itemStyle={{ color: '#fff' }}
                    />
                    <Area type="monotone" dataKey="baseline" stroke="#64ffda" fillOpacity={1} fill="url(#colorBaseline)" name="Expected Spend" />
                    <Area type="monotone" dataKey="spend" stroke="#ef4444" fillOpacity={1} fill="url(#colorSpend)" name="Actual Spend" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};
