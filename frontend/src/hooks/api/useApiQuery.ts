import { useQuery, UseQueryOptions, UseQueryResult } from '@tanstack/react-query';
import { API } from '@/lib/api';
import { AxiosResponse } from 'axios';

export function useApiQuery<TData = unknown, TError = unknown>(
  queryKey: readonly unknown[],
  url: string,
  params?: Record<string, unknown>,
  options?: Omit<UseQueryOptions<AxiosResponse<TData>, TError>, 'queryKey' | 'queryFn'>
): UseQueryResult<AxiosResponse<TData>, TError> {
  return useQuery({
    queryKey,
    queryFn: () => API.get<TData>(url, { params }),
    ...options,
  });
}
