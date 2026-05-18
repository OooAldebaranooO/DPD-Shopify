import db from "../db.server";

export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "*",
      },
    });
  }
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const ordersParam = url.searchParams.get("orders") || "";
  const shop = url.searchParams.get("shop") || "";

  let config = null;
  if (shop) {
    config = await db.dpdConfig.findUnique({ where: { shop } });
  }

  const isMock = !config?.login;

  // Parse "orderName:count,orderName:count,..."
  const orders = ordersParam.split(",").filter(Boolean).map((part) => {
    const lastColon = part.lastIndexOf(":");
    const name = decodeURIComponent(part.substring(0, lastColon));
    const count = parseInt(part.substring(lastColon + 1)) || 1;
    return { name, count };
  });

  // Génère une page par colis
  const labels = orders.flatMap((order) =>
    Array.from({ length: order.count }, (_, i) => ({
      orderName: order.name,
      index: i + 1,
      total: order.count,
    }))
  );

  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Étiquettes DPD</title>
    <style>
      @page { size: A4; margin: 10mm; }
      body { margin: 0; font-family: Arial, sans-serif; color: #111; }
      .label {
        page-break-after: always;
        min-height: 250mm;
        box-sizing: border-box;
        border: 2px solid #222;
        padding: 16mm;
      }
      .label:last-child { page-break-after: auto; }
      .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; }
      .brand { font-size: 28px; font-weight: 700; color: #dc0032; }
      .badge { border: 1px solid #222; padding: 6px 10px; font-size: 14px; font-weight: 700; }
      .section { margin-bottom: 18px; }
      .title { font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
      .box { border: 1px solid #333; padding: 10px 12px; min-height: 60px; }
      .ref { font-size: 20px; font-weight: 700; }
      .barcode {
        margin-top: 20px;
        border: 1px dashed #555;
        height: 80px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 14px;
        letter-spacing: 2px;
      }
      .mock-banner {
        background: #fff3cd;
        border: 1px solid #ffc107;
        padding: 8px 12px;
        margin-bottom: 16px;
        font-size: 12px;
        border-radius: 4px;
      }
      .footer { margin-top: 20px; font-size: 12px; color: #444; }
    </style>
  </head>
  <body>
    ${labels.map((label) => `
      <div class="label">
        ${isMock ? `<div class="mock-banner">⚠️ Aperçu mock — Configuration DPD manquante</div>` : ""}
        <div class="top">
          <div class="brand">DPD</div>
          <div class="badge">COLIS ${label.index} / ${label.total}</div>
        </div>
        <div class="section">
          <div class="title">Référence commande</div>
          <div class="box">
            <div class="ref">${label.orderName}</div>
          </div>
        </div>
        <div class="section">
          <div class="title">Expéditeur</div>
          <div class="box">${config ? `${config.senderName} - ${config.senderAddress} ${config.senderZip} ${config.senderCity}` : "À configurer dans Configuration DPD"}</div>
        </div>
        <div class="barcode">CODE BARRES DPD À VENIR</div>
        <div class="footer">Colis ${label.index} sur ${label.total}</div>
      </div>
    `).join("")}
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
}