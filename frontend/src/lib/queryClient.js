import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60 * 1000,      // 2 minutes — data is "fresh"
      gcTime: 10 * 60 * 1000,         // 10 minutes — keep in memory
      refetchOnWindowFocus: false,     // Don't refetch on tab switch (POS stays open)
      retry: 1,                        // 1 retry on failure
      refetchOnReconnect: true,        // Refetch when back online
    },
  },
});

export { queryClient, QueryClientProvider };
