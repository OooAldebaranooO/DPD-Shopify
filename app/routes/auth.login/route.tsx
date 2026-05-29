import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  const shop = url.searchParams.get("shop");
  
  if (!shop) {
    return redirect(`/auth/login?shop=livedeco-com.myshopify.com`);
  }
  
  return login(request);
};

export default function LoginPage() {
  return (
    <div style={{ padding: "20px", textAlign: "center" }}>
      <p>Connexion en cours...</p>
    </div>
  );
}