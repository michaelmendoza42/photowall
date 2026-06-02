import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // The wall is read-only and largely event-driven; window focus
        // re-fetches add noise without informing the visible state.
        refetchOnWindowFocus: false,
        // Surface backend errors through the typed error path rather
        // than masking them with optimistic retries on snapshot-changed
        // or playlist-not-found responses.
        retry: 1,
        staleTime: 5_000,
      },
    },
  });
}
