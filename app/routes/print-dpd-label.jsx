import db from "../db.server";
import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const url = new URL(request.url);
  const orderName = url.searchParams.get("orderName") || "Commande";
  const count = Number(url.searchParams.get("count") || "1");
  const shop = url.searchParams.get("shop") || "";

  // Récupération des credentials DPD depuis la base de données
  let config = null;
  if (shop) {
    config = await db.dpdConfig.findUnique({ where: { shop } });
  }

  let labels = [];

  if (config?.login) {
    // ── Mode réel : appel API DPD ─────────────────────────────
    try {
      labels = await generateDpdLabels(config, orderName, count);
    } catch (e) {
      console.error("Erreur API DPD:", e);
      labels = generateMockLabels(orderName, count, `Erreur DPD: ${e.message}`);
    }
  } else {
    // ── Mode mock : pas encore de credentials ─────────────────
    labels = generateMockLabels(orderName, count, "Configuration DPD manquante");
  }

  const html = renderHtml(orderName, count, labels);

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Access-Control-Allow-Origin": "*",
    },
  });
}

// ── Appel API DPD France (webservice SOAP) ────────────────────────────────────
async function generateDpdLabels(config, orderName, count) {
  // TODO: remplacer par l'URL réelle DPD France une fois connue
  const DPD_WS_URL = "https://e-services.dpd.fr/webservices/ShipmentService/V3/ShipmentService.svc";

  const labels = [];

  for (let i = 1; i <= count; i++) {
    const soapBody = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <CreateShipmentWithLabels xmlns="http://www.dpd.com/shipment/">
      <CreateShipmentWithLabelsRequest>
        <Shipment>
          <ShipmentParameters>
            <ServiceCode>Classic</ServiceCode>
            <ShipperContractNumber>${config.contractNumber}</ShipperContractNumber>
          </ShipmentParameters>
          <Shipper>
            <ShipperAccountNumber>${config.contractNumber}</ShipperAccountNumber>
            <ContactInfo>
              <ContactName>${config.senderName}</ContactName>
              <Street>${config.senderAddress}</Street>
              <ZipCode>${config.senderZip}</ZipCode>
              <City>${config.senderCity}</City>
              <CountryCode>FR</CountryCode>
              <Phone>${config.senderPhone}</Phone>
            </ContactInfo>
          </Shipper>
          <Parcel>
            <CustomerReferences>${orderName}-${i}</CustomerReferences>
            <Weight>1</Weight>
          </Parcel>
        </Shipment>
        <LabelFormat>PDF</LabelFormat>
      </CreateShipmentWithLabelsRequest>
    </CreateShipmentWithLabels>
  </soap:Body>
</soap:Envelope>`;

    const response = await fetch(DPD_WS_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": "CreateShipmentWithLabels",
        "Authorization": "Basic " + btoa(`${config.login}:${config.password}`),
      },
      body: soapBody,
    });

    const xml = await response.text();
    // TODO: parser la réponse XML pour extraire le PDF base64
    // Pour l'instant on retourne un mock
    labels.push({ index: i, pdf: null, barcode: `DPD-${orderName}-${i}` });
  }

  return labels;
}

// ── Labels mock (avant vrais credentials) ────────────────────────────────────
function generateMockLabels(orderName, count, reason) {
  return Array.from({ length: count }, (_, i) => ({
    index: i + 1,
    pdf: null,
    barcode: `MOCK-${orderName}-${i + 1}`,
    mock: true,
    reason,
  }));
}

// ── Rendu HTML ────────────────────────────────────────────────────────────────
function renderHtml(orderName, count, labels) {
  return `<!DOCTYPE html>
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
      .top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 18px;
      }
      .brand { font-size: 28px; font-weight: 700; color: #dc0032; }
      .badge { border: 1px solid #222; padding: 6px 10px; font-size: 14px; font-weight: 700; }
      .section { margin-bottom: 18px; }
      .title { font-size: 13px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
      .box { border: 1px solid #333; padding: 10px 12px; min-height: 60px; }
      .ref { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
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
        ${label.mock ? `<div class="mock-banner">⚠️ Aperçu mock — ${label.reason}</div>` : ""}
        <div class="top">
          <div class="brand">DPD</div>
          <div class="badge">COLIS ${label.index} / ${count}</div>
        </div>
        <div class="section">
          <div class="title">Référence commande</div>
          <div class="box">
            <div class="ref">${orderName}</div>
          </div>
        </div>
        <div class="section">
          <div class="title">Expéditeur</div>
          <div class="box">À configurer dans Configuration DPD</div>
        </div>
        <div class="barcode">${label.barcode}</div>
        <div class="footer">Colis ${label.index} sur ${count}</div>
      </div>
    `).join("")}
  </body>
</html>`;
}