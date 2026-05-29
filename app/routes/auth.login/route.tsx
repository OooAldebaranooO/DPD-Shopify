import type { LoaderFunctionArgs } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (!shop) {
    return new Response(
      `<script>window.top.location.href = "/auth/login?shop=livedeco-com.myshopify.com"</script>`,
      { headers: { "Content-Type": "text/html" } }
    );
  }
  
  return login(request);
};

export default function LoginPage() {
  return null;
}