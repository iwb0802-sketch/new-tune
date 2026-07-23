import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TuningProvider } from "../lib/tuning-store";

const queryClient = new QueryClient();

interface ProviderProps {
  children: React.ReactNode;
}

// App-level providers — add theme/context providers here, wrapping children.
// QueryClientProvider must stay (all API calls run through TanStack Query).
export function Provider({ children }: ProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <TuningProvider>{children}</TuningProvider>
    </QueryClientProvider>
  );
}
