import { useMemo, useState } from 'react';
import { geoNaturalEarth1, geoPath } from 'd3-geo';
import { feature } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';
import { useStore } from '../../store/useStore';
import { AlertTriangle, CheckCircle, MapPin, X } from 'lucide-react';

const MAP_SIZE: [number, number] = [1000, 500];

const REGIONS = [
    { id: 'us-east-1', name: 'N. Virginia', lon: -77.5, lat: 39.0 },
    { id: 'us-east-2', name: 'Ohio', lon: -82.9, lat: 40.4 },
    { id: 'us-west-1', name: 'N. California', lon: -121.9, lat: 37.3 },
    { id: 'us-west-2', name: 'Oregon', lon: -122.7, lat: 45.5 },
    { id: 'ca-central-1', name: 'Canada Central', lon: -73.6, lat: 45.5 },
    { id: 'sa-east-1', name: 'São Paulo', lon: -46.6, lat: -23.5 },
    { id: 'eu-west-1', name: 'Ireland', lon: -6.3, lat: 53.3 },
    { id: 'eu-west-2', name: 'London', lon: -0.1, lat: 51.5 },
    { id: 'eu-central-1', name: 'Frankfurt', lon: 8.7, lat: 50.1 },
    { id: 'eu-north-1', name: 'Stockholm', lon: 18.1, lat: 59.3 },
    { id: 'me-south-1', name: 'Bahrain', lon: 50.6, lat: 26.1 },
    { id: 'af-south-1', name: 'Cape Town', lon: 18.4, lat: -33.9 },
    { id: 'ap-south-1', name: 'Mumbai', lon: 72.9, lat: 19.1 },
    { id: 'ap-east-1', name: 'Hong Kong', lon: 114.2, lat: 22.3 },
    { id: 'ap-southeast-1', name: 'Singapore', lon: 103.8, lat: 1.35 },
    { id: 'ap-southeast-2', name: 'Sydney', lon: 151.2, lat: -33.9 },
    { id: 'ap-northeast-1', name: 'Tokyo', lon: 139.7, lat: 35.7 },
    { id: 'ap-northeast-2', name: 'Seoul', lon: 127.0, lat: 37.6 },
];

type RegionStat = typeof REGIONS[number] & {
    count: number;
    gpuCount: number;
    hourlyCost: number;
    hasUnauthorized: boolean;
    isQuarantined: boolean;
    mapX: number;
    mapY: number;
};

export const RegionalHeatmap = () => {
    const resources = useStore(state => state.resources);
    const [selectedRegion, setSelectedRegion] = useState<string | null>(null);

    const { countryFeatures, project } = useMemo(() => {
        const countries = (feature((world as any), (world as any).objects.countries) as any).features as any[];
        const projection = geoNaturalEarth1().fitSize(MAP_SIZE, {
            type: 'FeatureCollection',
            features: countries
        } as any);
        return {
            countryFeatures: countries,
            project: (coordinates: [number, number]) => projection(coordinates) || [0, 0]
        };
    }, []);

    const path = useMemo(() => {
        const projection = geoNaturalEarth1().fitSize(MAP_SIZE, {
            type: 'FeatureCollection',
            features: countryFeatures
        } as any);
        return geoPath(projection);
    }, [countryFeatures]);

    const regionStats: RegionStat[] = REGIONS.map(reg => {
        const regResources = resources.filter(r => r.region === reg.id);
        const [mapX, mapY] = project([reg.lon, reg.lat]);
        return {
            ...reg,
            count: regResources.length,
            gpuCount: regResources.reduce((acc, r) => acc + r.gpuCount, 0),
            hourlyCost: regResources.reduce((acc, r) => acc + r.hourlyCost, 0),
            hasUnauthorized: regResources.some(r => !r.approved),
            isQuarantined: regResources.some(r => r.quarantined),
            mapX,
            mapY
        };
    });

    const activeRegions = regionStats.filter(stat => stat.count > 0);
    const selected = regionStats.find(stat => stat.id === selectedRegion);

    return (
        <div className="w-full h-full min-h-[300px] relative bg-navy-900/50 rounded-lg border border-navy-700/50 overflow-hidden">
            <div className="heatmap-grid absolute inset-0" />
            <div className="heatmap-scan absolute inset-y-0 left-0 w-1/3" />
            <div className="heatmap-vignette absolute inset-0" />

            <svg className="world-map absolute inset-0 w-full h-full" viewBox="0 0 1000 500" preserveAspectRatio="xMidYMid meet" aria-label="World map with cloud regions">
                <g className="world-land">
                    {countryFeatures.map((country: any, index: number) => <path key={index} d={path(country) || undefined} />)}
                </g>
                {activeRegions.slice(1).map((stat, index) => {
                    const previous = activeRegions[index];
                    return <line key={`${previous.id}-${stat.id}`} x1={previous.mapX} y1={previous.mapY} x2={stat.mapX} y2={stat.mapY} className="heatmap-link" />;
                })}
                {regionStats.map((stat, index) => {
                    const isActive = stat.count > 0;
                    const fill = !isActive ? '#475569' : stat.isQuarantined ? '#f59e0b' : stat.hasUnauthorized ? '#ef4444' : '#64ffda';
                    return (
                        <g key={stat.id} className={`heatmap-svg-marker ${!isActive ? 'heatmap-svg-marker-inactive' : ''}`} onClick={() => setSelectedRegion(selectedRegion === stat.id ? null : stat.id)} role="button" tabIndex={0} aria-label={`Show ${stat.name} statistics`}>
                            <title>{`${stat.name}: ${stat.count} instances, $${stat.hourlyCost.toFixed(4)}/hour`}</title>
                            {isActive && <circle cx={stat.mapX} cy={stat.mapY} r="13" fill="none" stroke={fill} strokeWidth="2" className="heatmap-svg-ring" style={{ animationDelay: `${index * 180}ms` }} />}
                            <circle cx={stat.mapX} cy={stat.mapY} r={isActive && stat.gpuCount > 0 ? 8 : isActive ? 6 : 3.5} fill={fill} fillOpacity={isActive ? 0.9 : 0.55} stroke={isActive ? '#d8fff7' : '#64748b'} strokeWidth={isActive ? 2 : 1} className={isActive ? 'heatmap-svg-dot' : ''} style={{ animationDelay: `${index * 180}ms` }} />
                        </g>
                    );
                })}
            </svg>

            {selected && (
                <div className="heatmap-detail-panel absolute left-3 right-3 bottom-3 z-30 rounded-lg p-3">
                    <div className="flex items-start justify-between gap-3">
                        <div><div className="flex items-center gap-2 text-white font-semibold"><MapPin className="w-4 h-4 text-cyber-cyan" />{selected.name}</div><div className="text-[10px] text-gray-500 mt-0.5 uppercase tracking-widest">{selected.id} · live telemetry</div></div>
                        <button type="button" aria-label="Close region details" onClick={() => setSelectedRegion(null)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                        <div><div className="text-gray-500">Instances</div><div className="text-white font-semibold">{selected.count}</div></div>
                        <div><div className="text-gray-500">GPUs</div><div className="text-amber-300 font-semibold">{selected.gpuCount}</div></div>
                        <div><div className="text-gray-500">Spend / hour</div><div className="text-cyber-cyan font-semibold">${selected.hourlyCost.toFixed(4)}</div></div>
                    </div>
                    {selected.hasUnauthorized && !selected.isQuarantined && <div className="mt-2 text-xs text-red-300 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Unauthorized activity detected</div>}
                    {selected.isQuarantined && <div className="mt-2 text-xs text-amber-300 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Resource quarantined</div>}
                </div>
            )}
        </div>
    );
};
