import { createFileRoute } from "@tanstack/react-router";
import { Categories } from "@/components/fava/views";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "شاخه‌های فناوری — شبکه فناوری فاوا" },
      { name: "description", content: "دسته‌بندی حوزه‌های فناوری و شرکت‌های هم‌شاخه." },
      { property: "og:title", content: "شاخه‌های فناوری" },
      { property: "og:description", content: "حوزه‌های فناوری در پارک فاوا." },
    ],
  }),
  component: Categories,
});
