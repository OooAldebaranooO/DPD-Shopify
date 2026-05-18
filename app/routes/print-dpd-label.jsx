import db from "../db.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const orderName = url.searchParams.get("orderName") || "Commande";
  const count = Number(url.searchParams.get("count") || "1");
  const shop = url.searchParams.get("shop") || "";

  let config = null;
  if (shop) {
    config = await db.dpdConfig.findUnique({ where: { shop } });
  }

  const labels = Array.from({ length: count }, (_, i) => i + 1);
  const isMock = !config?.login;

  const html = `<!DOCTYPE html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <title>Étiquettes DPD - ${orderName}</title>
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
    ${labels.map((n) => `
      <div class="label">
        ${isMock ? `<div class="mock-banner">⚠️ Aperçu mock — Configuration DPD manquante</div>` : ""}
        <div class="top">
          <div class="brand">DPD</div>
          <div class="badge">COLIS ${n} / ${count}</div>
        </div>
        <div class="section">
          <div class="title">Référence commande</div>
          <div class="box">
            <div class="ref">${orderName}</div>
          </div>
        </div>
        <div class="section">
          <div class="title">Expéditeur</div>
          <div class="box">${config ? `${config.senderName} - ${config.senderAddress} ${config.senderZip} ${config.senderCity}` : "À configurer dans Configuration DPD"}</div>
        </div>
        <div class="barcode">CODE BARRES DPD À VENIR</div>
        <div class="footer">Colis ${n} sur ${count}</div>
      </div>
    `).join("")}
  </body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}