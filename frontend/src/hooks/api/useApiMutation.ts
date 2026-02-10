import { useMutation, UseMutationOptions, UseMutationResult } from '@tanstack/react-query';
import { API } from '@/lib/api';
import { AxiosResponse } from 'axios';

export function useApiMutation<TData = unknown, TVariables = unknown, TError = unknown>(
  mutationFn: (variables: TVariables) => Promise<AxiosResponse<TData>>,
  options?: Omit<UseMutationOptions<AxiosResponse<TData>, TError, TVariables>, 'mutationFn'>
): UseMutationResult<AxiosResponse<TData>, TError, TVariables> {
  return useMutation({
    mutationFn,
    ...options,
  });
}

export function useApiPost<TData = unknown, TVariables = unknown, TError = unknown>(
  options?: Omit<UseMutationOptions<AxiosResponse<TData>, TError, { url: string; data: TVariables }>, 'mutationFn'>
) {
  return useApiMutation<TData, { url: string; data: TVariables }, TError>(
    ({ url, data }) => API.post<TData>(url, data),
    options
  );
}

export function useApiPut<TData = unknown, TVariables = unknown, TError = unknown>(
  options?: Omit<UseMutationOptions<AxiosResponse<TData>, TError, { url: string; data: TVariables }>, 'mutationFn'>
) {
  return useApiMutation<TData, { url: string; data: TVariables }, TError>(
    ({ url, data }) => API.put<TData>(url, data),
    options
  );
}

export function useApiDelete<TData = unknown, TError = unknown>(
  url: string,
  options?: Omit<UseMutationOptions<AxiosResponse<TData>, TError, string | number>, 'mutationFn'>
) {
  return useApiMutation<TData, string | number, TError>(
    (id) => API.delete<TData>(`${url}/${id}`),
    options
  );
}
