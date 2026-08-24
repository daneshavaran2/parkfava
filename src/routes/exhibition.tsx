import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Exhibition } from "@/components/fava/views";
import { tHead } from "@/i18n/head";

type Search = { q?: string; cat?: string; park?: string; sort?: string };

export const Route = createFileRoute("/exhibition")({
  head: () => ({
    meta: [
      { title: tHead("meta.exhibition_title") },
      { name: "description", content: tHead("meta.exhibition_desc") },
      { property: "og:title", content: tHead("meta.exhibition_og_title") },
      { property: "og:description", content: tHead("meta.exhibition_og_desc") },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    q: typeof s.q === "string" ? s.q : undefined,
    cat: typeof s.cat === "string" ? s.cat : undefined,
    park: typeof s.park === "string" ? s.park : undefined,
    sort: typeof s.sort === "string" ? s.sort : undefined,
  }),
  component: ExhibitionPage,
});

function ExhibitionPage() {
  const { q, cat, park, sort } = Route.useSearch();
  const [query, setQuery] = useState(q || "");
  useEffect(() => { setQuery(q || ""); }, [q]);
  return <Exhibition query={query} setQuery={setQuery} sort={sort} initialCat={cat} park={park} />;
}
