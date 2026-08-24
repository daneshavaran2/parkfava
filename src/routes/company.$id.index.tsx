import { createFileRoute } from "@tanstack/react-router";
import { CompanyProfile } from "@/components/fava/views";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/company/$id/")({
  head: ({ params }) => ({
    meta: [
      { title: tHead("meta.company_title", { id: params.id }) },
      { name: "description", content: tHead("meta.company_desc") },
      { property: "og:title", content: tHead("meta.company_og_title") },
      { property: "og:description", content: tHead("meta.company_og_desc") },
    ],
  }),
  component: CompanyPage,
});

function CompanyPage() {
  const { id } = Route.useParams();
  return <CompanyProfile id={id} />;
}
