import type { LoaderFunctionArgs } from "react-router";
import { Form, useActionData } from "react-router";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw await login(request);
  }
  return null;
};

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
          Impression DPD (by Jojo)
        </h1>

        <p style={{ fontSize: 14, color: "#666", marginBottom: 32, lineHeight: 1.6 }}>
          Cette application a été développée exclusivement pour la boutique{" "}
          <strong><a href="https://www.livedeco.com/" target="_blank">Livedeco.com</a></strong>
        </p>

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