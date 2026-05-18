import { useLoaderData } from "react-router";

export async function loader({ request }) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  const count = Number(url.searchParams.get("count") || "1");
  const orderName = url.searchParams.get("orderName") || "";

  return {
    orderId,
    count,
    orderName,
  };
}

export default function PrintBLPage() {
  const { orderId, count, orderName } = useLoaderData();

  const labels = Array.from({ length: count }, (_, i) => i + 1);

  return (
    <html>
      <head>
        <meta charSet="utf-8" />
        <title>Bon de livraison</title>
        <style>{`
          @page { size: A4; margin: 10mm; }
          body { font-family: Arial, sans-serif; margin: 0; padding: 0; }
          .page {
            page-break-after: always;
            border: 1px solid #ccc;
            padding: 20px;
            min-height: 250mm;
            box-sizing: border-box;
          }
          .page:last-child { page-break-after: auto; }
          .title { font-size: 24px; font-weight: bold; margin-bottom: 16px; }
          .meta { font-size: 16px; margin-bottom: 8px; }
        `}</style>
      </head>
      <body>
        {labels.map((n) => (
          <div className="page" key={n}>
            <div className="title">Bon de livraison</div>
            <div className="meta">Commande : {orderName || orderId}</div>
            <div className="meta">Étiquette : {n} / {count}</div>
          </div>
        ))}
      </body>
    </html>
  );
}