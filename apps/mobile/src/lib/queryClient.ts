import { QueryClient } from '@tanstack/react-query';
import { telemetry } from './telemetry';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 30_000, retry: 2, networkMode: 'offlineFirst' },
    mutations: { networkMode: 'offlineFirst', onError: (e) => telemetry.captureException(e) },
  },
});

export const qk = {
  trips: ['trips'] as const,
  trip: (id: string) => ['trip', id] as const,
  progress: ['progress'] as const,
};
