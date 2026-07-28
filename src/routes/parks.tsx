import { createFileRoute } from "@tanstack/react-router";
import { ParksMap } from "@/components/fava/views";

type Search = { id?: string };

export const Route = createFileRoute("/parks")({
  head: () => ({
    meta: [
      { title: "کهکشان فاوا — نقشه پارک‌های فناوری" },
      { name: "description", content: "شبکه ملی پارک‌های علم و فناوری ایران روی نقشه." },
      { property: "og:title", content: "کهکشان فاوا" },
      { property: "og:description", content: "پارک‌های فناوری ایران." },
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
