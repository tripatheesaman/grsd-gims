'use client';
import { createContext, useContext, ReactNode } from 'react';
import { useDashboardInsights } from '@/hooks/useDashboardInsights';
type DashboardInsightsValue = ReturnType<typeof useDashboardInsights>;
const DashboardInsightsContext = createContext<DashboardInsightsValue | null>(null);
export const DashboardInsightsProvider = ({ children }: {
    children: ReactNode;
}) => {
    const insights = useDashboardInsights();
    return (<DashboardInsightsContext.Provider value={insights}>
      {children}
    </DashboardInsightsContext.Provider>);
};
export const useDashboardInsightsContext = () => {
    const context = useContext(DashboardInsightsContext);
    if (!context) {
        throw new Error('useDashboardInsightsContext must be used within a DashboardInsightsProvider');
    }
    return context;
};
