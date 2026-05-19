import type { LoaderFunctionArgs } from "react-router";
import { Form, useActionData } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    const loginUrl = await login(request).catch((response) => response);
    if (loginUrl instanceof Response) {
      const location = loginUrl.headers.get("Location");
      if (location) {
        return new Response(
          `<html><head><script>window.top.location.href = ${JSON.stringify(location)};</script></head></html>`,
          {
            status: 200,
            headers: { "Content-Type": "text/html" },
          }
        );
      }
    }
    throw loginUrl;
  }
  return null;
};

export const headers = () => ({
  "Content-Security-Policy": "frame-ancestors https://admin.shopify.com https://*.myshopify.com",
});

export default function LoginPage() {
  const actionData = useActionData<{ error?: string }>();

  return (
    <div style={{
      minHeight: "100vh",
      background: "#f5f5f5",
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "Arial, sans-serif",
    }}>
      <div style={{
        background: "white",
        borderRadius: 12,
        boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
        padding: "48px 40px",
        maxWidth: 420,
        width: "100%",
        textAlign: "center",
      }}>
        {/* Logo placeholder */}
        <div style={{
          width: 80,
          height: 80,
          background: "#dc0032",
          borderRadius: 16,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          margin: "0 auto 24px",
          fontSize: 36,
        }}>
          📦
        </div>

        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8, color: "#111" }}>
          Impression DPD
        </h1>

        <p style={{ fontSize: 14, color: "#666", marginBottom: 32, lineHeight: 1.6 }}>
          Cette application a été développée exclusivement pour la boutique{" "}
          <strong>Livedeco.com</strong>.
        </p>

        <form method="get" action="/">
          <div style={{ marginBottom: 16, textAlign: "left" }}>
  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6, color: "#333" }}>
    Domaine de la boutique
  </label>
  <input
    id="shop-input"
    type="text"
    defaultValue="johan-vf.myshopify.com"
    placeholder="ma-boutique.myshopify.com"
    style={{
      width: "100%",
      padding: "10px 14px",
      border: "1px solid #ddd",
      borderRadius: 6,
      fontSize: 14,
      boxSizing: "border-box" as const,
      outline: "none",
    }}
  />
</div>

<button
  type="button"
  onClick={() => {
    const shop = (document.getElementById("shop-input") as HTMLInputElement)?.value;
    if (shop) {
      window.top!.location.href = `/auth/login?shop=${encodeURIComponent(shop)}`;
    }
  }}
  style={{
    width: "100%",
    background: "#dc0032",
    color: "white",
    border: "none",
    borderRadius: 6,
    padding: "12px",
    fontSize: 15,
    fontWeight: 600,
    cursor: "pointer",
  }}
>
  Connexion
</button>
        </form>
      </div>

      {/* Footer */}
      <div style={{ marginTop: 32, textAlign: "center", fontSize: 13, color: "#999" }}>
        <p style={{ margin: "4px 0" }}>Johan Vauche-Forot</p>
        <p style={{ margin: "4px 0" }}>
          <a href="mailto:contact@johanvf.pro" style={{ color: "#666", textDecoration: "none" }}>
            contact@johanvf.pro
          </a>
        </p>
        <p style={{ margin: "8px 0 0" }}>© 2026 — Tous droits réservés</p>
      </div>
    </div>
  );
}