import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/components/fava/views";
import { tHead } from "@/i18n/head";

export const Route = createFileRoute("/company/$id/product/$pid")({
  head: ({ params }) => ({
    meta: [
      { title: tHead("meta.product_title", { id: params.pid }) },
      { name: "description", content: tHead("meta.product_desc") },
    ],
  }),
  component: ProductRoute,
});

function ProductRoute() {
  const { id, pid } = Route.useParams();
  return <ProductPage id={id} pid={pid} />;
}
