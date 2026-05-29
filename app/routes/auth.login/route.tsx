import type { LoaderFunctionArgs } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  console.log("auth.login loader called", request.url);
  const result = await login(request);
  console.log("login result:", result);
  return result;
};

export default function LoginPage() {
  return (
    <div style={{ padding: "20px", fontFamily: "Arial", textAlign: "center" }}>
      <h1>Connexion en cours...</h1>
      <p>Vous allez être redirigé vers Shopify.</p>
    </div>
  );
}