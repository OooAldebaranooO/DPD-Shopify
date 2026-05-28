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
  destCity: string; destPhone: string; destCountry: string; items: OrderItem[];
}
interface LabelData {
  orderName: string; shopifyOrderId: string; index: number; total: number;
  destName: string; destCompany: string; destAddress: string; destAddress2: string;
  destZip: string; destCity: string; destPhone: string; destCountry: string;
  weight: string; sku: string; title: string;
  labelPdf:       string | null;
  trackingNumber: string | null;
  barCode:        string | null;
  routing:        RoutingData | null;
  fromApi: boolean;
}
interface RoutingData {
  depot:        string;
  bic3Number:   string;
  sSort:        string;
  dSort:        string;
  routingText:  string;
  serviceText:  string;
  aztecValue:   string | null;
  bic3Text:     string;
}

interface SoapParams {
  destName: string; destCompany: string; destAddress: string; destAddress2: string;
  destZip: string; destCity: string; destPhone: string; destCountry: string;
  orderName: string; shopifyOrderId: string; ref1: string; ref2: string; weight: string; shippingDate: string;
}
interface OrderParams {
  orderName: string; shopifyOrderId: string; count: number;
  destName: string; destCompany: string; destAddress: string; destAddress2: string;
  destZip: string; destCity: string; destPhone: string; destCountry: string;
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
            destCountry: order.destCountry || "France",
            weight: Math.max(0.01, item.weight).toFixed(2), sku: item.sku, title: item.title,
            labelPdf: null, trackingNumber: null, barCode: null, routing: null, fromApi: false,
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
    const destCountry    = url.searchParams.get("destCountry")    || "France";
    const weights        = url.searchParams.get("weights")        || "1";
    const skusParam      = url.searchParams.get("skus")           || "";
    const titlesParam    = url.searchParams.get("titles")         || "";

    if (!isMock) {
      try {
        labels = await callDpdEprint(config, { orderName, shopifyOrderId, count, destName, destCompany, destAddress, destAddress2, destZip, destCity, destPhone, destCountry, weights, skusParam, titlesParam });
      } catch (e) {
        console.error("Erreur EPrint:", (e as Error).message);
        labels = buildMockLabels(orderName, shopifyOrderId, count, destName, destCompany, destAddress, destAddress2, destZip, destCity, destPhone, destCountry, weights, skusParam, titlesParam);
      }
    } else {
      labels = buildMockLabels(orderName, shopifyOrderId, count, destName, destCompany, destAddress, destAddress2, destZip, destCity, destPhone, destCountry, weights, skusParam, titlesParam);
    }
  }

  return new Response(await renderLabels(labels, config, isMock), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Access-Control-Allow-Origin": "*", "X-Frame-Options": "ALLOWALL", "Content-Security-Policy": "frame-ancestors *" },
  });
}

async function soapRequest(config: Config, p: SoapParams): Promise<string> {
  const WS_URL = process.env.PROXY_URL || "https://e-station.cargonet.software/dpd-eprintwebservice/eprintwebservice.asmx";
  const proxyToken = process.env.PROXY_SECRET || "";
  const countryPrefix = getCountryPrefix(p.destCountry);
  const isMobile = isMobilePhone(p.destPhone);
  const predictService = isMobile
    ? `<services><contact><type>Predict</type><sms>${escapeXml(p.destPhone)}</sms></contact></services>`
    : "";
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
          <countryPrefix>${countryPrefix}</countryPrefix>
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
        ${predictService}
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
  const rawBar = barMatch?.[1]?.trim() || null;
  const barCode = rawBar ? (rawBar.startsWith("%") ? rawBar : "%" + rawBar) : null;
  return { trackingNumber: trackMatch?.[1]?.trim() || null, barCode, error: null };
}

async function getLabelData(config: Config, barCode: string, trackingNumber: string): Promise<RoutingData | null> {
  const WS_URL     = process.env.PROXY_URL || "https://e-station.cargonet.software/dpd-eprintwebservice/eprintwebservice.asmx";
  const proxyToken = process.env.PROXY_SECRET || "";
  const body = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:imt="http://www.cargonet.software">
  <soap:Header><imt:UserCredentials><imt:userid>${config.login}</imt:userid><imt:password>${config.password}</imt:password></imt:UserCredentials></soap:Header>
  <soap:Body>
    <GetLabelData xmlns="http://www.cargonet.software">
      <request>
        <customer>
          <countrycode>250</countrycode>
          <centernumber>${config.agencyCode}</centernumber>
          <number>${config.contractNumber}</number>
        </customer>
        <BarcodeId>${escapeXml(trackingNumber)}</BarcodeId>
        <BarcodeSource>902</BarcodeSource>
      </request>
    </GetLabelData>
  </soap:Body>
</soap:Envelope>`;
  try {
    const response = await fetch(WS_URL, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", "SOAPAction": "http://www.cargonet.software/GetLabelData", ...(proxyToken ? { "X-Proxy-Token": proxyToken } : {}) },
      body,
    });
    const xml = await response.text();
    const tag = (name: string) => xml.match(new RegExp(`<${name}>([^<]*)<\/${name}>`, 'i'))?.[1]?.trim() || "";
    const aztecMatch    = xml.match(/<Identifier>Aztec<\/Identifier><BarcodeValue>([\s\S]*?)<\/BarcodeValue>/i);
    const bic3ValMatch  = xml.match(/<Identifier>Bic3<\/Identifier><BarcodeValue>([\s\S]*?)<\/BarcodeValue>/i);
    const bic3TextMatch = xml.match(/<Identifier>Bic3<\/Identifier><BarcodeValue>[\s\S]*?<\/BarcodeValue><BarcodeText>([\s\S]*?)<\/BarcodeText>/i);
    const rawAztec = aztecMatch?.[1]?.trim() || null;
    const aztecDecoded = rawAztec
      ? rawAztec
          .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&amp;/g, "&").replace(/&quot;/g, '"')
          .replace(/_1E/g, "\x1E")
          .replace(/_1D/g, "\x1D")
          .replace(/_1F/g, "\x1F")
          .replace(/_04/g, "\x04")
      : null;
    return {
      depot:       tag("Bic3Depot"),
      bic3Number:  tag("Bic3Number"),
      sSort:       tag("SSort"),
      dSort:       tag("DSort"),
      routingText: tag("Routingtext"),
      serviceText: tag("Servicetext"),
      aztecValue:  aztecDecoded,
      bic3Text:    bic3TextMatch?.[1]?.trim() || bic3ValMatch?.[1]?.trim() || "",
    };
  } catch (e) {
    console.error("GetLabelData error:", e);
    return null;
  }
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
      destCountry: order.destCountry,
      orderName: order.orderName, shopifyOrderId: order.shopifyOrderId,
      ref1: order.shopifyOrderId || order.orderName,
      ref2: buildRef2(ref2Base, order.orderName),
      weight: itemWeight, shippingDate,
    });
    const { trackingNumber, barCode, error } = await parseShipmentResponse(xml);
    if (error) throw new Error(error);
    const routing = (barCode && trackingNumber) ? await getLabelData(config, barCode, trackingNumber) : null;
    labels.push({
      orderName: order.orderName, shopifyOrderId: order.shopifyOrderId,
      index: i, total: order.count,
      destName: order.destName, destCompany: order.destCompany,
      destAddress: order.destAddress, destAddress2: order.destAddress2,
      destZip: order.destZip, destCity: order.destCity, destPhone: order.destPhone,
      destCountry: order.destCountry,
      weight: itemWeight, sku: itemSku, title: itemTitle,
      labelPdf: null, trackingNumber, barCode, routing, fromApi: true,
    });
  }
  return labels;
}

function getCountryPrefix(country: string): string {
  const c = (country || "").toLowerCase();
  if (c.includes("allem") || c.includes("deutsch") || c.includes("germany")) return "DE";
  if (c.includes("belgi")) return "BE";
  if (c.includes("espagne") || c.includes("spain")) return "ES";
  if (c.includes("italie") || c.includes("italy")) return "IT";
  if (c.includes("pays-bas") || c.includes("netherlands")) return "NL";
  if (c.includes("luxembourg")) return "LU";
  if (c.includes("suisse") || c.includes("switzerland")) return "CH";
  if (c.includes("autriche") || c.includes("austria")) return "AT";
  if (c.includes("portugal")) return "PT";
  if (c.includes("pologne") || c.includes("poland")) return "PL";
  return "FR";
}

function isMobilePhone(phone: string): boolean {
  if (!phone) return false;
  const clean = phone.replace(/[\s.\-]/g, "");
  return /^(06|07|\+336|\+337|0033[67])/.test(clean);
}

function escapeXml(str: string): string {
  return String(str || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function buildRef2(prefix: string, orderName: string): string {
  const name = orderName.replace("#", "");
  return name.toUpperCase().startsWith(prefix) ? name : `${prefix}_${name}`;
}

function buildMockLabels(
  orderName: string, shopifyOrderId: string, count: number,
  destName: string, destCompany: string, destAddress: string, destAddress2: string,
  destZip: string, destCity: string, destPhone: string, destCountry: string,
  weights: string, skusParam: string, titlesParam: string
): LabelData[] {
  const weightsList = String(weights || "1").split(",").map(w => parseFloat(w) || 0);
  const skusList    = String(skusParam  || "").split("|").map(s => decodeURIComponent(s));
  const titlesList  = String(titlesParam|| "").split("|").map(s => decodeURIComponent(s));
  return Array.from({ length: count }, (_, i) => ({
    orderName, shopifyOrderId, index: i + 1, total: count,
    destName, destCompany, destAddress, destAddress2,
    destZip, destCity, destPhone, destCountry,
    weight: Math.max(0.01, weightsList[i] ?? weightsList[0] ?? 1).toFixed(2),
    sku: skusList[i] ?? "", title: titlesList[i] ?? "",
    labelPdf: null, trackingNumber: null, barCode: null, routing: null, fromApi: false,
  }));
}

function computeTrackingKey(trackingNumber: string): string {
  const digits = trackingNumber.replace(/\D/g, "");
  const weights = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5, 6, 7];
  let sum = 0;
  for (let i = 0; i < digits.length && i < 14; i++) {
    sum += parseInt(digits[i]) * weights[i];
  }
  const remainder = sum % 11;
  if (remainder === 0) return "A";
  if (remainder === 1) return "B";
  return String(11 - remainder);
}

function buildAztecContent(params: {
  trackingNumber: string; barCode28: string; serviceNum: string;
  destName: string; destAddress: string; destCity: string; destZip: string; destPhone: string;
  ref2: string; index: number; total: number; weight: string;
  senderName: string; senderAddress: string; senderZip: string; senderCity: string;
  shopifyOrderId: string; sSort: string; agencyCode: string;
}): string {
  const { trackingNumber, serviceNum, destName, destAddress, destCity, destZip,
          destPhone, ref2, index, total, weight, senderName, senderAddress,
          senderZip, senderCity, shopifyOrderId, sSort, agencyCode } = params;

  const agenceDest = trackingNumber ? trackingNumber.slice(0, 3) : "103";
  const cp5        = destZip.replace(/\D/g, "").slice(0, 5).padStart(5, "0");
  const barcodeId  = trackingNumber || "";
  const poidsStr   = parseFloat(weight).toFixed(2).padStart(5, "0") + "KG";
  const idx        = String(index).padStart(3, "0");
  const tot        = String(total).padStart(3, "0");

  const lines = [
    `[)>0`,
    `${agenceDest}${cp5}250${serviceNum}${barcodeId}`,
    `GEOP`, `139`,
    shopifyOrderId,
    `${idx}/${tot}`,
    poidsStr, `N`,
    destAddress.toUpperCase(),
    destCity.toUpperCase(),
    ` ${destName.toUpperCase()}`,
    `07G03000~~~`,
    destPhone, destPhone,
    `F~${cp5}`,
    ref2, ref2,
    `007D`,
    `${agencyCode}015380${sSort}`,
    `07S011${senderName.toUpperCase()}${senderAddress.toUpperCase()}${senderCity.toUpperCase()}${senderZip}250`,
    `07S0401${senderName.toUpperCase()}${senderAddress.toUpperCase()}F~${senderZip}~${senderCity.toUpperCase()}`,
  ];
  return lines.join("");
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
    const trackingNumber = label.trackingNumber;
    const barCode28      = label.barCode || label.shopifyOrderId || "";
    const serviceCode    = parseFloat(label.weight) <= 1 ? 'XD-B2C' : 'D-B2C';
    const serviceNum     = parseFloat(label.weight) <= 1 ? '328' : '327';
    const ref1Display    = label.shopifyOrderId || label.orderName;
    const orderNum       = label.orderName.replace("#", "");
    const ref2Display    = buildRef2(ref2Base, orderNum);
    const skuDisplay     = label.sku || "";
    const countryPrefix  = getCountryPrefix(label.destCountry);
    const trackingKey   = trackingNumber ? computeTrackingKey(trackingNumber) : "";

    const aztecContent = label.routing?.aztecValue
    ? label.routing.aztecValue
    : label.trackingNumber
    ? buildAztecContent({
        trackingNumber: label.trackingNumber,
        barCode28, serviceNum,
        destName: label.destName, destAddress: label.destAddress,
        destCity: label.destCity, destZip: label.destZip, destPhone: label.destPhone,
        ref2: ref2Display, index: label.index, total: label.total, weight: label.weight,
        senderName: config.senderName || "", senderAddress: config.senderAddress || "",
        senderZip: config.senderZip || "", senderCity: config.senderCity || "",
        shopifyOrderId: label.shopifyOrderId,
        sSort: label.routing?.sSort || "",        // ← ajout
        agencyCode: config.agencyCode || "038",   // ← ajout
      })
    : barCode28;

    const [barcode128Url, refBarcodeUrl, aztecUrl] = await Promise.all([
      generateBarcode128(barCode28),
      generateRefBarcode128(barCode28),
      generateAztecPng(aztecContent),
    ]);

    let barcode13Legend: string;
    if (label.routing?.bic3Text) {
      barcode13Legend = label.routing.bic3Text;
    } else {
      const b = label.barCode ? barCode28.replace(/^%/, "") : barCode28;
      barcode13Legend = label.barCode && b.length >= 27
        ? `${b.slice(0,4)} ${b.slice(4,7)} ${b.slice(7,11)} ${b.slice(11,15)} ${b.slice(15,19)} ${b.slice(19,21)} ${b.slice(21,24)} ${b.slice(24,27)} X`
        : b;
    }

    return { ...label, trackingNumber, trackingKey, barCode28, serviceCode, serviceNum, ref1Display, ref2Display, skuDisplay, countryPrefix, barcode128Url, refBarcodeUrl, aztecUrl, barcode13Legend, routing: label.routing };
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
    .label { width: 105mm; height: 148mm; display: flex; flex-direction: column; overflow: hidden; page-break-after: always; border: 3px solid #000; }
    .label:last-child { page-break-after: auto; }
    .mock-banner { background: #fff3cd; border-bottom: 1px solid #ffc107; padding: 0.8mm 2mm; font-size: 5pt; text-align: center; }
    .header { display: grid; grid-template-columns: 1fr 5mm 0.7fr; border-bottom: 1.5px solid #000; min-height: 30mm; position: relative; }
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
    .ref-barcode img { height: 7mm; max-width: 95%; }
    .middle-right { display: grid; grid-template-columns: auto auto; }
    .colis-poids { display: flex; flex-direction: column; border-right: 1px solid #000; }
    .colis-badge { padding: 1mm 2.5mm; border-bottom: 1px solid #000; flex: 1; }
    .colis-badge .lbl { font-size: 4.5pt; color: #444; }
    .colis-badge strong { font-size: 12pt; font-weight: 700; }
    .poids-badge { padding: 1mm 2.5mm; flex: 1; }
    .poids-badge .lbl { font-size: 4.5pt; color: #444; }
    .poids-badge strong { font-size: 12pt; font-weight: 700; }
    .aztec-block { padding: 1mm; display: flex; align-items: center; justify-content: center; width: 33mm; }
    .aztec-block img { width: 100%; height: auto; }
    .tracking { display: grid; grid-template-columns: 1fr auto; padding: 1mm 2mm; align-items: start; height: 20mm; }
    .track-label { font-size: 4.5pt; color: #000; padding: 2mm 0mm 2mm 2mm; }
    .tracking-number { font-size: 16pt; font-weight: 700; letter-spacing: 1px; line-height: 1; }
    .tracking-number .depot-code { font-size: 22pt; font-weight: 900; }
    .service-block { text-align: right; }
    .service-code { font-size: 14pt; font-weight: 700; }
    .service-lbl { font-size: 4.5pt; color: #000; }
    .service-lbl-bottom { font-size: 12pt; font-weight: 700; }
    .transport { }
    .transport-row1 { display: grid; grid-template-columns: auto 1fr auto; align-items: center; padding: 0.5mm 2mm; gap: 2mm; min-height: 7mm; }
    .transport-row2 { display: grid; padding: 0.3mm 2mm; gap: 2mm; min-height: 5mm; grid-auto-flow: column; justify-items: end; align-items: center; }
    .depot { background: #000 !important; color: #fff !important; font-size: 14pt; font-weight: 900; padding: 0.3mm 3mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-width: 8mm; text-align: center; }
    .depot-sm { background: #000 !important; color: #fff !important; font-size: 17pt; font-weight: 700; padding: 0.3mm 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-width: 8mm; text-align: center; width: 22mm; }
    .routing { font-size: 22pt; font-weight: 700; text-align: center; }
    .routing-pending { font-size: 6pt; color: #aaa; text-align: center; font-style: italic; }
    .sort { background: #000 !important; color: #fff !important; font-size: 17pt; font-weight: 700; padding: 0.3mm 2mm; -webkit-print-color-adjust: exact; print-color-adjust: exact; min-width: 10mm; text-align: center; width: 22mm; }
    .barcode-section { padding: 3mm 2mm 0.5mm; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-start; }
    .barcode-img { width: 95%; height: auto; image-rendering: pixelated; height:30mm; }
    .barcode-legend { font-size: 7pt; color: #444; margin-top: 1mm; text-align: center; letter-spacing: 0.5px; margin-bottom: 5mm; }
    .barcode-meta { font-size: 4pt; color: #888; margin-top: 0.5mm; text-align: center; }
    @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
  </style>
</head>
<body>
${labelsWithData.map(({
  orderName, index, total, destName, destCompany, destAddress, destAddress2,
  destZip, destCity, destPhone, destCountry, countryPrefix, weight,
  trackingNumber, trackingKey, barCode28, serviceCode, serviceNum,
  ref1Display, ref2Display, skuDisplay,
  barcode128Url, refBarcodeUrl, aztecUrl, barcode13Legend, routing,
}) => `  <div class="label">
    ${isMock ? `<div class="mock-banner">&#9888; Apercu - Mode test (sans credentials DPD)</div>` : ""}

    <!-- Zone 1+2+3 -->
    <div class="header">
      <div class="header-dest">
        <div class="dest-name">${destCompany ? `${destCompany}<br/><span style="font-size:7pt;font-weight:400">${destName}</span>` : destName}</div>
        <div class="dest-address">
          ${destAddress}${destAddress2 ? `<br>${destAddress2}` : ""}<br>
          <span class="dest-zip">${countryPrefix}-${destZip}</span>
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
          <div class="row"><span class="lbl">Ref 2</span><span>${ref2Display}</span></div>
          ${skuDisplay ? `<div class="row"><span class="lbl">SKUs</span><span>${skuDisplay}</span></div>` : ""}
        </div>
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
        <div class="aztec-block">${aztecUrl ? `<img src="${aztecUrl}" alt="Aztec DPD"/>` : ""}</div>
      </div>
    </div>

    <!-- Zone 9+10 -->
    <div class="tracking">
      <div>
        <div class="tracking-number">${trackingNumber ? `<span class="depot-code">${trackingNumber.slice(0,4)}</span> ${trackingNumber.slice(4,8)} ${trackingNumber.slice(8,12)} ${trackingNumber.slice(12,14)} ${trackingKey}` : ""}</div>
      </div>
      <div class="service-block">
        <div class="service-code">${serviceCode}</div>
        <div class="service-lbl">Service: ${serviceNum}</div>
      </div>
    </div>

    <!-- Zone 11 : Plan de transport -->
    <div class="transport">
      <div class="track-label">Track</div>
      <div class="transport-row1">
        ${routing?.depot
          ? `<div class="depot">${routing.depot}</div>`
          : `<div class="depot">&nbsp;&nbsp;</div>`}
        ${routing?.routingText
          ? `<div class="routing">${routing.routingText}</div>`
          : `<div class="routing-pending">Plan de transport</div>`}
        ${routing?.sSort
          ? `<div class="sort">${routing.sSort}</div>`
          : `<div class="sort">&nbsp;&nbsp;&nbsp;&nbsp;</div>`}
      </div>
      <div class="transport-row2">
        <div class="service-lbl-bottom">${serviceNum}-${countryPrefix}-${destZip}</div>
        ${routing?.dSort
          ? `<div class="depot-sm">${routing.dSort}</div>`
          : `<div class="depot-sm">&nbsp;&nbsp;</div>`}
      </div>
    </div>

    <!-- Zone 12+13 : Grand barcode DPD 28 chars + legende -->
    <div class="barcode-section">
      ${barcode128Url ? `<img class="barcode-img" src="${barcode128Url}" alt="Code-barres DPD"/>` : ""}
      ${barcode13Legend ? `<div class="barcode-legend">${barcode13Legend}</div>` : ""}
    </div>

  </div>`).join("\n")}
</body>
</html>`;
}