import { createFileRoute } from "@tanstack/react-router";
import { CompanyProfile } from "@/components/fava/views";

export const Route = createFileRoute("/company/$id/")({
  head: ({ params }) => ({
    meta: [
      { title: `پروفایل شرکت — ${params.id}` },
      { name: "description", content: "پروفایل شرکت در نمایشگاه مجازی فاوا." },
      { property: "og:title", content: "پروفایل شرکت — فاوا" },
      { property: "og:description", content: "محصولات، آمار و راه‌های ارتباطی." },
    ],
  }),
  component: CompanyPage,
});

function CompanyPage() {
  const { id } = Route.useParams();
  return <CompanyProfile id={id} />;
}
