import { useQuery } from '@tanstack/react-query';
import { useApiQuery } from './useApiQuery';
import { queryKeys } from '@/lib/queryKeys';
import { SearchResult } from '@/types/search';

interface BackendResponse {
  data: SearchResult[];
  pagination: {
    currentPage: number;
    pageSize: number;
    totalCount: number;
    totalPages: number;
  };
}

export function useSearchQuery(
  params: {
    universal?: string;
    equipmentNumber?: string;
    partNumber?: string;
    page?: number;
    pageSize?: number;
  },
  enabled = true
) {
  return useApiQuery<BackendResponse>(
    queryKeys.search.stock(params),
    '/api/search/stock',
    params,
    {
      enabled: enabled,
      staleTime: 1000 * 30,
    }
  );
}
