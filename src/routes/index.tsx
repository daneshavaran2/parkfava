import { createFileRoute } from "@tanstack/react-router";
import { Home } from "@/components/fava/views";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "شبکه فناوری فاوا — خانه" },
      { name: "description", content: "سکوی هوشمند شبکه ملی پارک‌های فناوری ایران." },
      { property: "og:title", content: "شبکه فناوری فاوا" },
      { property: "og:description", content: "نمایشگاه مجازی، نقشه پارک‌ها و دستیار هوشمند." },
    ],
  }),
  component: Home,
});
