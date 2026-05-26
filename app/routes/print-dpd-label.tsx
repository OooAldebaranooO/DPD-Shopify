import QRCode from 'qrcode';
import bwipjs from 'bwip-js';
import { kv } from '@vercel/kv';

// ── Types ────────────────────────────────────────────────────────────────────

interface Config {
  login:          string | undefined;
  password:       string | undefined;
  agencyCode:     string | undefined;
  contractNumber: string | undefined;
  senderName:     string | undefined;
  senderName2:    string | undefined;
  senderAddress:  string | undefined;
  senderZip:      string | undefined;
  senderCity:     string | undefined;
}

interface OrderItem {
  weight: number;
  sku:    string;
  title:  string;
}

interface OrderPayload {
  orderName:    string;
  destName:     string;
  destCompany:  string;
  destAddress:  string;
  destAddress2: string;
  destZip:      string;
  destCity:     string;
  destPhone:    string;
  items:        OrderItem[];
}

interface LabelData {
  orderName:      string;
  index:          number;
  total:          number;
  destName:       string;
  destCompany:    string;
  destAddress:    string;
  destAddress2:   string;
  destZip:        string;
  destCity:       string;
  destPhone:      string;
  weight:         string;
  sku:            string;
  title:          string;
  labelPdf:       string | null;
  trackingNumber: string | null;
  fromApi:        boolean;
}

// ── Action (OPTIONS) ─────────────────────────────────────────────────────────

export async function action({ request }: { request: Request }) {
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

// ── Loader ───────────────────────────────────────────────────────────────────

export async function loader({ request }: { request: Request }) {
  const url   = new URL(request.url);
  const token = url.searchParams.get("token");

  const config: Config = {
    login:          process.env.DPD_LOGIN,
    password:       process.env.DPD_PASSWORD,
    agencyCode:     process.env.DPD_AGENCY_CODE,
    contractNumber: process.env.DPD_CONTRACT_NUMBER,
    senderName:     process.env.DPD_SENDER_NAME,
    senderName2:    process.env.DPD_SENDER_NAME2,
    senderAddress:  process.env.DPD_SENDER_ADDRESS,
    senderZip:      process.env.DPD_SENDER_ZIP,
    senderCity:     process.env.DPD_SENDER_CITY,
  };

  const isMock = !config.login || !config.password;
  let labels: LabelData[] = [];

  if (token) {
    // ── MODE BULK : données depuis Vercel KV via token ──
    try {
      const raw = await kv.get<string>(`print:${token}`);
      if (raw) {
        const orders: OrderPayload[] = typeof raw === 'string' ? JSON.parse(raw) : raw as OrderPayload[];
        await kv.del(`print:${token}`);

        for (const order of orders) {
          const total = order.items.length;
          order.items.forEach((item, i) => {
            labels.push({
              orderName:    order.orderName,
              index:        i + 1,
              total,
              destName:     order.destName,
              destCompany:  order.destCompany,
              destAddress:  order.destAddress,
              destAddress2: order.destAddress2,
              destZip:      order.destZip,
              destCity:     order.destCity,
              destPhone:    order.destPhone,
              weight:       item.weight.toFixed(2),
              sku:          item.sku,
              title:        item.title,
              labelPdf:     null,
              trackingNumber: null,
              fromApi:      false,
            });
          });
        }
      }
    } catch (e) {
      console.error("KV get error:", e);
    }
  } else {
    // ── MODE INDIVIDUEL : données depuis les paramètres URL ──
    const orderName    = url.searchParams.get("orderName")    || "Commande";
    const count        = Number(url.searchParams.get("count") || "1");
    const destName     = url.searchParams.get("destName")     || "NOM DESTINATAIRE";
    const destAddress  = url.searchParams.get("destAddress")  || "";
    const destAddress2 = url.searchParams.get("destAddress2") || "";
    const destCompany  = url.searchParams.get("destCompany")  || "";
    const destZip      = url.searchParams.get("destZip")      || "";
    const destCity     = url.searchParams.get("destCity")     || "";
    const destPhone    = url.searchParams.get("destPhone")    || "";
    const weights      = url.searchParams.get("weights")      || "1";
    const skusParam    = url.searchParams.get("skus")         || "";
    const titlesParam  = url.searchParams.get("titles")       || "";

    if (!isMock) {
      try {
        labels = await callDpdEprint(config, {
          orderName, count, destName, destCompany, destAddress, destAddress2,
          destZip, destCity, destPhone, weights, skusParam, titlesParam,
        });
      } catch (e) {
        console.error("Erreur EPrint:", (e as Error).message);
        labels = buildMockLabels(count, orderName, destName, destCompany, destAddress, destAddress2,
          destZip, destCity, destPhone, weights, skusParam, titlesParam);
      }
    } else {
      labels = buildMockLabels(count, orderName, destName, destCompany, destAddress, destAddress2,
        destZip, destCity, destPhone, weights, skusParam, titlesParam);
    }
  }

  // ── MODE BULK avec API DPD ──
  if (token && labels.length > 0 && !isMock) {
    try {
      labels = await callDpdEprintBulk(config, labels);
    } catch (e) {
      console.error("Erreur EPrint bulk:", (e as Error).message);
      // garde les labels mock en cas d'erreur
    }
  }

  return new Response(await renderLabels(labels, config, isMock), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
      "X-Frame-Options": "ALLOWALL",
      "Content-Security-Policy": "frame-ancestors *",
    },
  });
}

// ── DPD EPrint SOAP — Mode individuel (OrderParams) ──────────────────────────

interface OrderParams {
  orderName:   string;
  count:       number;
  destName:    string;
  destCompany: string;
  destAddress: string;
  destAddress2:string;
  destZip:     string;
  destCity:    string;
  destPhone:   string;
  weights:     string;
  skusParam:   string;
  titlesParam: string;
}

async function callDpdEprint(config: Config, order: OrderParams): Promise<LabelData[]> {
  const WS_URL = "https://e-station.cargonet.software/dpd-eprintwebservice/eprintwebservice.asmx";
  const shippingDate = new Date().toLocaleDateString("fr-FR").split("/").join(".");

  const weightsList = String(order.weights || "1").split(",").map(w => parseFloat(w) || 0);
  const skusList    = String(order.skusParam   || "").split("|").map(s => decodeURIComponent(s));
  const titlesList  = String(order.titlesParam || "").split("|").map(s => decodeURIComponent(s));

  const labels: LabelData[] = [];

  for (let i = 1; i <= order.count; i++) {
    const itemWeight = (weightsList[i - 1] ?? weightsList[0] ?? 1).toFixed(2);
    const itemSku    = skusList[i - 1]   ?? "";
    const itemTitle  = titlesList[i - 1] ?? "";
    const ref1       = itemSku || order.orderName;

    const xml = await soapRequest(config, {
      destName: order.destName, destCompany: order.destCompany,
      destAddress: order.destAddress, destAddress2: order.destAddress2,
      destZip: order.destZip, destCity: order.destCity, destPhone: order.destPhone,
      orderName: order.orderName, ref1, weight: itemWeight, shippingDate,
    });

    const labelMatch = xml.match(/<label>([\s\S]*?)<\/label>/);
    const trackMatch = xml.match(/<parcelnumber>([\s\S]*?)<\/parcelnumber>/i);
    const errMatch   = xml.match(/<ErrorMessage>([\s\S]*?)<\/ErrorMessage>/i);
    if (errMatch) throw new Error(errMatch[1]);

    labels.push({
      orderName: order.orderName, index: i, total: order.count,
      destName: order.destName, destCompany: order.destCompany,
      destAddress: order.destAddress, destAddress2: order.destAddress2,
      destZip: order.destZip, destCity: order.destCity, destPhone: order.destPhone,
      weight: itemWeight, sku: itemSku, title: itemTitle,
      labelPdf:       labelMatch?.[1]?.trim() || null,
      trackingNumber: trackMatch?.[1]?.trim() || null,
      fromApi: true,
    });
  }

  return labels;
}

// ── DPD EPrint SOAP — Mode bulk (LabelData[]) ────────────────────────────────

async function callDpdEprintBulk(config: Config, labels: LabelData[]): Promise<LabelData[]> {
  const shippingDate = new Date().toLocaleDateString("fr-FR").split("/").join(".");
  const result: LabelData[] = [];

  for (const label of labels) {
    const xml = await soapRequest(config, {
      destName: label.destName, destCompany: label.destCompany,
      destAddress: label.destAddress, destAddress2: label.destAddress2,
      destZip: label.destZip, destCity: label.destCity, destPhone: label.destPhone,
      orderName: label.orderName, ref1: label.sku || label.orderName,
      weight: label.weight, shippingDate,
    });

    const labelMatch = xml.match(/<label>([\s\S]*?)<\/label>/);
    const trackMatch = xml.match(/<parcelnumber>([\s\S]*?)<\/parcelnumber>/i);
    const errMatch   = xml.match(/<ErrorMessage>([\s\S]*?)<\/ErrorMessage>/i);
    if (errMatch) throw new Error(errMatch[1]);

    result.push({
      ...label,
      labelPdf:       labelMatch?.[1]?.trim() || null,
      trackingNumber: trackMatch?.[1]?.trim() || null,
      fromApi: true,
    });
  }

  return result;
}

// ── SOAP helper partagé ───────────────────────────────────────────────────────

async function soapRequest(config: Config, p: {
  destName: string; destCompany: string; destAddress: string; destAddress2: string;
  destZip: string; destCity: string; destPhone: string;
  orderName: string; ref1: string; weight: string; shippingDate: string;
}): Promise<string> {
  const WS_URL = "https://e-station.cargonet.software/dpd-eprintwebservice/eprintwebservice.asmx";

  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:imt="http://www.cargonet.software">
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
          <name>${escapeXml(p.destCompany || p.destName)}</name>
          <street>${escapeXml(p.destAddress)}</street>
          ${p.destAddress2 ? `<houseNo>${escapeXml(p.destAddress2)}</houseNo>` : ""}
          <countryPrefix>FR</countryPrefix>
          <zipCode>${p.destZip}</zipCode>
          <city>${escapeXml(p.destCity)}</city>
        </receiveraddress>
        <receiverinfo>
          <contact><type>phone</type><value>${p.destPhone}</value></contact>
        </receiverinfo>
        <shipperaddress>
          <name>${escapeXml(config.senderName ?? "")}</name>
          <street>${escapeXml(config.senderAddress ?? "")}</street>
          <countryPrefix>FR</countryPrefix>
          <zipCode>${config.senderZip}</zipCode>
          <city>${escapeXml(config.senderCity ?? "")}</city>
        </shipperaddress>
        <services>
          <contact><type>predict</type><value>${p.destPhone}</value></contact>
        </services>
        <weight>${p.weight}</weight>
        <shippingdate>${p.shippingDate}</shippingdate>
        <referencenumber>${escapeXml(p.ref1)}</referencenumber>
        <reference2>${escapeXml(
          (config.senderName2 || config.senderName || "EXPEDITEUR")!
            .toUpperCase().replace(/\s/g, "_")
        )}_${p.orderName.replace("#", "")}</reference2>
        <labelType><type>PDF</type><format>A6</format></labelType>
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
    body,
  });

  return response.text();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function escapeXml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildMockLabels(
  count: number, orderName: string, destName: string, destCompany: string,
  destAddress: string, destAddress2: string, destZip: string, destCity: string,
  destPhone: string, weights: string, skusParam: string, titlesParam: string
): LabelData[] {
  const weightsList = String(weights    || "1").split(",").map(w => parseFloat(w) || 0);
  const skusList    = String(skusParam  || "").split("|").map(s => decodeURIComponent(s));
  const titlesList  = String(titlesParam|| "").split("|").map(s => decodeURIComponent(s));
  return Array.from({ length: count }, (_, i) => ({
    orderName, index: i + 1, total: count,
    destName, destCompany, destAddress, destAddress2, destZip, destCity, destPhone,
    weight:   (weightsList[i] ?? weightsList[0] ?? 1).toFixed(2),
    sku:      skusList[i]   ?? "",
    title:    titlesList[i] ?? "",
    labelPdf: null, trackingNumber: null, fromApi: false,
  }));
}

// ── Barcode & QR ─────────────────────────────────────────────────────────────

async function generateBarcodeBase64(value: string): Promise<string> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128', text: value, scale: 3, height: 12,
      includetext: true, textxalign: 'center', textsize: 9,
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) {
    console.error("Erreur barcode:", e);
    return "";
  }
}

async function generateQrSvg(value: string): Promise<string> {
  return QRCode.toString(value, {
    type: 'svg', margin: 1, width: 60,
    color: { dark: '#000000', light: '#ffffff' },
  });
}

// ── Render ───────────────────────────────────────────────────────────────────

async function renderLabels(labels: LabelData[], config: Config, isMock: boolean): Promise<string> {
  const agencyCode = config.agencyCode || "038";

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

  const labelsWithData = await Promise.all(labels.map(async (label) => {
    const trackingNumber = label.trackingNumber
      || `1038${Math.floor(Math.random()*9000+1000)}${Math.floor(Math.random()*9000+1000)}${Math.floor(Math.random()*90+10)}C`;
    const fakeRouting = `FR-DPD-${Math.floor(Math.random()*9000+1000)}-${Math.floor(Math.random()*900+100)}-FR-${config.senderZip || "38120"}`;
    const fakeSort    = `${agencyCode}SA`;
    const ref1Display = label.sku || label.orderName.replace("#", "");

    const [barcodeDataUrl, qrSvg] = await Promise.all([
      generateBarcodeBase64(trackingNumber),
      generateQrSvg(trackingNumber),
    ]);

    return { ...label, trackingNumber, fakeRouting, fakeSort, ref1Display, barcodeDataUrl, qrSvg };
  }));

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>Étiquettes DPD</title>
  <style>
    @page { size: 105mm 148mm; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 105mm; margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; background: #fff; }
    .label { width: 105mm; height: 148mm; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; }
    .label:last-child { page-break-after: auto; }
    .mock-banner { background: #fff3cd; border-bottom: 1px solid #ffc107; padding: 1mm 2mm; font-size: 5.5pt; text-align: center; }
    .header { display: grid; grid-template-columns: 1fr 6mm 1fr; border-bottom: 1px solid #000; min-height: 22mm; position: relative; }
    .header-dest { padding: 2mm; }
    .dest-name { font-size: 10pt; font-weight: 700; line-height: 1.2; margin-bottom: 1.5mm; text-transform: uppercase; }
    .dest-address { font-size: 7.5pt; line-height: 1.4; }
    .header-separator { border-left: 1px solid #000; border-right: 1px solid #000; display: flex; align-items: center; justify-content: center; }
    .header-separator span { writing-mode: vertical-rl; font-size: 7pt; letter-spacing: 1px; }
    .header-right { display: grid; grid-template-rows: 1fr 1fr; }
    .header-right-top { border-bottom: 1px solid #000; padding: 1.5mm; font-size: 6pt; line-height: 1.3; }
    .header-right-top .lbl { font-size: 5pt; color: #444; margin-bottom: 0.5mm; }
    .header-right-bottom { padding: 1.5mm; font-size: 5.5pt; line-height: 1.3; }
    .header-right-bottom .lbl { font-size: 5pt; color: #444; margin-bottom: 0.5mm; }
    .dpd-logo { position: absolute; top: 2mm; right: 2mm; height: 32px; }
    .middle { display: grid; grid-template-columns: 1fr auto; border-bottom: 1px solid #000; font-size: 6.5pt; }
    .middle-left { padding: 1.5mm 2mm; border-right: 1px solid #000; }
    .row { margin-bottom: 1mm; }
    .row .lbl { font-size: 5.5pt; color: #444; display: block; }
    .middle-right { display: grid; grid-template-columns: auto auto; }
    .colis-poids { display: flex; flex-direction: column; border-right: 1px solid #000; }
    .colis-badge { padding: 1.5mm 3mm; border-bottom: 1px solid #000; flex: 1; }
    .colis-badge .lbl { font-size: 5pt; color: #444; }
    .colis-badge strong { font-size: 13pt; font-weight: 700; }
    .poids-badge { padding: 1.5mm 3mm; flex: 1; }
    .poids-badge .lbl { font-size: 5pt; color: #444; }
    .poids-badge strong { font-size: 13pt; font-weight: 700; }
    .qr-block { padding: 1.5mm; display: flex; align-items: center; justify-content: center; width: 27.65mm; height: 27.65mm; }
    .qr-block svg { width: 100%; height: 100%; }
    .tracking { display: grid; grid-template-columns: 1fr auto; padding: 1mm 2mm; border-bottom: 1px solid #000; align-items: center; }
    .tracking-number { font-size: 14pt; font-weight: 700; }
    .service-code { text-align: right; }
    .service-code .code { font-size: 10pt; font-weight: 700; }
    .service-code .lbl { font-size: 5pt; color: #444; }
    .footer-codes { display: grid; grid-template-columns: auto 1fr auto; align-items: center; padding: 1mm 2mm; border-bottom: 1px solid #000; gap: 2mm; }
    .depot-code { background: #000 !important; color: #fff !important; font-size: 13pt; font-weight: 700; padding: 0.5mm 3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .routing-code { font-size: 14pt; font-weight: 700; text-align: center; }
    .sort-code { background: #000 !important; color: #fff !important; font-size: 13pt; font-weight: 700; padding: 0.5mm 3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .barcode-bottom { padding: 1.5mm 2mm 1mm; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .barcode-img { width: 90%; height: auto; image-rendering: pixelated; }
    .barcode-text { font-size: 5pt; color: #444; margin-top: 1mm; text-align: center; }
    @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
  </style>
</head>
<body>
  ${labelsWithData.map(({ orderName, index, total, destName, destCompany, destAddress, destAddress2,
    destZip, destCity, destPhone, weight,
    trackingNumber, fakeRouting, fakeSort, ref1Display, barcodeDataUrl, qrSvg }) => `
    <div class="label">
      ${isMock ? `<div class="mock-banner">⚠️ Aperçu — En attente de connexion à l'API DPD</div>` : ""}
      <div class="header">
        <div class="header-dest">
          <div class="dest-name">
            ${destCompany
              ? `${destCompany}<br/><span style="font-size:8pt;font-weight:400;">${destName}</span>`
              : destName}
          </div>
          <div class="dest-address">
            ${destAddress}${destAddress2 ? `<br>${destAddress2}` : ""}<br>
            <strong>${destZip}</strong><br>
            <strong style="font-size:9pt;">${destCity.toUpperCase()}</strong>
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
          <div class="row"><span class="lbl">Ref 1</span><span>${ref1Display}</span></div>
          <div class="row"><span class="lbl">Ref 2</span><span>${(config.senderName2 || config.senderName || "EXPEDITEUR")!.toUpperCase().replace(/\s/g,"_")}_${orderName.replace("#","")}</span></div>
          <div class="row"><span class="lbl">Info</span><span style="font-style:italic;">Predict</span></div>
        </div>
        <div class="middle-right">
          <div class="colis-poids">
            <div class="colis-badge"><div class="lbl">Colis</div><strong>${index}/${total}</strong></div>
            <div class="poids-badge"><div class="lbl">Poids</div><strong>${weight} kg</strong></div>
          </div>
          <div class="qr-block">${qrSvg}</div>
        </div>
      </div>
      <div class="tracking">
        <div class="tracking-number">
          <span style="font-size:20pt;font-weight:900;">1038</span><span style="font-size:14pt;font-weight:700;">${trackingNumber.slice(4)}</span>
        </div>
        <div class="service-code"><div class="code">D-B2C</div><div class="lbl">Service</div></div>
      </div>
      <div class="footer-codes">
        <div class="depot-code">L</div>
        <div class="routing-code">${fakeRouting}</div>
        <div class="sort-code">${fakeSort}</div>
      </div>
      <div class="barcode-bottom">
        ${barcodeDataUrl
          ? `<img class="barcode-img" src="${barcodeDataUrl}" alt="Code-barres ${trackingNumber}"/>`
          : `<span style="font-size:7pt;color:#999;">Barcode indisponible</span>`
        }
        <div class="barcode-text">
          ${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR")} · Commande : ${orderName} · Colis : ${index}/${total}
        </div>
      </div>
    </div>`
  ).join("")}
</body>
</html>`;
}
