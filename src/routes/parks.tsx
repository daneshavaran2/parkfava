import { createFileRoute } from "@tanstack/react-router";
import { ParksMap } from "@/components/fava/views";
import { tHead } from "@/i18n/head";

type Search = { id?: string };

export const Route = createFileRoute("/parks")({
  head: () => ({
    meta: [
      { title: tHead("meta.parks_title") },
      { name: "description", content: tHead("meta.parks_desc") },
      { property: "og:title", content: tHead("meta.parks_og_title") },
      { property: "og:description", content: tHead("meta.parks_og_desc") },
    ],
  }),
  validateSearch: (s: Record<string, unknown>): Search => ({
    id: typeof s.id === "string" ? s.id : undefined,
  }),
  component: ParksPage,
});

function ParksPage() {
  const { id } = Route.useSearch();
  return <ParksMap selectedId={id} />;
}
