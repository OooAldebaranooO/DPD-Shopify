export async function action({ request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "*",
        "X-Frame-Options": "ALLOWALL",
        "Content-Security-Policy": "frame-ancestors *",
      },
    });
  }
}

export async function loader({ request }) {
  const url = new URL(request.url);
  const ordersParam = url.searchParams.get("orders") || "";

  const config = {
    login:          process.env.DPD_LOGIN,
    password:       process.env.DPD_PASSWORD,
    agencyCode:     process.env.DPD_AGENCY_CODE,
    contractNumber: process.env.DPD_CONTRACT_NUMBER,
    senderName:     process.env.DPD_SENDER_NAME,
    senderAddress:  process.env.DPD_SENDER_ADDRESS,
    senderZip:      process.env.DPD_SENDER_ZIP,
    senderCity:     process.env.DPD_SENDER_CITY,
  };

  const isMock = !config.login || !config.password;

  const orders = ordersParam.split(",").filter(Boolean).map((part) => {
    const segments = part.split("|");
    return {
      name:        decodeURIComponent(segments[0] || ""),
      count:       parseInt(segments[1]) || 1,
      destName:    decodeURIComponent(segments[2] || ""),
      destAddress: decodeURIComponent(segments[3] || ""),
      destZip:     decodeURIComponent(segments[4] || ""),
      destCity:    decodeURIComponent(segments[5] || ""),
      destPhone:   decodeURIComponent(segments[6] || ""),
      weight:      segments[7] || "1",
      destAddress2: decodeURIComponent(segments[8] || ""),
    };
  });

  let allLabels = [];

  for (const order of orders) {
    if (!isMock) {
      try {
        const labels = await callDpdEprint(config, {
          orderName:   order.name,
          count:       order.count,
          destName:    order.destName,
          destAddress: order.destAddress,
          destAddress2: order.destAddress2,
          destZip:     order.destZip,
          destCity:    order.destCity,
          destPhone:   order.destPhone,
          weight:      order.weight,
        });
        allLabels = allLabels.concat(labels);
      } catch (e) {
        console.error(`Erreur EPrint pour ${order.name}:`, e);
        allLabels = allLabels.concat(
          buildMockLabels(order.count, order.name, order.destName,
            order.destAddress, order.destAddress2, order.destZip, order.destCity,
            order.destPhone, order.weight)
        );
      }
    } else {
      allLabels = allLabels.concat(
        buildMockLabels(order.count, order.name, order.destName,
          order.destAddress, order.destAddress2, order.destZip, order.destCity,
          order.destPhone, order.weight)
      );
    }
  }

  return new Response(renderLabels(allLabels, config, isMock), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
}

async function callDpdEprint(config, order) {
  const WS_URL = "https://e-station.cargonet.software/dpd-eprintwebservice/eprintwebservice.asmx";
  const shippingDate = new Date().toLocaleDateString("fr-FR").split("/").join(".");

  const labels = [];

  for (let i = 1; i <= order.count; i++) {
    const soap = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope
  xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
  xmlns:imt="http://www.cargonet.software">
  <soap:Header>
    <imt:UserCredentials>
      <imt:userid>${config.login}</imt:userid>
      <imt:password>${config.password}</imt:password>
    </imt:UserCredentials>
  </soap:Header>
  <soap:Body>
    <CreateShipmentWithLabelsBc xmlns="http://www.cargonet.software">
      <request>
        <customer_countrycode>250</customer_countrycode>
        <customer_centernumber>${config.agencyCode}</customer_centernumber>
        <customer_number>${config.contractNumber}</customer_number>
        <receiveraddress>
          <name>${escapeXml(order.destName)}</name>
          <street>${escapeXml(order.destAddress)}</street>
          <street>${escapeXml(order.destAddress2)}</street>
          <countryPrefix>FR</countryPrefix>
          <zipCode>${order.destZip}</zipCode>
          <city>${escapeXml(order.destCity)}</city>
        </receiveraddress>
        <receiverinfo>
          <contact>
            <type>phone</type>
            <value>${order.destPhone}</value>
          </contact>
        </receiverinfo>
        <shipperaddress>
          <name>${escapeXml(config.senderName)}</name>
          <street>${escapeXml(config.senderAddress)}</street>
          <countryPrefix>FR</countryPrefix>
          <zipCode>${config.senderZip}</zipCode>
          <city>${escapeXml(config.senderCity)}</city>
        </shipperaddress>
        <services>
          <contact>
            <type>predict</type>
            <value>${order.destPhone}</value>
          </contact>
        </services>
        <weight>${order.weight}</weight>
        <shippingdate>${shippingDate}</shippingdate>
        <referencenumber>${escapeXml(order.orderName)}</referencenumber>
        <reference2>${escapeXml(config.senderName.toUpperCase().replace(/\s/g,"_"))}_${order.orderName.replace("#","")}</reference2>
        <labelType>
          <type>PDF</type>
          <format>A6</format>
        </labelType>
      </request>
    </CreateShipmentWithLabelsBc>
  </soap:Body>
</soap:Envelope>`;

    const response = await fetch(WS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "http://www.cargonet.software/CreateShipmentWithLabelsBc",
      },
      body: soap,
    });

    const xml = await response.text();
    console.log(`DPD EPrint réponse ${order.orderName} colis ${i}:`, xml.slice(0, 500));

    const labelMatch = xml.match(/<label>([\s\S]*?)<\/label>/);
    const trackMatch = xml.match(/<parcelnumber>([\s\S]*?)<\/parcelnumber>/i);
    const errMatch   = xml.match(/<ErrorMessage>([\s\S]*?)<\/ErrorMessage>/i);

    if (errMatch) throw new Error(errMatch[1]);

    labels.push({
      orderName:      order.orderName,
      index:          i,
      total:          order.count,
      destName:       order.destName,
      destAddress:    order.destAddress,
      destAddress2:   order.destAddress2,
      destZip:        order.destZip,
      destCity:       order.destCity,
      destPhone:      order.destPhone,
      weight:         order.weight,
      labelPdf:       labelMatch?.[1]?.trim() || null,
      trackingNumber: trackMatch?.[1]?.trim() || null,
      fromApi:        true,
    });
  }

  return labels;
}

function escapeXml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function buildMockLabels(count, orderName, destName, destAddress, destAddress2, destZip, destCity, destPhone, weight) {
  return Array.from({ length: count }, (_, i) => ({
    orderName, index: i + 1, total: count,
    destName, destAddress, destAddress2, destZip, destCity, destPhone, weight,
    labelPdf: null, trackingNumber: null, fromApi: false,
  }));
}

function generateBarcodeSVG(value) {
  const seed = value.split('').reduce((a, c, i) => a + c.charCodeAt(0) * (i + 1), 0);
  const rng  = (i) => ((seed * 9301 + 49297 * (i + 1)) % 233280) / 233280;

  const bars = [];
  let x = 4;
  const h = 150;

  [2,1,1,4,1,2].forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w*1.5}" height="${h}" fill="black"/>`);
    x += w * 1.5;
  });

  for (let i = 0; i < value.length; i++) {
    const widths = [
      1 + Math.floor(rng(i*6)*3),   1 + Math.floor(rng(i*6+1)*2),
      1 + Math.floor(rng(i*6+2)*3), 1 + Math.floor(rng(i*6+3)*2),
      1 + Math.floor(rng(i*6+4)*3), 1 + Math.floor(rng(i*6+5)*2),
    ];
    widths.forEach((w, j) => {
      if (j % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w*1.5}" height="${h}" fill="black"/>`);
      x += w * 1.5;
    });
  }

  [2,3,3,1,1,1,2].forEach((w, i) => {
    if (i % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${w*1.5}" height="${h}" fill="black"/>`);
    x += w * 1.5;
  });

  x += 4;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="${h+14}" viewBox="0 0 ${x} ${h+14}" preserveAspectRatio="none">
    ${bars.join('')}
    <text x="${x/2}" y="${h+11}" text-anchor="middle" font-family="monospace" font-size="9" fill="black">${value}</text>
  </svg>`;
}

function renderLabels(labels, config, isMock) {
  const agencyCode     = config.agencyCode     || "038";
  const contractNumber = config.contractNumber || "12623";

  // Si l'API a retourné des PDFs
  if (!isMock && labels.some(l => l.labelPdf)) {
    const embeds = labels.map(l => l.labelPdf
      ? `<div style="page-break-after:always">
           <embed src="data:application/pdf;base64,${l.labelPdf}" type="application/pdf" width="100%" height="400px"/>
         </div>`
      : "").join("");
    return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
      <style>body{margin:0;} div{margin-bottom:8px;}</style>
      </head><body>${embeds}</body></html>`;
  }

  // Rendu mock HTML
  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>Étiquettes DPD</title>
  <style>
    @page { size: A6 landscape; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; color: #000; background: #fff; }
    .label {
      width: 148mm; min-height: 105mm;
      border: 1px solid #000;
      page-break-after: always;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .label:last-child { page-break-after: auto; }
    .mock-banner {
      background: #fff3cd; border-bottom: 1px solid #ffc107;
      padding: 1.5mm 3mm; font-size: 6.5pt; text-align: center;
    }
    .header {
      display: grid; grid-template-columns: 1fr 8mm 1fr;
      border-bottom: 1px solid #000; min-height: 28mm; position: relative;
    }
    .header-dest { padding: 3mm; }
    .dest-name { font-size: 13pt; font-weight: 700; line-height: 1.2; margin-bottom: 2mm; text-transform: uppercase; }
    .dest-address { font-size: 9pt; line-height: 1.5; }
    .header-separator {
      border-left: 1px solid #000; border-right: 1px solid #000;
      display: flex; align-items: center; justify-content: center;
    }
    .header-separator span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 6pt; letter-spacing: 1px; }
    .header-right { display: grid; grid-template-rows: 1fr 1fr; }
    .header-right-top { border-bottom: 1px solid #000; padding: 2mm; font-size: 7pt; line-height: 1.4; }
    .header-right-top .lbl { font-size: 6pt; color: #444; margin-bottom: 1mm; }
    .header-right-bottom { padding: 2mm; font-size: 6.5pt; line-height: 1.4; }
    .header-right-bottom .lbl { font-size: 6pt; color: #444; margin-bottom: 1mm; }
    .dpd-logo { position: absolute; top: 3mm; right: 3mm; height: 16px; }
    .middle { display: grid; grid-template-columns: 1fr auto; border-bottom: 1px solid #000; font-size: 7.5pt; }
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
    .qr-placeholder { width: 24mm; height: 24mm; border: 1px solid #ccc; display: flex; align-items: center; justify-content: center; font-size: 5pt; color: #aaa; text-align: center; }
    .tracking { display: grid; grid-template-columns: 1fr auto; padding: 1.5mm 3mm; border-bottom: 1px solid #000; align-items: center; }
    .tracking-number { font-size: 18pt; font-weight: 700; }
    .service-code { text-align: right; }
    .service-code .code { font-size: 13pt; font-weight: 700; }
    .service-code .lbl { font-size: 6pt; color: #444; }
    .footer-codes { display: grid; grid-template-columns: auto 1fr auto; align-items: center; padding: 1.5mm 3mm; border-bottom: 1px solid #000; gap: 3mm; }
    .depot-code { background:#000; color:#fff; font-size:16pt; font-weight:700; padding:1mm 4mm; }
    .routing-code { font-size:10pt; font-weight:700; text-align:center; }
    .sort-code { background:#000; color:#fff; font-size:16pt; font-weight:700; padding:1mm 4mm; }
    .barcode-bottom { padding: 2mm 3mm 1.5mm; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .barcode-svg-wrap { width: 90%; }
    .barcode-text { font-size: 6pt; color: #444; margin-top: 1.5mm; text-align: center; }
    .tracking-link { font-size: 6pt; margin-top: 1mm; text-align: center; }
    .tracking-link a { color: #E30613; text-decoration: none; }
  </style>
</head>
<body>
  ${labels.map(({ orderName, index, total, destName, destAddress, destZip, destCity, destPhone, weight, trackingNumber }) => {
    const fakeTrack   = trackingNumber || `1038${Math.floor(Math.random()*9000+1000)}${Math.floor(Math.random()*9000+1000)}${Math.floor(Math.random()*90+10)}C`;
    const fakeRouting = `FR-DPD-${Math.floor(Math.random()*9000+1000)}-${Math.floor(Math.random()*900+100)}-FR-${config.senderZip || "38120"}`;
    const fakeSort    = `${agencyCode}SA`;
    const trackingUrl = `http://www.dpd.fr/tracer_${orderName.replace("#","")}_${agencyCode}${contractNumber}`;

    return `
    <div class="label">
      ${isMock ? `<div class="mock-banner">⚠️ Aperçu — En attente de connexion à l'API DPD</div>` : ""}
      <div class="header">
        <div class="header-dest">
          <div class="dest-name">${destName}</div>
          <div class="dest-address">
            ${destAddress}<br>
            ${destAddress2}<br>
            <strong>${destZip}</strong><br>
            <strong style="font-size:11pt;">${destCity.toUpperCase()}</strong>
          </div>
        </div>
        <div class="header-separator"><span>Destinataire</span></div>
        <div class="header-right">
          <div class="header-right-top">
            <div class="lbl">Expéditeur</div>
            <strong>${config.senderName || "EXPÉDITEUR"}</strong><br>
            ${config.senderAddress || ""}<br>
            ${config.senderZip || ""} ${config.senderCity || ""}
          </div>
          <div class="header-right-bottom">
            <div class="lbl">DPD-Etablissement ${agencyCode}</div>
            215 rue Grande Batie<br>38430 Moirans
          </div>
        </div>
        <img src="https://dpd-shopify-oken.vercel.app/dpd-logo.png" alt="DPD" class="dpd-logo"/>
      </div>
      <div class="middle">
        <div class="middle-left">
          <div class="row"><span class="lbl">Contact</span><span>Tél ${destPhone || "—"}</span></div>
          <div class="row"><span class="lbl">Ref 1</span><span>${orderName.replace("#","")}</span></div>
          <div class="row"><span class="lbl">Ref 2</span><span>${(config.senderName||"EXPEDITEUR").toUpperCase().replace(/\s/g,"_")}_${orderName.replace("#","")}</span></div>
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
        <div class="barcode-svg-wrap">${generateBarcodeSVG(fakeTrack)}</div>
        <div class="barcode-text">
          ${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR")} · EPrintWebservice · ${orderName} · Colis ${index}/${total}
        </div>
        <div class="tracking-link">
          <a href="${trackingUrl}">${trackingUrl}</a>
        </div>
      </div>
    </div>`;
  }).join("")}
</body>
</html>`;
}