import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const {data} = shopify;

  const [printUrl, setPrintUrl] = useState<string | undefined>(undefined);
  const [orderSummary, setOrderSummary] = useState<string>("Chargement...");

  useEffect(() => {
    async function loadOrders() {
      const selected = data?.selected || [];
      if (!selected.length) return;

      const ids = selected.map((s: { id: string }) => s.id);

      const result = await shopify.query(
        `query GetOrders($ids: [ID!]!) {
          nodes(ids: $ids) {
            __typename
            ... on Order {
              id
              name
              lineItems(first: 100) {
                edges {
                  node {
                    quantity
                  }
                }
              }
            }
          }
        }`,
        { variables: { ids } }
      );

      const orders = (result?.data?.nodes || []).filter(
        (n: any) => n.__typename === "Order"
      );

      // Construit les paramètres : orderName:count,orderName:count,...
      const params = orders.map((o: any) => {
        const count = (o.lineItems?.edges || []).reduce(
          (sum: number, e: any) => sum + (e?.node?.quantity || 0), 0
        );
        return `${encodeURIComponent(o.name)}:${count}`;
      }).join(",");

      const totalLabels = orders.reduce((sum: number, o: any) => {
        return sum + (o.lineItems?.edges || []).reduce(
          (s: number, e: any) => s + (e?.node?.quantity || 0), 0
        );
      }, 0);

      setOrderSummary(`${orders.length} commande(s) — ${totalLabels} étiquette(s)`);

      const shop = shopify.config?.shop || "";
      const url =
        `https://dpd-shopify-oken.vercel.app/print-dpd-label-bulk?orders=${params}` +
        `&shop=${encodeURIComponent(shop)}`;

      setPrintUrl(url);
    }

    loadOrders();
  }, [data]);

  return (
    <s-admin-print-action src={printUrl || undefined}>
      <s-box>
        <s-stack direction="block" gap="base">
          <s-text>Impression DPD by Jojo</s-text>
          <s-text>{orderSummary}</s-text>
          <s-text>Impression d'étiquettes DPD by Jojo</s-text>
        </s-stack>
      </s-box>
    </s-admin-print-action>
  );
}