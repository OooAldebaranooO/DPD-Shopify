import type { LoaderFunctionArgs } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  console.log("shop param:", url.searchParams.get("shop"));
  console.log("full url:", request.url);
  return login(request);
};

export default function LoginPage() {
  return (
    <div style={{ padding: "20px", fontFamily: "Arial", textAlign: "center" }}>
      <h1>Connexion en cours...</h1>
      <p>Vous allez être redirigé vers Shopify.</p>
    </div>
  );
}