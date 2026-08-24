import { createFileRoute } from "@tanstack/react-router";
import { Categories } from "@/components/fava/views";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: tHead("meta.categories_title") },
      { name: "description", content: tHead("meta.categories_desc") },
      { property: "og:title", content: tHead("meta.categories_og_title") },
      { property: "og:description", content: tHead("meta.categories_og_desc") },
    ],
  }),
  component: Categories,
});
