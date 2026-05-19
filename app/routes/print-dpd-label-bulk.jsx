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

  const config = {
    login: process.env.DPD_LOGIN,
    senderName: process.env.DPD_SENDER_NAME,
    senderAddress: process.env.DPD_SENDER_ADDRESS,
    senderZip: process.env.DPD_SENDER_ZIP,
    senderCity: process.env.DPD_SENDER_CITY,
    contractNumber: process.env.DPD_CONTRACT_NUMBER,
    agencyCode: process.env.DPD_AGENCY_CODE,
  };

  const orders = ordersParam.split(",").filter(Boolean).map((part) => {
    const lastColon = part.lastIndexOf(":");
    const name = decodeURIComponent(part.substring(0, lastColon));
    const count = parseInt(part.substring(lastColon + 1)) || 1;
    return { name, count };
  });

  const labels = orders.flatMap((order) =>
    Array.from({ length: order.count }, (_, i) => ({
      orderName: order.name,
      index: i + 1,
      total: order.count,
    }))
  );

  const html = renderLabels(labels, config);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
}

function renderLabels(labels, config) {
  const isMock = !config.login;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>Étiquettes DPD</title>
  <style>
    @page { size: A6 landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #000; background: #fff; }

    .label {
      width: 148mm;
      height: 105mm;
      border: 1px solid #000;
      page-break-after: always;
      display: grid;
      grid-template-rows: auto auto 1fr auto auto;
      overflow: hidden;
    }
    .label:last-child { page-break-after: auto; }

    /* HEADER */
    .header {
      display: grid;
      grid-template-columns: 1fr 8mm 1fr;
      border-bottom: 1px solid #000;
      height: 28mm;
    }
    .header-dest {
      padding: 3mm;
      display: flex;
      flex-direction: column;
      justify-content: flex-start;
    }
    .header-dest .dest-name {
      font-size: 13pt;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 2mm;
    }
    .header-dest .dest-address {
      font-size: 9pt;
      line-height: 1.4;
    }
    .header-separator {
      border-left: 1px solid #000;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .header-separator span {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size: 7pt;
      letter-spacing: 1px;
    }
    .header-right {
      display: grid;
      grid-template-rows: 1fr 1fr;
      border-left: 1px solid #000;
    }
    .header-right-top {
      border-bottom: 1px solid #000;
      padding: 2mm;
      font-size: 7pt;
      display: flex;
      flex-direction: column;
    }
    .header-right-top .label-text { font-size: 6pt; color: #444; margin-bottom: 1mm; }
    .header-right-bottom {
      padding: 2mm;
      font-size: 7pt;
      display: flex;
      flex-direction: column;
    }
    .header-logo {
      position: absolute;
      top: 3mm;
      right: 3mm;
    }

    /* INFOS MILIEU */
    .middle {
      display: grid;
      grid-template-columns: 1fr 1fr;
      border-bottom: 1px solid #000;
      font-size: 7.5pt;
    }
    .middle-left {
      padding: 2mm 3mm;
      border-right: 1px solid #000;
    }
    .middle-left .row { margin-bottom: 1.5mm; }
    .middle-left .row span:first-child { font-size: 6.5pt; color: #444; display: block; }
    .middle-right {
      display: grid;
      grid-template-rows: 1fr 1fr;
    }
    .colis-badge {
      border-bottom: 1px solid #000;
      padding: 2mm;
      font-size: 7pt;
    }
    .colis-badge .label-text { font-size: 6pt; color: #444; }
    .poids-badge {
      padding: 2mm;
      font-size: 7pt;
    }
    .poids-badge .label-text { font-size: 6pt; color: #444; }

    /* BARCODE LINEAIRE */
    .barcode-section {
      padding: 2mm 3mm 1mm;
      border-bottom: 1px solid #000;
      text-align: center;
    }
    .barcode-lines {
      display: flex;
      align-items: flex-end;
      justify-content: center;
      height: 10mm;
      gap: 0.3px;
      margin-bottom: 1mm;
    }
    .bar { background: #000; width: 1px; }

    /* TRACKING */
    .tracking {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: 1.5mm 3mm;
      border-bottom: 1px solid #000;
      align-items: center;
    }
    .tracking-number {
      font-size: 16pt;
      font-weight: 700;
      letter-spacing: -0.5px;
    }
    .tracking-number span { font-size: 10pt; font-weight: 400; }
    .service-code {
      text-align: right;
    }
    .service-code .code { font-size: 12pt; font-weight: 700; }
    .service-code .label-text { font-size: 6pt; color: #444; }

    /* FOOTER CODES */
    .footer-codes {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      padding: 1.5mm 3mm;
      border-bottom: 1px solid #000;
      gap: 3mm;
    }
    .depot-code {
      background: #000;
      color: #fff;
      font-size: 14pt;
      font-weight: 700;
      padding: 1mm 3mm;
    }
    .routing-code {
      font-size: 9pt;
      font-weight: 700;
      text-align: center;
    }
    .sort-code {
      background: #000;
      color: #fff;
      font-size: 14pt;
      font-weight: 700;
      padding: 1mm 3mm;
    }

    /* BARCODE 2D */
    .barcode-2d-section {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: 1.5mm 3mm;
      align-items: center;
      gap: 3mm;
    }
    .barcode-2d-text {
      font-size: 6pt;
      color: #444;
      line-height: 1.5;
    }
    .qr-placeholder {
      width: 18mm;
      height: 18mm;
      border: 1px solid #ccc;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 5pt;
      color: #888;
    }

    .mock-banner {
      background: #fff3cd;
      border-bottom: 1px solid #ffc107;
      padding: 1.5mm 3mm;
      font-size: 6.5pt;
      text-align: center;
    }
  </style>
</head>
<body>
  ${labels.map(({ orderName, index, total }) => {
    const fakeTrack = `1038${Math.floor(Math.random()*9000+1000)} ${Math.floor(Math.random()*9000+1000)} ${Math.floor(Math.random()*90+10)} C`;
    const agencyCode = config.agencyCode || "063";
    const fakeSort = `${Math.floor(Math.random()*900+100)}SA`;
    const fakeRouting = `FR-DPD-${Math.floor(Math.random()*9000+1000)}-${Math.floor(Math.random()*900+100)}-FR-${config.senderZip || "38120"}`;

    // Barres simulées
    const bars = Array.from({length: 80}, () => ({
      h: Math.floor(Math.random() * 6 + 5),
      w: Math.random() > 0.6 ? 2 : 1,
    }));

    return `
    <div class="label">
      ${isMock ? `<div class="mock-banner">⚠️ Aperçu — Les codes barres seront générés par l'API DPD</div>` : ""}

      <div class="header" style="position:relative;">
        <div class="header-dest">
          <div class="dest-name">NOM DESTINATAIRE</div>
          <div class="dest-address">
            Adresse ligne 1<br>
            Code postal VILLE
          </div>
        </div>
        <div class="header-separator"><span>Destinataire</span></div>
        <div class="header-right">
          <div class="header-right-top">
            <span class="label-text">Expéditeur</span>
            <strong>${config.senderName || "EXPÉDITEUR"}</strong>
            ${config.senderAddress || ""}${config.senderAddress ? "<br>" : ""}
            ${config.senderZip || ""} ${config.senderCity || ""}
          </div>
          <div class="header-right-bottom">
            <span class="label-text">DPD-Etablissement ${agencyCode}</span>
            <span style="font-size:6pt;">Adresse dépôt DPD</span>
          </div>
        </div>
        <img src="https://dpd-shopify-oken.vercel.app/dpd-logo.png" alt="DPD"
          style="position:absolute;top:3mm;right:3mm;height:14px;" />
      </div>

      <div class="middle">
        <div class="middle-left">
          <div class="row">
            <span>Contact</span>
            <span>Tél 0600000000</span>
          </div>
          <div class="row">
            <span>Ref 1</span>
            <span>${orderName.replace("#","")}</span>
          </div>
          <div class="row">
            <span>Ref 2</span>
            <span>${config.senderName ? config.senderName.toUpperCase().replace(/\s/g,"_") : "LIVEDECO"}_${Math.floor(Math.random()*90000+10000)}</span>
          </div>
          <div class="row" style="margin-top:1mm;">
            <span></span>
            <span style="font-size:8pt;font-style:italic;">Predict</span>
          </div>
        </div>
        <div class="middle-right">
          <div class="colis-badge">
            <div class="label-text">Colis</div>
            <strong>${index}/${total}</strong>
          </div>
          <div class="poids-badge">
            <div class="label-text">Poids</div>
            <strong>— kg</strong>
          </div>
        </div>
      </div>

      <div class="barcode-section">
        <div class="barcode-lines">
          ${bars.map(b => `<div class="bar" style="height:${b.h}mm;width:${b.w}px;"></div>`).join("")}
        </div>
      </div>

      <div class="tracking">
        <div class="tracking-number">${fakeTrack}</div>
        <div class="service-code">
          <div class="code">D-B2C</div>
          <div class="label-text">Service</div>
        </div>
      </div>

      <div class="footer-codes">
        <div class="depot-code">L</div>
        <div class="routing-code">${fakeRouting}</div>
        <div class="sort-code">${agencyCode}${fakeSort.slice(3)}</div>
      </div>

      <div class="barcode-2d-section">
        <div class="barcode-2d-text">
          ${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR")} · EPrintWebservice<br>
          ${orderName} · Colis ${index}/${total}
        </div>
        <div class="qr-placeholder">QR</div>
      </div>
    </div>
  `}).join("")}
</body>
</html>`;
}