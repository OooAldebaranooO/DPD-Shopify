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
  const orderName   = url.searchParams.get("orderName")   || "Commande";
  const count       = Number(url.searchParams.get("count") || "1");
  const destName    = url.searchParams.get("destName")    || "NOM DESTINATAIRE";
  const destAddress = url.searchParams.get("destAddress") || "";
  const destAddress2 = url.searchParams.get("destAddress2") || "";
  const destZip     = url.searchParams.get("destZip")     || "";
  const destCity    = url.searchParams.get("destCity")    || "";
  const destPhone   = url.searchParams.get("destPhone")   || "";
  const weight      = url.searchParams.get("weight")      || "—";

  const config = {
    login:         process.env.DPD_LOGIN,
    senderName:    process.env.DPD_SENDER_NAME,
    senderAddress: process.env.DPD_SENDER_ADDRESS,
    senderAddress2: process.env.DPD_SENDER_ADDRESS2,
    senderZip:     process.env.DPD_SENDER_ZIP,
    senderCity:    process.env.DPD_SENDER_CITY,
    agencyCode:    process.env.DPD_AGENCY_CODE,
  };

  const labels = Array.from({ length: count }, (_, i) => ({
    orderName, index: i + 1, total: count,
    destName, destAddress, destAddress2, destZip, destCity, destPhone, weight,
  }));

  return new Response(renderLabels(labels, config), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
}

function generateBarcodeSVG(value) {
  const seed = value.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
  const rng = (i) => ((seed * 9301 + 49297 * (i + 1)) % 233280) / 233280;

  const bars = [];
  let x = 4;
  const h = 50;

  // Start
  [2, 1, 1, 4, 1, 2].forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w * 1.5}" height="${h}" fill="black"/>`);
    x += w * 1.5;
  });

  // Data
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i) - 32;
    const widths = [
      1 + Math.floor(rng(i * 6) * 3),
      1 + Math.floor(rng(i * 6 + 1) * 2),
      1 + Math.floor(rng(i * 6 + 2) * 3),
      1 + Math.floor(rng(i * 6 + 3) * 2),
      1 + Math.floor(rng(i * 6 + 4) * 3),
      1 + Math.floor(rng(i * 6 + 5) * 2),
    ];
    widths.forEach((w, j) => {
      if (j % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w * 1.5}" height="${h}" fill="black"/>`);
      x += w * 1.5;
    });
  }

  // Stop
  [2, 3, 3, 1, 1, 1, 2].forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w * 1.5}" height="${h}" fill="black"/>`);
    x += w * 1.5;
  });

  x += 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h + 14}" viewBox="0 0 ${x} ${h + 14}" preserveAspectRatio="none">
    ${bars.join('')}
    <text x="${x / 2}" y="${h + 11}" text-anchor="middle" font-family="monospace" font-size="9" fill="black">${value}</text>
  </svg>`;
}

function renderLabels(labels, config) {
  const isMock = !config.login;
  const agencyCode = config.agencyCode || "038";

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
      min-height: 105mm;
      border: 1px solid #000;
      page-break-after: always;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .label:last-child { page-break-after: auto; }
    .mock-banner {
      background: #fff3cd;
      border-bottom: 1px solid #ffc107;
      padding: 1.5mm 3mm;
      font-size: 6.5pt;
      text-align: center;
    }
    .header {
      display: grid;
      grid-template-columns: 1fr 8mm 1fr;
      border-bottom: 1px solid #000;
      min-height: 28mm;
      position: relative;
    }
    .header-dest { padding: 3mm; }
    .dest-name {
      font-size: 13pt;
      font-weight: 700;
      line-height: 1.2;
      margin-bottom: 2mm;
      text-transform: uppercase;
    }
    .dest-address { font-size: 9pt; line-height: 1.5; }
    .header-separator {
      border-left: 1px solid #000;
      border-right: 1px solid #000;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .header-separator span {
      writing-mode: vertical-rl;
      transform: rotate(180deg);
      font-size: 6pt;
      letter-spacing: 1px;
    }
    .header-right { display: grid; grid-template-rows: 1fr 1fr; }
    .header-right-top {
      border-bottom: 1px solid #000;
      padding: 2mm;
      font-size: 7pt;
      line-height: 1.4;
    }
    .header-right-top .label-text { font-size: 6pt; color: #444; margin-bottom: 1mm; }
    .header-right-bottom { padding: 2mm; font-size: 6.5pt; line-height: 1.4; }
    .header-right-bottom .label-text { font-size: 6pt; color: #444; margin-bottom: 1mm; }
    .dpd-logo { position: absolute; top: 3mm; right: 3mm; height: 16px; }
    .middle {
      display: grid;
      grid-template-columns: 1fr auto;
      border-bottom: 1px solid #000;
      font-size: 7.5pt;
    }
    .middle-left { padding: 2mm 3mm; border-right: 1px solid #000; }
    .row { margin-bottom: 1.5mm; }
    .row .lbl { font-size: 6.5pt; color: #444; display: block; }
    .middle-right { display: grid; grid-template-columns: auto auto; }
    .colis-poids { display: flex; flex-direction: column; border-right: 1px solid #000; }
    .colis-badge { padding: 2mm 4mm; border-bottom: 1px solid #000; flex: 1; }
    .colis-badge .lbl { font-size: 6pt; color: #444; }
    .colis-badge strong { font-size: 16pt; font-weight: 700; }
    .poids-badge { padding: 2mm 4mm; flex: 1; }
    .poids-badge .lbl { font-size: 6pt; color: #444; }
    .poids-badge strong { font-size: 16pt; font-weight: 700; }
    .qr-block { padding: 2mm; display: flex; align-items: center; justify-content: center; }
    .qr-placeholder {
      width: 24mm; height: 24mm;
      border: 1px solid #ccc;
      display: flex; align-items: center; justify-content: center;
      font-size: 5pt; color: #aaa; text-align: center;
    }
    .tracking {
      display: grid;
      grid-template-columns: 1fr auto;
      padding: 1.5mm 3mm;
      border-bottom: 1px solid #000;
      align-items: center;
    }
    .tracking-number { font-size: 18pt; font-weight: 700; letter-spacing: -0.5px; }
    .service-code { text-align: right; }
    .service-code .code { font-size: 13pt; font-weight: 700; }
    .service-code .lbl { font-size: 6pt; color: #444; }
    .footer-codes {
      display: grid;
      grid-template-columns: auto 1fr auto;
      align-items: center;
      padding: 1.5mm 3mm;
      border-bottom: 1px solid #000;
      gap: 3mm;
    }
    .depot-code { background:#000; color:#fff; font-size:16pt; font-weight:700; padding:1mm 4mm; }
    .routing-code { font-size:10pt; font-weight:700; text-align:center; }
    .sort-code { background:#000; color:#fff; font-size:16pt; font-weight:700; padding:1mm 4mm; }
    .barcode-bottom {
      padding: 2mm 3mm 1.5mm;
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }
    .barcode-svg-wrap { width: 90%; }
    .barcode-text { font-size: 6pt; color: #444; margin-top: 1.5mm; text-align: center; }
  </style>
</head>
<body>
  ${labels.map(({ orderName, index, total, destName, destAddress, destZip, destCity, destPhone, weight }) => {
    const fakeTrack = `1038${Math.floor(Math.random()*9000+1000)}${Math.floor(Math.random()*9000+1000)}${Math.floor(Math.random()*90+10)}C`;
    const fakeRouting = `FR-DPD-${Math.floor(Math.random()*9000+1000)}-${Math.floor(Math.random()*900+100)}-FR-${config.senderZip || "38120"}`;
    const fakeSort = `${agencyCode}SA`;
    return `
    <div class="label">
      ${isMock ? `<div class="mock-banner">⚠️ Aperçu — Les codes barres seront générés par l'API DPD</div>` : ""}
      <div class="header">
        <div class="header-dest">
          <div class="dest-name">${destName}</div>
          <div class="dest-address">
            ${destAddress}<br>
            <strong>${destZip}</strong><br>
            <strong style="font-size:11pt;">${destCity.toUpperCase()}</strong>
          </div>
        </div>
        <div class="header-separator"><span>Destinataire</span></div>
        <div class="header-right">
          <div class="header-right-top">
            <div class="label-text">Expéditeur</div>
            <strong>${config.senderName || "EXPÉDITEUR"}</strong><br>
            ${config.senderAddress || ""}<br>
            ${config.senderAddress2 || ""}<br>
            ${config.senderZip || ""} ${config.senderCity || ""}
          </div>
          <div class="header-right-bottom">
            <div class="label-text">DPD-Etablissement ${agencyCode}</div>
            215 rue Grande Batie<br>
            38430 Moirans
          </div>
        </div>
        <img src="https://dpd-shopify-oken.vercel.app/dpd-logo.png" alt="DPD" class="dpd-logo" />
      </div>
      <div class="middle">
        <div class="middle-left">
          <div class="row"><span class="lbl">Contact</span><span>Tél ${destPhone || "—"}</span></div>
          <div class="row"><span class="lbl">Ref 1</span><span>${orderName.replace("#", "")}</span></div>
          <div class="row"><span class="lbl">Ref 2</span><span>${(config.senderName || "EXPEDITEUR").toUpperCase().replace(/\s/g,"_")}_${orderName.replace("#","")}</span></div>
          <div class="row" style="margin-top:1mm;"><span class="lbl">Info</span><span style="font-style:italic;">Predict</span></div>
        </div>
        <div class="middle-right">
          <div class="colis-poids">
            <div class="colis-badge"><div class="lbl">Colis</div><strong>${index}/${total}</strong></div>
            <div class="poids-badge"><div class="lbl">Poids</div><strong>${weight} kg</strong></div>
          </div>
          <div class="qr-block"><div class="qr-placeholder">QR CODE<br>DPD</div></div>
        </div>
      </div>
      <div class="tracking">
        <div class="tracking-number">${fakeTrack}</div>
        <div class="service-code"><div class="code">D-B2C</div><div class="lbl">Service</div></div>
      </div>
      <div class="footer-codes">
        <div class="depot-code">L</div>
        <div class="routing-code">${fakeRouting}</div>
        <div class="sort-code">${fakeSort}</div>
      </div>
      <div class="barcode-bottom">
        <div class="barcode-svg-wrap">
          ${generateBarcodeSVG(fakeTrack)}
        </div>
        <div class="barcode-text">
          ${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR")} · EPrintWebservice · ${orderName} · Colis ${index}/${total}
        </div>
      </div>
    </div>`;
  }).join("")}
</body>
</html>`;
}