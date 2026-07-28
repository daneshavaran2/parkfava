import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Exhibition } from "@/components/fava/views";

type Search = { q?: string; cat?: string; park?: string; sort?: string };

export const Route = createFileRoute("/exhibition")({
  head: () => ({
    meta: [
      { title: "نمایشگاه مجازی — شبکه فناوری فاوا" },
      { name: "description", content: "مرور شرکت‌های دانش‌بنیان پارک فاوا و محصولات آن‌ها." },
      { property: "og:title", content: "نمایشگاه مجازی فاوا" },
      { property: "og:description", content: "شرکت‌ها، محصولات و راه‌های ارتباطی." },
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
