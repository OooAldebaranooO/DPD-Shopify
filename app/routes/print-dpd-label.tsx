import bwipjs from 'bwip-js';
import { kv } from '@vercel/kv';

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
  senderPhone:    string | undefined;
}

interface OrderItem { weight: number; sku: string; title: string; }
interface OrderPayload {
  orderName: string; shopifyOrderId: string; destName: string; destCompany: string;
  destAddress: string; destAddress2: string; destZip: string;
  destCity: string; destPhone: string; items: OrderItem[];
}
interface LabelData {
  orderName: string; shopifyOrderId: string; index: number; total: number;
  destName: string; destCompany: string; destAddress: string; destAddress2: string;
  destZip: string; destCity: string; destPhone: string;
  weight: string; sku: string; title: string;
  labelPdf:       string | null;
  trackingNumber: string | null; // BarcodeId DPD — zone 9 Track
  barCode:        string | null; // BarCode 28 chars — zone 5/12/13
  fromApi: boolean;
}
interface SoapParams {
  destName: string; destCompany: string; destAddress: string; destAddress2: string;
  destZip: string; destCity: string; destPhone: string;
  orderName: string; shopifyOrderId: string; ref1: string; ref2: string; weight: string; shippingDate: string;
}
interface OrderParams {
  orderName: string; shopifyOrderId: string; count: number;
  destName: string; destCompany: string; destAddress: string; destAddress2: string;
  destZip: string; destCity: string; destPhone: string;
  weights: string; skusParam: string; titlesParam: string;
}

export async function action({ request }: { request: Request }) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS", "Access-Control-Allow-Headers": "*" } });
  }
}

export async function loader({ request }: { request: Request }) {
  const url   = new URL(request.url);
  const token = url.searchParams.get("token");
  const config: Config = {
    login: process.env.DPD_LOGIN, password: process.env.DPD_PASSWORD,
    agencyCode: process.env.DPD_AGENCY_CODE, contractNumber: process.env.DPD_CONTRACT_NUMBER,
    senderName: process.env.DPD_SENDER_NAME, senderName2: process.env.DPD_SENDER_NAME2,
    senderAddress: process.env.DPD_SENDER_ADDRESS, senderZip: process.env.DPD_SENDER_ZIP,
    senderCity: process.env.DPD_SENDER_CITY, senderPhone: process.env.DPD_SENDER_PHONE,
  };
  const isMock = !config.login || !config.password;
  let labels: LabelData[] = [];

  if (token) {
    try {
      const raw = await kv.get<string>(`print:${token}`);
      if (raw) {
        const orders: OrderPayload[] = typeof raw === 'string' ? JSON.parse(raw) : raw as OrderPayload[];
        for (const order of orders) {
          const total = order.items.length;
          order.items.forEach((item, i) => labels.push({
            orderName: order.orderName, shopifyOrderId: order.shopifyOrderId || "", index: i + 1, total,
            destName: order.destName, destCompany: order.destCompany,
            destAddress: order.destAddress, destAddress2: order.destAddress2,
            destZip: order.destZip, destCity: order.destCity, destPhone: order.destPhone,
            weight: Math.max(0.01, item.weight).toFixed(2), sku: item.sku, title: item.title,
            labelPdf: null, trackingNumber: null, barCode: null, fromApi: false,
          }));
        }
      }
    } catch (e) { console.error("KV get error:", e); }
  } else {
    const orderName      = url.searchParams.get("orderName")      || "Commande";
    const shopifyOrderId = url.searchParams.get("shopifyOrderId") || "";
    const count          = Number(url.searchParams.get("count")   || "1");
    const destName       = url.searchParams.get("destName")       || "NOM DESTINATAIRE";
    const destAddress    = url.searchParams.get("destAddress")    || "";
    const destAddress2   = url.searchParams.get("destAddress2")   || "";
    const destCompany    = url.searchParams.get("destCompany")    || "";
    const destZip        = url.searchParams.get("destZip")        || "";
    const destCity       = url.searchParams.get("destCity")       || "";
    const destPhone      = url.searchParams.get("destPhone")      || "";
    const weights        = url.searchParams.get("weights")        || "1";
    const skusParam      = url.searchParams.get("skus")           || "";
    const titlesParam    = url.searchParams.get("titles")         || "";

    if (!isMock) {
      try {
        labels = await callDpdEprint(config, { orderName, shopifyOrderId, count, destName, destCompany, destAddress, destAddress2, destZip, destCity, destPhone, weights, skusParam, titlesParam });
      } catch (e) {
        console.error("Erreur EPrint:", (e as Error).message);
        labels = buildMockLabels(orderName, shopifyOrderId, count, destName, destCompany, destAddress, destAddress2, destZip, destCity, destPhone, weights, skusParam, titlesParam);
      }
    } else {
      labels = buildMockLabels(orderName, shopifyOrderId, count, destName, destCompany, destAddress, destAddress2, destZip, destCity, destPhone, weights, skusParam, titlesParam);
    }
  }

  if (token && labels.length > 0 && !isMock) {
    try { labels = await callDpdEprintBulk(config, labels); }
    catch (e) { console.error("Erreur EPrint bulk:", (e as Error).message); }
  }

  return new Response(await renderLabels(labels, config, isMock), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*", "X-Frame-Options": "ALLOWALL", "Content-Security-Policy": "frame-ancestors *" },
  });
}

async function soapRequest(config: Config, p: SoapParams): Promise<string> {
  // Passe par le proxy OVH (IP fixe 5.135.23.164 whitelistée chez DPD)
  // Si PROXY_URL n'est pas défini, appel direct (fallback)
  const WS_URL = process.env.PROXY_URL || "https://e-station.cargonet.software/dpd-eprintwebservice/eprintwebservice.asmx";
  const proxyToken = process.env.PROXY_SECRET || "";
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:imt="http://www.cargonet.software">
  <soap:Header><imt:UserCredentials><imt:userid>${config.login}</imt:userid><imt:password>${config.password}</imt:password></imt:UserCredentials></soap:Header>
  <soap:Body>
    <CreateShipmentWithLabelsBc xmlns="http://www.cargonet.software">
      <request>
        <customer_countrycode>250</customer_countrycode>
        <customer_centernumber>${config.agencyCode}</customer_centernumber>
        <customer_number>${config.contractNumber}</customer_number>
        <receiveraddress>
          <name>${escapeXml(p.destName || p.destCompany)}</name>
          <street>${escapeXml(p.destAddress)}</street>
          ${p.destAddress2 ? `<houseNo>${escapeXml(p.destAddress2)}</houseNo>` : ""}
          <countryPrefix>FR</countryPrefix>
          <zipCode>${escapeXml(p.destZip)}</zipCode>
          <city>${escapeXml(p.destCity)}</city>
          <phoneNumber>${escapeXml(p.destPhone)}</phoneNumber>
        </receiveraddress>
        <receiverinfo><contact>${escapeXml(p.destName)}</contact>${p.destCompany ? `<name2>${escapeXml(p.destCompany)}</name2>` : ""}</receiverinfo>
        <shipperaddress>
          <name>${escapeXml(config.senderName ?? "")}</name>
          <street>${escapeXml(config.senderAddress ?? "")}</street>
          <countryPrefix>FR</countryPrefix>
          <zipCode>${escapeXml(config.senderZip ?? "")}</zipCode>
          <city>${escapeXml(config.senderCity ?? "")}</city>
          <phoneNumber>${escapeXml(config.senderPhone ?? "")}</phoneNumber>
        </shipperaddress>
        <services><contact><type>Predict</type><value>${escapeXml(p.destPhone)}</value></contact></services>
        <weight>${p.weight}</weight>
        <shippingdate>${p.shippingDate}</shippingdate>
        <referencenumber>${escapeXml(p.ref1.slice(0, 35))}</referencenumber>
        <reference2>${escapeXml(p.ref2.slice(0, 35))}</reference2>
        <labelType><type>PDF</type><format>A6</format></labelType>
      </request>
    </CreateShipmentWithLabelsBc>
  </soap:Body>
</soap:Envelope>`;
  const response = await fetch(WS_URL, { method: "POST", headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://www.cargonet.software/CreateShipmentWithLabelsBc", ...(proxyToken ? { "X-Proxy-Token": proxyToken } : {}) }, body });
  return response.text();
}

async function parseShipmentResponse(xml: string): Promise<{ trackingNumber: string | null; barCode: string | null; error: string | null }> {
  const errMatch = xml.match(/<ErrorMessage>([\s\S]*?)<\/ErrorMessage>/i);
  if (errMatch) return { trackingNumber: null, barCode: null, error: errMatch[1] };
  const trackMatch = xml.match(/<BarcodeId>([\s\S]*?)<\/BarcodeId>/i) || xml.match(/<parcelnumber>([\s\S]*?)<\/parcelnumber>/i);
  const barMatch   = xml.match(/<BarCode>([\s\S]*?)<\/BarCode>/i);
  return { trackingNumber: trackMatch?.[1]?.trim() || null, barCode: barMatch?.[1]?.trim() || null, error: null };
}

async function callDpdEprint(config: Config, order: OrderParams): Promise<LabelData[]> {
  const shippingDate = new Date().toLocaleDateString("fr-FR").split("/").join(".");
  const weightsList  = String(order.weights || "1").split(",").map(w => parseFloat(w) || 0);
  const skusList     = String(order.skusParam || "").split("|").map(s => decodeURIComponent(s));
  const titlesList   = String(order.titlesParam || "").split("|").map(s => decodeURIComponent(s));
  const ref2Base     = (config.senderName2 || "LIVEDECO")!.toUpperCase().replace(/\s/g, "_");
  const labels: LabelData[] = [];
  for (let i = 1; i <= order.count; i++) {
    const itemWeight = Math.max(0.01, weightsList[i - 1] ?? weightsList[0] ?? 1).toFixed(2);
    const itemSku    = skusList[i - 1] ?? "";
    const itemTitle  = titlesList[i - 1] ?? "";
    const xml = await soapRequest(config, {
      destName: order.destName, destCompany: order.destCompany,
      destAddress: order.destAddress, destAddress2: order.destAddress2,
      destZip: order.destZip, destCity: order.destCity, destPhone: order.destPhone,
      orderName: order.orderName, shopifyOrderId: order.shopifyOrderId,
      ref1: order.shopifyOrderId || order.orderName,
      ref2: buildRef2(ref2Base, order.orderName),
      weight: itemWeight, shippingDate,
    });
    const { trackingNumber, barCode, error } = await parseShipmentResponse(xml);
    if (error) throw new Error(error);
    labels.push({ orderName: order.orderName, shopifyOrderId: order.shopifyOrderId, index: i, total: order.count, destName: order.destName, destCompany: order.destCompany, destAddress: order.destAddress, destAddress2: order.destAddress2, destZip: order.destZip, destCity: order.destCity, destPhone: order.destPhone, weight: itemWeight, sku: itemSku, title: itemTitle, labelPdf: null, trackingNumber, barCode, fromApi: true });
  }
  return labels;
}

async function callDpdEprintBulk(config: Config, labels: LabelData[]): Promise<LabelData[]> {
  const shippingDate = new Date().toLocaleDateString("fr-FR").split("/").join(".");
  const ref2Base     = (config.senderName2 || "LIVEDECO")!.toUpperCase().replace(/\s/g, "_");
  return Promise.all(labels.map(async (label) => {
    try {
      const xml = await soapRequest(config, {
        destName: label.destName, destCompany: label.destCompany,
        destAddress: label.destAddress, destAddress2: label.destAddress2,
        destZip: label.destZip, destCity: label.destCity, destPhone: label.destPhone,
        orderName: label.orderName, shopifyOrderId: label.shopifyOrderId,
        ref1: label.shopifyOrderId || label.orderName,
        ref2: buildRef2(ref2Base, label.orderName),
        weight: label.weight, shippingDate,
      });
      const { trackingNumber, barCode, error } = await parseShipmentResponse(xml);
      if (error) { console.error("Erreur DPD pour", label.orderName, ":", error); return label; }
      return { ...label, labelPdf: null, trackingNumber, barCode, fromApi: true };
    } catch (e) { console.error("Erreur SOAP pour", label.orderName, e); return label; }
  }));
}

function escapeXml(str: string): string {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

// Évite le doublon LIVEDECO_LIVEDECO_xxx si orderName contient déjà le préfixe
function buildRef2(prefix: string, orderName: string): string {
  const name = orderName.replace("#", "");
  return name.toUpperCase().startsWith(prefix) ? name : `${prefix}_${name}`;
}

function buildMockLabels(orderName: string, shopifyOrderId: string, count: number, destName: string, destCompany: string, destAddress: string, destAddress2: string, destZip: string, destCity: string, destPhone: string, weights: string, skusParam: string, titlesParam: string): LabelData[] {
  const weightsList = String(weights || "1").split(",").map(w => parseFloat(w) || 0);
  const skusList    = String(skusParam  || "").split("|").map(s => decodeURIComponent(s));
  const titlesList  = String(titlesParam|| "").split("|").map(s => decodeURIComponent(s));
  return Array.from({ length: count }, (_, i) => ({
    orderName, shopifyOrderId, index: i + 1, total: count, destName, destCompany, destAddress, destAddress2, destZip, destCity, destPhone,
    weight: Math.max(0.01, weightsList[i] ?? weightsList[0] ?? 1).toFixed(2),
    sku: skusList[i] ?? "", title: titlesList[i] ?? "",
    labelPdf: null, trackingNumber: null, barCode: null, fromApi: false,
  }));
}

async function generateBarcode128(value: string): Promise<string> {
  if (!value) return "";
  try {
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: value, scale: 3, height: 14, includetext: false });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) { return ""; }
}

async function generateRefBarcode128(value: string): Promise<string> {
  if (!value) return "";
  try {
    const png = await bwipjs.toBuffer({ bcid: 'code128', text: value, scale: 2, height: 8, includetext: false });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) { return ""; }
}

async function generateAztecPng(value: string): Promise<string> {
  if (!value) return "";
  try {
    const png = await bwipjs.toBuffer({ bcid: 'azteccode', text: value, scale: 3 });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) {
    try {
      const png = await bwipjs.toBuffer({ bcid: 'qrcode', text: value, scale: 3 });
      return `data:image/png;base64,${png.toString('base64')}`;
    } catch (e2) { return ""; }
  }
}

async function renderLabels(labels: LabelData[], config: Config, isMock: boolean): Promise<string> {
  const agencyCode = config.agencyCode || "038";
  const ref2Base   = (config.senderName2 || "LIVEDECO")!.toUpperCase().replace(/\s/g, "_");

  const labelsWithData = await Promise.all(labels.map(async (label) => {
    // Zone 9 Track = BarcodeId DPD (ex: 13735327170900)
    const trackingNumber = label.trackingNumber;
    // Zone 5/12/13 = BarCode 28 chars DPD (API) — fallback sur shopifyOrderId en mode mock
    const barCode28      = label.barCode || label.shopifyOrderId || "";
    // Zone 10
    const serviceCode    = parseFloat(label.weight) <= 1 ? 'XD-B2C' : 'D-B2C';
    const serviceNum     = parseFloat(label.weight) <= 1 ? '328' : '327';
    // Ref 1 = ID numérique Shopify (ex: 13735327170900)
    const ref1Display    = label.shopifyOrderId || label.orderName;
    // Ref 2 = LIVEDECO_95693 — sans doublon si orderName contient déjà le préfixe
    const orderNum       = label.orderName.replace("#", "");
    const ref2Display    = buildRef2(ref2Base, orderNum);
    // SKUs
    const skuDisplay     = label.sku || "";

    const [barcode128Url, refBarcodeUrl, aztecUrl] = await Promise.all([
      generateBarcode128(barCode28),       // Zone 12 — grand barcode DPD en bas
      generateRefBarcode128(barCode28),    // Zone 8 — petit barcode DPD (même que zone 12)
      generateAztecPng(barCode28),         // Zone 5 — Aztec DPD
    ]);

    // Zone 13 — légende sous le grand barcode (formatée si 28 chars réels, brut si mock)
    const barcode13Legend = label.barCode && barCode28.length >= 28
      ? `${barCode28.slice(0,1)} ${barCode28.slice(1,8)} ${barCode28.slice(8,12)} ${barCode28.slice(12,22)} ${barCode28.slice(22,25)} ${barCode28.slice(25,28)}`
      : barCode28;

    return { ...label, trackingNumber, barCode28, serviceCode, serviceNum, ref1Display, ref2Display, skuDisplay, barcode128Url, refBarcodeUrl, aztecUrl, barcode13Legend };
  }));

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8"/>
  <title>Etiquettes DPD</title>
  <style>
    @page { size: 105mm 148mm; margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: 105mm; margin: 0; padding: 0; font-family: Arial, sans-serif; color: #000; background: #fff; }
    .label { width: 105mm; height: 148mm; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; }
    .label:last-child { page-break-after: auto; }
    .mock-banner { background: #fff3cd; border-bottom: 1px solid #ffc107; padding: 0.8mm 2mm; font-size: 5pt; text-align: center; }
    .header { display: grid; grid-template-columns: 1fr 5mm 1fr; border-bottom: 1.5px solid #000; min-height: 20mm; position: relative; }
    .header-dest { padding: 1.5mm 2mm; }
    .dest-name { font-size: 9pt; font-weight: 700; line-height: 1.2; margin-bottom: 1mm; text-transform: uppercase; }
    .dest-address { font-size: 7pt; line-height: 1.5; }
    .dest-zip { font-size: 9pt; font-weight: 700; display: block; }
    .dest-city { font-size: 9pt; font-weight: 700; display: block; }
    .header-separator { border-left: 1px solid #000; border-right: 1px solid #000; display: flex; align-items: center; justify-content: center; }
    .header-separator span { writing-mode: vertical-rl; font-size: 6pt; letter-spacing: 1px; }
    .header-right { display: grid; grid-template-rows: 1fr 1fr; }
    .header-exp { border-bottom: 1px solid #000; padding: 1mm 1.5mm; font-size: 5.5pt; line-height: 1.3; }
    .header-exp .lbl { font-size: 4.5pt; color: #444; }
    .header-agence { padding: 1mm 1.5mm; font-size: 5pt; line-height: 1.3; }
    .header-agence .lbl { font-size: 4.5pt; color: #444; }
    .dpd-logo { position: absolute; top: 1.5mm; right: 1.5mm; height: 28px; }
    .middle { display: grid; grid-template-columns: 1fr auto; border-bottom: 1px solid #000; font-size: 6pt; }
    .middle-left { display: flex; flex-direction: column; padding: 1mm 2mm; border-right: 1px solid #000; }
    .middle-left-refs { flex: 1; }
    .middle-left-bottom { border-top: 1px solid #ddd; padding-top: 1mm; display: flex; justify-content: space-between; align-items: center; }
    .row { margin-bottom: 0.8mm; line-height: 1.3; }
    .row .lbl { font-size: 5pt; color: #444; display: block; }
    .ref-barcode img { height: 7mm; max-width: 65%; }
    .middle-right { display: grid; grid-template-columns: auto auto; }
    .colis-poids { display: flex; flex-direction: column; border-right: 1px solid #000; }
    .colis-badge { padding: 1mm 2.5mm; border-bottom: 1px solid #000; flex: 1; }
    .colis-badge .lbl { font-size: 4.5pt; color: #444; }
    .colis-badge strong { font-size: 12pt; font-weight: 700; }
    .poids-badge { padding: 1mm 2.5mm; flex: 1; }
    .poids-badge .lbl { font-size: 4.5pt; color: #444; }
    .poids-badge strong { font-size: 12pt; font-weight: 700; }
    .aztec-block { padding: 1mm; display: flex; align-items: center; justify-content: center; width: 26mm; }
    .aztec-block img { width: 100%; height: auto; }
    .tracking { display: grid; grid-template-columns: 1fr auto; padding: 1mm 2mm; border-bottom: 1px solid #000; align-items: center; }
    .track-label { font-size: 4.5pt; color: #444; }
    .tracking-number { font-size: 16pt; font-weight: 700; letter-spacing: 1px; line-height: 1; }
    .service-block { text-align: right; }
    .service-code { font-size: 9pt; font-weight: 700; }
    .service-lbl { font-size: 4.5pt; color: #444; }
    .transport { border-bottom: 1px solid #000; }
    .transport-row1 { display: grid; grid-template-columns: auto 1fr auto; align-items: center; padding: 0.5mm 2mm; gap: 2mm; min-height: 7mm; }
    .transport-row2 { display: grid; grid-template-columns: auto 1fr auto; align-items: center; padding: 0.3mm 2mm; gap: 2mm; border-top: 1px solid #ccc; min-height: 5mm; }
    .depot { background: #000 !important; color: #fff !important; font-size: 14pt; font-weight: 900; padding: 0.3mm 3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-width: 8mm; text-align: center; }
    .depot-sm { background: #000 !important; color: #fff !important; font-size: 9pt; font-weight: 700; padding: 0.3mm 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-width: 8mm; text-align: center; }
    .routing { font-size: 14pt; font-weight: 700; text-align: center; }
    .routing-pending { font-size: 6pt; color: #aaa; text-align: center; font-style: italic; }
    .sort { background: #000 !important; color: #fff !important; font-size: 12pt; font-weight: 700; padding: 0.3mm 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-width: 10mm; text-align: center; }
    .barcode-section { padding: 1mm 2mm 0.5mm; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; }
    .barcode-img { width: 92%; height: auto; image-rendering: pixelated; }
    .barcode-legend { font-size: 5pt; color: #444; margin-top: 0.5mm; text-align: center; letter-spacing: 0.5px; }
    .barcode-meta { font-size: 4pt; color: #888; margin-top: 0.5mm; text-align: center; }
    @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
  </style>
</head>
<body>
${labelsWithData.map(({
  orderName, index, total, destName, destCompany, destAddress, destAddress2,
  destZip, destCity, destPhone, weight,
  trackingNumber, barCode28, serviceCode, serviceNum,
  ref1Display, ref2Display, skuDisplay,
  barcode128Url, refBarcodeUrl, aztecUrl, barcode13Legend,
}) => `  <div class="label">
    ${isMock ? `<div class="mock-banner">&#9888; Apercu - Mode test (sans credentials DPD)</div>` : ""}

    <!-- Zone 1+2+3 -->
    <div class="header">
      <div class="header-dest">
        <div class="dest-name">${destCompany ? `${destCompany}<br/><span style="font-size:7pt;font-weight:400">${destName}</span>` : destName}</div>
        <div class="dest-address">
          ${destAddress}${destAddress2 ? `<br>${destAddress2}` : ""}<br>
          <span class="dest-zip">F-${destZip}</span>
          <span class="dest-city">${destCity.toUpperCase()}</span>
        </div>
      </div>
      <div class="header-separator"><span>Destinataire</span></div>
      <div class="header-right">
        <div class="header-exp">
          <div class="lbl">Expediteur</div>
          <strong>${config.senderName || "EXPEDITEUR"}</strong><br>
          ${config.senderAddress || ""}<br>
          ${config.senderZip || ""} ${config.senderCity || ""}
        </div>
        <div class="header-agence">
          <div class="lbl">DPD-Etablissement ${agencyCode}</div>
          ${config.senderAddress || ""}<br>
          ${config.senderZip || ""} ${config.senderCity || ""}
        </div>
      </div>
      <img src="https://dpd-shopify-oken.vercel.app/dpd-logo.png" alt="DPD" class="dpd-logo"/>
    </div>

    <!-- Zone 4+5+8 -->
    <div class="middle">
      <div class="middle-left">
        <div class="middle-left-refs">
          <div class="row"><span class="lbl">Contact</span><span>Tel ${destPhone || "-"}</span></div>
          <div class="row"><span class="lbl">Ref 1</span><span>${ref1Display}</span></div>
          ${skuDisplay ? `<div class="row"><span class="lbl">SKUs</span><span>${skuDisplay}</span></div>` : ""}
          <div class="row"><span class="lbl">Ref 2</span><span>${ref2Display}</span></div>
        </div>
        <!-- Zone 8 : barcode DPD (barCode28) + logo Predict -->
        <div class="middle-left-bottom">
          <div class="ref-barcode">${refBarcodeUrl ? `<img src="${refBarcodeUrl}" alt="barcode DPD"/>` : ""}</div>
          <img src="https://dpd-shopify-oken.vercel.app/dpd-predict-livraison.png" style="height:9px" alt="Predict"/>
        </div>
      </div>
      <div class="middle-right">
        <div class="colis-poids">
          <div class="colis-badge"><div class="lbl">Colis</div><strong>${index}/${total}</strong></div>
          <div class="poids-badge"><div class="lbl">Poids</div><strong>${weight} kg</strong></div>
        </div>
        <!-- Zone 5 : Aztec DPD -->
        <div class="aztec-block">${aztecUrl ? `<img src="${aztecUrl}" alt="Aztec DPD"/>` : ""}</div>
      </div>
    </div>

    <!-- Zone 9+10 -->
    <div class="tracking">
      <div>
        <div class="track-label">Track</div>
        <div class="tracking-number">${trackingNumber || ""}</div>
      </div>
      <div class="service-block">
        <div class="service-code">${serviceCode}</div>
        <div class="service-lbl">Service: ${serviceNum}</div>
      </div>
    </div>

    <!-- Zone 11 : Plan de transport (disponible apres whitelisting IP) -->
    <div class="transport">
      <div class="transport-row1">
        <div class="depot">&nbsp;&nbsp;</div>
        <div class="routing-pending">Plan de transport — disponible apres whitelisting IP</div>
        <div class="sort">&nbsp;&nbsp;&nbsp;&nbsp;</div>
      </div>
      <div class="transport-row2">
        <div class="depot-sm">&nbsp;&nbsp;</div>
        <div class="routing-pending"></div>
        <div style="min-width:10mm"></div>
      </div>
    </div>

    <!-- Zone 12+13 : Grand barcode DPD 28 chars + legende -->
    <div class="barcode-section">
      ${barcode128Url
        ? `<img class="barcode-img" src="${barcode128Url}" alt="Code-barres DPD"/>`
        : ""}
      ${barcode13Legend ? `<div class="barcode-legend">${barcode13Legend}</div>` : ""}
      <div class="barcode-meta">${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR")} &middot; ${orderName} &middot; Colis ${index}/${total}</div>
    </div>

  </div>`).join("\n")}
</body>
</html>`;
}