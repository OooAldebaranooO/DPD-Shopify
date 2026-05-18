export async function loader({ request }) {
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId") || "test";
  const count = Number(url.searchParams.get("count") || "2");

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <title>Debug DPD</title>
      </head>
      <body>
        ${Array.from({ length: count }, (_, i) => i + 1)
          .map(
            (n) => `
              <div style="page-break-after:always; border:1px solid #000; padding:20px; min-height:500px;">
                <h1>Mock DPD</h1>
                <p>Commande : ${orderId}</p>
                <p>Colis : ${n} / ${count}</p>
              </div>
            `,
          )
          .join("")}
      </body>
    </html>
  `;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  });
}