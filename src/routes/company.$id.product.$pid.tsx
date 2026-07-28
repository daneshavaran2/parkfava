import { createFileRoute } from "@tanstack/react-router";
import { ProductPage } from "@/components/fava/views";

export const Route = createFileRoute("/company/$id/product/$pid")({
  head: ({ params }) => ({
    meta: [
      { title: `محصول — ${params.pid}` },
      { name: "description", content: "جزئیات محصول در نمایشگاه مجازی فاوا." },
    ],
  }),
  component: ProductRoute,
});

function ProductRoute() {
  const { id, pid } = Route.useParams();
  return <ProductPage id={id} pid={pid} />;
}
