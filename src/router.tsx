import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  // Most data queries across the app already set staleTime: 30_000
  // individually (exhibition listings, company/product pages, about
  // sections...) — this just makes that the client-wide default instead of
  // React Query's own default of 0, so anything that doesn't set it
  // explicitly (current or future) still avoids refetching data that was
  // fetched moments ago on every remount/window-refocus, e.g. navigating
  // away from a company profile and back.
  const queryClient = new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000 } },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
