import { createFileRoute } from "@tanstack/react-router";
import { HeroSection } from "@/components/hero/HeroSection";

export const Route = createFileRoute("/hero")({
  head: () => ({
    meta: [
      { title: "Fearless Vision Delivered" },
      { name: "description", content: "Creative studios built around elevating your vision into striking reality." },
    ],
  }),
  component: HeroSection,
});
