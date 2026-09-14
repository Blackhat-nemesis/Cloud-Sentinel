import { create } from 'zustand';

interface StoreState {
  dashboard: any;
  events: any[];
  anomalies: any[];
  resources: any[];
  setDashboard: (data: any | ((previous: any) => any)) => void;
  addEvent: (event: any) => void;
  setEvents: (events: any[]) => void;
  addAnomaly: (anomaly: any) => void;
  setAnomalies: (anomalies: any[]) => void;
  setResources: (resources: any[]) => void;
}

export const useStore = create<StoreState>((set) => ({
  dashboard: {
    hourlySpend: 0,
    projected24h: 0,
    projectedMonthly: 0,
    activeResources: 0,
    activeAnomalies: 0,
    quarantinedResources: 0,
    riskScore: 0,
    financialExposure: 0
  },
  events: [],
  anomalies: [],
  resources: [],
  
  setDashboard: (data) => set((state) => ({
    dashboard: typeof data === 'function' ? data(state.dashboard) : data
  })),
  
  addEvent: (event) => set((state) => ({ 
      events: [event, ...state.events].slice(0, 100) 
  })),
  
  setEvents: (events) => set({ events }),
  
  addAnomaly: (anomaly) => set((state) => ({
      anomalies: [anomaly, ...state.anomalies],
      dashboard: {
          ...state.dashboard,
          activeAnomalies: state.dashboard.activeAnomalies + 1,
          riskScore: Math.min(100, state.dashboard.riskScore + 15)
      }
  })),
  
  setAnomalies: (anomalies) => set({ anomalies }),
  
  setResources: (resources) => set({ resources })
}));
