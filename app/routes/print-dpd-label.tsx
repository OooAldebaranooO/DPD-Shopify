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
  senderPhone:    string | undefined;
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
  trackingNumber: string | null; // BarcodeId — zone 9
  barCode:        string | null; // BarCode 28 chars — zone 12/13
  fromApi:        boolean;
}

interface SoapParams {
  destName:     string;
  destCompany:  string;
  destAddress:  string;
  destAddress2: string;
  destZip:      string;
  destCity:     string;
  destPhone:    string;
  orderName:    string;
  ref1:         string;
  ref2:         string;
  weight:       string;
  shippingDate: string;
}

interface OrderParams {
  orderName:    string;
  count:        number;
  destName:     string;
  destCompany:  string;
  destAddress:  string;
  destAddress2: string;
  destZip:      string;
  destCity:     string;
  destPhone:    string;
  weights:      string;
  skusParam:    string;
  titlesParam:  string;
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
    senderPhone:    process.env.DPD_SENDER_PHONE,
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
          order.items.forEach((item, i) => {
            labels.push({
              orderName: order.orderName, index: i + 1, total,
              destName: order.destName, destCompany: order.destCompany,
              destAddress: order.destAddress, destAddress2: order.destAddress2,
              destZip: order.destZip, destCity: order.destCity, destPhone: order.destPhone,
              weight: Math.max(0.01, item.weight).toFixed(2),
              sku: item.sku, title: item.title,
              labelPdf: null, trackingNumber: null, barCode: null, fromApi: false,
            });
          });
        }
      }
    } catch (e) {
      console.error("KV get error:", e);
    }
  } else {
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

  if (token && labels.length > 0 && !isMock) {
    try {
      labels = await callDpdEprintBulk(config, labels);
    } catch (e) {
      console.error("Erreur EPrint bulk:", (e as Error).message);
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

// ── SOAP helper ───────────────────────────────────────────────────────────────

async function soapRequest(config: Config, p: SoapParams): Promise<string> {
  const WS_URL = "https://e-station.cargonet.software/dpd-eprintwebservice/eprintwebservice.asmx";
  const receiverName = p.destName || p.destCompany;

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
          <name>${escapeXml(receiverName)}</name>
          <street>${escapeXml(p.destAddress)}</street>
          ${p.destAddress2 ? `<houseNo>${escapeXml(p.destAddress2)}</houseNo>` : ""}
          <countryPrefix>FR</countryPrefix>
          <zipCode>${escapeXml(p.destZip)}</zipCode>
          <city>${escapeXml(p.destCity)}</city>
          <phoneNumber>${escapeXml(p.destPhone)}</phoneNumber>
        </receiveraddress>
        ${p.destCompany ? `
        <receiverinfo>
          <contact>${escapeXml(p.destName)}</contact>
          <name2>${escapeXml(p.destCompany)}</name2>
        </receiverinfo>` : `
        <receiverinfo>
          <contact>${escapeXml(p.destName)}</contact>
        </receiverinfo>`}
        <shipperaddress>
          <name>${escapeXml(config.senderName ?? "")}</name>
          <street>${escapeXml(config.senderAddress ?? "")}</street>
          <countryPrefix>FR</countryPrefix>
          <zipCode>${escapeXml(config.senderZip ?? "")}</zipCode>
          <city>${escapeXml(config.senderCity ?? "")}</city>
          <phoneNumber>${escapeXml(config.senderPhone ?? "")}</phoneNumber>
        </shipperaddress>
        <services>
          <contact>
            <type>Predict</type>
            <value>${escapeXml(p.destPhone)}</value>
          </contact>
        </services>
        <weight>${p.weight}</weight>
        <shippingdate>${p.shippingDate}</shippingdate>
        <referencenumber>${escapeXml(p.ref1.slice(0, 35))}</referencenumber>
        <reference2>${escapeXml(p.ref2.slice(0, 35))}</reference2>
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
    body,
  });

  return response.text();
}

// ── Parse réponse SOAP DPD ────────────────────────────────────────────────────

async function parseShipmentResponse(xml: string): Promise<{
  trackingNumber: string | null;
  barCode:        string | null;
  error:          string | null;
}> {
  const errMatch = xml.match(/<ErrorMessage>([\s\S]*?)<\/ErrorMessage>/i);
  if (errMatch) return { trackingNumber: null, barCode: null, error: errMatch[1] };

  // BarcodeId = numéro d'expédition affiché en zone 9
  const trackMatch = xml.match(/<BarcodeId>([\s\S]*?)<\/BarcodeId>/i)
                  || xml.match(/<parcelnumber>([\s\S]*?)<\/parcelnumber>/i);

  // BarCode = barcode complet 28 chars — zone 12/13
  const barMatch = xml.match(/<BarCode>([\s\S]*?)<\/BarCode>/i);

  return {
    trackingNumber: trackMatch?.[1]?.trim() || null,
    barCode:        barMatch?.[1]?.trim()   || null,
    error:          null,
  };
}

// ── DPD EPrint SOAP — Mode individuel ────────────────────────────────────────

async function callDpdEprint(config: Config, order: OrderParams): Promise<LabelData[]> {
  const shippingDate = new Date().toLocaleDateString("fr-FR").split("/").join(".");
  const weightsList  = String(order.weights || "1").split(",").map(w => parseFloat(w) || 0);
  const skusList     = String(order.skusParam   || "").split("|").map(s => decodeURIComponent(s));
  const titlesList   = String(order.titlesParam || "").split("|").map(s => decodeURIComponent(s));
  const ref2Base     = (config.senderName2 || config.senderName || "EXPEDITEUR")!.toUpperCase().replace(/\s/g, "_");
  const labels: LabelData[] = [];

  for (let i = 1; i <= order.count; i++) {
    const itemWeight = Math.max(0.01, weightsList[i - 1] ?? weightsList[0] ?? 1).toFixed(2);
    const itemSku    = skusList[i - 1]   ?? "";
    const itemTitle  = titlesList[i - 1] ?? "";

    const xml = await soapRequest(config, {
      destName: order.destName, destCompany: order.destCompany,
      destAddress: order.destAddress, destAddress2: order.destAddress2,
      destZip: order.destZip, destCity: order.destCity, destPhone: order.destPhone,
      orderName: order.orderName,
      ref1: itemSku || order.orderName,
      ref2: `${ref2Base}_${order.orderName.replace("#", "")}`,
      weight: itemWeight, shippingDate,
    });

    const { trackingNumber, barCode, error } = await parseShipmentResponse(xml);
    if (error) throw new Error(error);

    labels.push({
      orderName: order.orderName, index: i, total: order.count,
      destName: order.destName, destCompany: order.destCompany,
      destAddress: order.destAddress, destAddress2: order.destAddress2,
      destZip: order.destZip, destCity: order.destCity, destPhone: order.destPhone,
      weight: itemWeight, sku: itemSku, title: itemTitle,
      labelPdf: null, trackingNumber, barCode, fromApi: true,
    });
  }

  return labels;
}

// ── DPD EPrint SOAP — Mode bulk parallèle ────────────────────────────────────

async function callDpdEprintBulk(config: Config, labels: LabelData[]): Promise<LabelData[]> {
  const shippingDate = new Date().toLocaleDateString("fr-FR").split("/").join(".");
  const ref2Base     = (config.senderName2 || config.senderName || "EXPEDITEUR")!.toUpperCase().replace(/\s/g, "_");

  return Promise.all(labels.map(async (label) => {
    try {
      const xml = await soapRequest(config, {
        destName: label.destName, destCompany: label.destCompany,
        destAddress: label.destAddress, destAddress2: label.destAddress2,
        destZip: label.destZip, destCity: label.destCity, destPhone: label.destPhone,
        orderName: label.orderName,
        ref1: label.sku || label.orderName,
        ref2: `${ref2Base}_${label.orderName.replace("#", "")}`,
        weight: label.weight, shippingDate,
      });

      const { trackingNumber, barCode, error } = await parseShipmentResponse(xml);
      if (error) { console.error("Erreur DPD pour", label.orderName, ":", error); return label; }
      return { ...label, labelPdf: null, trackingNumber, barCode, fromApi: true };
    } catch (e) {
      console.error("Erreur SOAP pour", label.orderName, e);
      return label;
    }
  }));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

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
    weight:   Math.max(0.01, weightsList[i] ?? weightsList[0] ?? 1).toFixed(2),
    sku:      skusList[i]   ?? "",
    title:    titlesList[i] ?? "",
    labelPdf: null, trackingNumber: null, barCode: null, fromApi: false,
  }));
}

// ── Génération codes ──────────────────────────────────────────────────────────

// Zone 12 — Code 128 numéro de colis DPD (BarCode 28 chars)
async function generateBarcode128(value: string): Promise<string> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128', text: value, scale: 3, height: 14,
      includetext: true, textxalign: 'center', textsize: 8,
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) {
    console.error("Erreur barcode128:", e);
    return "";
  }
}

// Zone 8 — Code 128 référence client (SKU/ref)
async function generateRefBarcode128(value: string): Promise<string> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'code128', text: value, scale: 2, height: 8,
      includetext: false,
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) {
    console.error("Erreur refBarcode:", e);
    return "";
  }
}

// Zone 5 — Code Aztec 2D (comme sur l'étiquette DPD officielle)
async function generateAztecPng(value: string): Promise<string> {
  try {
    const png = await bwipjs.toBuffer({
      bcid: 'azteccode', text: value, scale: 3,
    });
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) {
    // Fallback QR code si aztec échoue
    console.error("Erreur aztec, fallback QR:", e);
    try {
      const png = await bwipjs.toBuffer({
        bcid: 'qrcode', text: value, scale: 3,
      });
      return `data:image/png;base64,${png.toString('base64')}`;
    } catch (e2) {
      return "";
    }
  }
}

// ── Render ────────────────────────────────────────────────────────────────────

async function renderLabels(labels: LabelData[], config: Config, isMock: boolean): Promise<string> {
  const agencyCode = config.agencyCode || "038";

  const labelsWithData = await Promise.all(labels.map(async (label) => {
    // Zone 12/13 — BarCode complet 28 chars (vrai en prod, mock en test)
    const barCode28     = label.barCode
      || `0067100${agencyCode}${Math.floor(Math.random()*9999999999).toString().padStart(10,'0')}327902`;

    // Zone 9 — BarcodeId (numéro d'expédition affiché en gros)
    const barcodeId     = label.trackingNumber || barCode28;

    // Zone 10 — Code service selon doc DPD
    const serviceCode   = parseFloat(label.weight) <= 1 ? 'XD-B2C' : 'D-B2C';
    const serviceNum    = parseFloat(label.weight) <= 1 ? '328' : '327';

    // Zone 9 — Code agence
    const agenceDisplay = agencyCode;

    // Ref 1 et Ref 2
    const ref1Display   = label.sku || label.orderName.replace("#", "");
    const ref2Display   = `${(config.senderName2 || config.senderName || "EXPEDITEUR")!.toUpperCase().replace(/\s/g,"_")}_${label.orderName.replace("#","")}`;

    // Génère tous les codes en parallèle
    const [
      barcode128Url,   // Zone 12
      refBarcodeUrl,   // Zone 8
      aztecUrl,        // Zone 5
    ] = await Promise.all([
      generateBarcode128(barCode28),
      label.sku ? generateRefBarcode128(label.sku) : Promise.resolve(""),
      generateAztecPng(barCode28),
    ]);

    // Zone 13 — légende barcode formatée comme DPD
    // Format: "0067 100 1077 0300 1101 99 136 902 N" (groupes de chars)
    const barcode13Legend = barCode28.length >= 20
      ? `${barCode28.slice(0,4)} ${barCode28.slice(4,7)} ${barCode28.slice(7,11)} ${barCode28.slice(11,15)} ${barCode28.slice(15,19)} ${barCode28.slice(19,21)} ${barCode28.slice(21,24)} ${barCode28.slice(24,27)} ${barCode28.slice(27)}`
      : barCode28;

    return {
      ...label, barCode28, barcodeId, serviceCode, serviceNum,
      agenceDisplay, ref1Display, ref2Display,
      barcode128Url, refBarcodeUrl, aztecUrl, barcode13Legend,
    };
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

    /* Zone 1+2+3 — Header */
    .header { display: grid; grid-template-columns: 1fr 5mm 1fr; border-bottom: 1.5px solid #000; min-height: 20mm; position: relative; }
    .header-dest { padding: 1.5mm 2mm; }
    .dest-name { font-size: 9pt; font-weight: 700; line-height: 1.2; margin-bottom: 1mm; text-transform: uppercase; }
    .dest-address { font-size: 7pt; line-height: 1.4; }
    .dest-zip { font-size: 9pt; font-weight: 700; }
    .dest-city { font-size: 9pt; font-weight: 700; }
    .header-separator { border-left: 1px solid #000; border-right: 1px solid #000; display: flex; align-items: center; justify-content: center; }
    .header-separator span { writing-mode: vertical-rl; font-size: 6pt; letter-spacing: 1px; }
    .header-right { display: grid; grid-template-rows: 1fr 1fr; }
    .header-exp { border-bottom: 1px solid #000; padding: 1mm 1.5mm; font-size: 5.5pt; line-height: 1.3; }
    .header-exp .lbl { font-size: 4.5pt; color: #444; }
    .header-agence { padding: 1mm 1.5mm; font-size: 5pt; line-height: 1.3; }
    .header-agence .lbl { font-size: 4.5pt; color: #444; }
    .dpd-logo { position: absolute; top: 1.5mm; right: 1.5mm; height: 28px; }

    /* Zone 4+5+8 — Middle */
    .middle { display: grid; grid-template-columns: 1fr auto; border-bottom: 1px solid #000; font-size: 6pt; }
    .middle-left { padding: 1mm 2mm; border-right: 1px solid #000; }
    .row { margin-bottom: 0.8mm; line-height: 1.3; }
    .row .lbl { font-size: 5pt; color: #444; display: block; }
    .ref-barcode { margin: 1mm 0 0.5mm; }
    .ref-barcode img { max-width: 100%; height: 8mm; }
    .predict-logo { margin-top: 1mm; text-align: right; }
    .middle-right { display: grid; grid-template-columns: auto auto; }
    .colis-poids { display: flex; flex-direction: column; border-right: 1px solid #000; }
    .colis-badge { padding: 1mm 2.5mm; border-bottom: 1px solid #000; flex: 1; }
    .colis-badge .lbl { font-size: 4.5pt; color: #444; }
    .colis-badge strong { font-size: 12pt; font-weight: 700; }
    .poids-badge { padding: 1mm 2.5mm; flex: 1; }
    .poids-badge .lbl { font-size: 4.5pt; color: #444; }
    .poids-badge strong { font-size: 12pt; font-weight: 700; }
    /* Zone 5 — Aztec */
    .aztec-block { padding: 1mm; display: flex; align-items: center; justify-content: center; width: 26mm; }
    .aztec-block img { width: 100%; height: auto; }

    /* Zone 9+10 — Tracking */
    .tracking { display: grid; grid-template-columns: 1fr auto; padding: 0.8mm 2mm; border-bottom: 1px solid #000; align-items: center; }
    .tracking-left { }
    .track-label { font-size: 4.5pt; color: #444; }
    .tracking-number { font-size: 16pt; font-weight: 700; letter-spacing: 1px; line-height: 1; }
    .service-block { text-align: right; }
    .service-code { font-size: 9pt; font-weight: 700; }
    .service-lbl { font-size: 4.5pt; color: #444; }

    /* Zone 11 — Plan de transport (indisponible sans PDF) */
    .transport { display: grid; grid-template-columns: auto 1fr auto; align-items: center; padding: 0.8mm 2mm; border-bottom: 1px solid #000; gap: 2mm; min-height: 8mm; }
    .depot { background: #000 !important; color: #fff !important; font-size: 14pt; font-weight: 900; padding: 0.5mm 3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .routing { font-size: 7pt; font-weight: 700; text-align: center; color: #888; font-style: italic; }
    .sort { background: #000 !important; color: #fff !important; font-size: 11pt; font-weight: 700; padding: 0.5mm 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; }

    /* Zone 12+13 — Barcode final */
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
  barCode28, barcodeId, serviceCode, serviceNum,
  agenceDisplay, ref1Display, ref2Display,
  barcode128Url, refBarcodeUrl, aztecUrl, barcode13Legend,
}) => `  <div class="label">
    ${isMock ? `<div class="mock-banner">&#9888; Apercu - Mode test (credentials DPD manquants)</div>` : ""}

    <!-- Zone 1+2+3 : Destinataire / Expediteur / Agence -->
    <div class="header">
      <div class="header-dest">
        <div class="dest-name">${destCompany ? `${destCompany}<br/><span style="font-size:7pt;font-weight:400">${destName}</span>` : destName}</div>
        <div class="dest-address">
          ${destAddress}${destAddress2 ? `<br>${destAddress2}` : ""}<br>
          <span class="dest-zip">F-${destZip}</span><br>
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
          <div class="lbl">DPD-Etablissement ${agenceDisplay}</div>
          ${config.senderAddress || ""}<br>
          ${config.senderZip || ""} ${config.senderCity || ""}
        </div>
      </div>
      <img src="https://dpd-shopify-oken.vercel.app/dpd-logo.png" alt="DPD" class="dpd-logo"/>
    </div>

    <!-- Zone 4+5+8 : Refs / Aztec / Ref barcode -->
    <div class="middle">
      <div class="middle-left">
        <div class="row"><span class="lbl">Contact</span><span>Tel ${destPhone || "-"}</span></div>
        <div class="row"><span class="lbl">Ref 1</span><span>${ref1Display}</span></div>
        ${refBarcodeUrl ? `<div class="ref-barcode"><img src="${refBarcodeUrl}" alt="ref barcode"/></div>` : ""}
        <div class="row"><span class="lbl">Ref 2</span><span>${ref2Display}</span></div>
        <div class="predict-logo">
          <img src="https://dpd-shopify-oken.vercel.app/dpd-predict-livraison.png" style="height:9px" alt="Predict"/>
        </div>
      </div>
      <div class="middle-right">
        <div class="colis-poids">
          <div class="colis-badge"><div class="lbl">Colis</div><strong>${index}/${total}</strong></div>
          <div class="poids-badge"><div class="lbl">Poids</div><strong>${weight} kg</strong></div>
        </div>
        <!-- Zone 5 — Aztec code -->
        <div class="aztec-block">
          ${aztecUrl ? `<img src="${aztecUrl}" alt="Aztec"/>` : ""}
        </div>
      </div>
    </div>

    <!-- Zone 9+10 : Numéro d'expédition + service -->
    <div class="tracking">
      <div class="tracking-left">
        <div class="track-label">Track</div>
        <div class="tracking-number">${barcodeId}</div>
      </div>
      <div class="service-block">
        <div class="service-code">${serviceCode}</div>
        <div class="service-lbl">Service: ${serviceNum}</div>
      </div>
    </div>

    <!-- Zone 11 : Plan de transport (indisponible via API — nécessite PDF) -->
    <div class="transport">
      <div class="depot">${agenceDisplay}</div>
      <div class="routing" style="font-size:5pt">Plan de transport<br>disponible apres whitelisting IP</div>
      <div class="sort">${agenceDisplay}SA</div>
    </div>

    <!-- Zone 12+13 : Code 128 + légende -->
    <div class="barcode-section">
      ${barcode128Url ? `<img class="barcode-img" src="${barcode128Url}" alt="Code-barres DPD"/>` : `<span style="font-size:7pt;color:#999">Barcode indisponible</span>`}
      <div class="barcode-legend">${barcode13Legend}</div>
      <div class="barcode-meta">${new Date().toLocaleDateString("fr-FR")} ${new Date().toLocaleTimeString("fr-FR")} &middot; ${orderName} &middot; Colis ${index}/${total}</div>
    </div>

  </div>`).join("\n")}
</body>
</html>`;
}
