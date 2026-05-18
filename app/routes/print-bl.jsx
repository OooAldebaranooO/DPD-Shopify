import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { cors } = await authenticate.admin(request);

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  const count = Number(url.searchParams.get("count") || "1");
  const orderName = url.searchParams.get("orderName") || "";

  const labels = Array.from({ length: count }, (_, i) => i + 1);

  const html = `
    <!DOCTYPE html>
    <html lang="fr">
      <head>
        <meta charset="utf-8" />
        <title>Bon de livraison</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
          }
          .page {
            page-break-after: always;
            border: 1px solid #ccc;
            padding: 20px;
            min-height: 250mm;
            box-sizing: border-box;
          }
          .page:last-child {
            page-break-after: auto;
          }
          .title {
            font-size: 24px;
            font-weight: bold;
            margin-bottom: 16px;
          }
          .meta {
            font-size: 16px;
            margin-bottom: 8px;
          }
        </style>
      </head>
      <body>
        ${labels
          .map(
            (n) => `
              <div class="page">
                <div class="title">Bon de livraison</div>
                <div class="meta">Commande : ${orderName || orderId}</div>
                <div class="meta">Étiquette : ${n} / ${count}</div>
              </div>
            `,
          )
          .join("")}
      </body>
    </html>
  `;

  return cors(
    new Response(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
      },
    }),
  );
}