import { createFileRoute } from "@tanstack/react-router";
import { Home } from "@/components/fava/views";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: tHead("meta.home_title") },
      { name: "description", content: tHead("meta.home_desc") },
      { property: "og:title", content: tHead("meta.home_og_title") },
      { property: "og:description", content: tHead("meta.home_og_desc") },
    ],
  }),
  component: Home,
});
