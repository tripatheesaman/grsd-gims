import { useEffect, useMemo, useRef, useState } from 'react';
import { API } from '@/lib/api';
import { PredictionSummary } from '@/types/prediction';
type PredictionState = PredictionSummary | null;
const predictionCache = new Map<string, PredictionSummary>();
interface UsePredictionResult {
    prediction: PredictionState;
    isLoading: boolean;
    error: string | null;
    refresh: () => Promise<void>;
}
const fetchPrediction = async (nacCode: string): Promise<PredictionSummary | null> => {
    try {
        const response = await API.get(`/api/predictions/${encodeURIComponent(nacCode)}`);
        if (response.status === 200 && response.data) {
            return response.data as PredictionSummary;
        }
        return null;
    }
    catch {
        return null;
    }
};
export const usePrediction = (nacCode?: string | null): UsePredictionResult => {
    const [prediction, setPrediction] = useState<PredictionState>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const codeRef = useRef<string | null>(null);
    const refresh = useMemo(() => {
        return async () => {
            if (!codeRef.current)
                return;
            setIsLoading(true);
            setError(null);
            const data = await fetchPrediction(codeRef.current);
            if (data) {
                predictionCache.set(codeRef.current, data);
            }
            setPrediction(data);
            setIsLoading(false);
            if (!data) {
                setError('No historical data available for this NAC code yet.');
            }
        };
    }, []);
    useEffect(() => {
        if (!nacCode) {
            setPrediction(null);
            setError(null);
            codeRef.current = null;
            return;
        }
        const normalized = nacCode.trim();
        if (!normalized) {
            setPrediction(null);
            setError(null);
            codeRef.current = null;
            return;
        }
        codeRef.current = normalized;
        const cached = predictionCache.get(normalized);
        if (cached) {
            setPrediction(cached);
            setError(null);
            return;
        }
        let isMounted = true;
        (async () => {
            setIsLoading(true);
            setError(null);
            const data = await fetchPrediction(normalized);
            if (!isMounted)
                return;
            if (data) {
                predictionCache.set(normalized, data);
                setPrediction(data);
            }
            else {
                setPrediction(null);
                setError('No historical data available for this NAC code yet.');
            }
            setIsLoading(false);
        })();
        return () => {
            isMounted = false;
        };
    }, [nacCode]);
    return {
        prediction,
        isLoading,
        error,
        refresh
    };
};
export const PredictionAPI = {
    async getPrediction(nacCode: string): Promise<PredictionSummary | null> {
        if (predictionCache.has(nacCode)) {
            return predictionCache.get(nacCode)!;
        }
        const data = await fetchPrediction(nacCode);
        if (data) {
            predictionCache.set(nacCode, data);
        }
        return data;
    },
    clearCache() {
        predictionCache.clear();
    }
};
