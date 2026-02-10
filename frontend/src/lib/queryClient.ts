'use client';

import { MutationCache, QueryCache, QueryClient } from '@tanstack/react-query';
import { showErrorToastFromError } from '@/lib/appToast';

const shouldSuppressErrorToast = (meta: unknown): boolean => {
  return Boolean(
    meta &&
      typeof meta === 'object' &&
      'suppressErrorToast' in meta &&
      (meta as { suppressErrorToast?: boolean }).suppressErrorToast
  );
};

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => {
      if (shouldSuppressErrorToast(query.meta)) {
        return;
      }
      showErrorToastFromError(error);
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (shouldSuppressErrorToast(mutation.meta)) {
        return;
      }
      showErrorToastFromError(error);
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      retry: 1,
      refetchOnWindowFocus: false,
      refetchOnMount: false,
      refetchOnReconnect: true,
    },
    mutations: {
      retry: 1,
    },
  },
});
