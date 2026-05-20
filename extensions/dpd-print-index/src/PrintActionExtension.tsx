import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const {data} = shopify;

  const [printUrl, setPrintUrl] = useState<string | undefined>(undefined);
  const [orderCount, setOrderCount] = useState<number | null>(null);
  const [totalLabels, setTotalLabels] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrders() {
      try {
        const selected = data?.selected || [];
        if (!selected.length) { setError("Aucune commande sélectionnée."); return; }

        const ids = selected.map((s: { id: string }) => s.id);

        const result = await shopify.query(
          `query GetOrders($ids: [ID!]!) {
            nodes(ids: $ids) {
              __typename
              ... on Order {
                id
                name
                shippingAddress {
                  name
                  firstName
                  lastName
                  address1
                  zip
                  city
                  phone
                }
                lineItems(first: 100) {
                  edges {
                    node {
                      currentQuantity
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

        const params = orders.map((o: any) => {
        const items = (o.lineItems?.edges || []).filter(
            (e: any) => (e?.node?.currentQuantity || 0) > 0
          );
          const count = items.length; // 1 ligne active = 1 colis
          const addr = o.shippingAddress;
          const destName = addr
              ? `${addr.firstName || ""} ${addr.lastName || ""}`.trim()
              : "";
            return [
              encodeURIComponent(o.name),
              count,
              encodeURIComponent(destName),
              encodeURIComponent(addr?.address1 || ""),
              encodeURIComponent(addr?.zip || ""),
              encodeURIComponent(addr?.city || ""),
              encodeURIComponent(addr?.phone || ""),
              "0",
            ].join("%7C");
          }).join(",");

          const total = orders.reduce((sum: number, o: any) =>
            sum + (o.lineItems?.edges || []).filter(
              (e: any) => (e?.node?.currentQuantity || 0) > 0
            ).length, 0);

        setOrderCount(orders.length);
        setTotalLabels(total);

        setPrintUrl(
          `https://dpd-shopify-oken.vercel.app/print-dpd-label-bulk?orders=${params}`
        );
      } catch (e) {
        console.error(e);
        setError("Erreur lors du chargement des commandes.");
      }
    }
    loadOrders();
  }, [data]);

  const isLoading = !error && orderCount === null;

  return (
    <s-admin-print-action src={printUrl || undefined}>
      <s-stack direction="block" gap="base">
        <s-stack direction="block" gap="none">
          <s-heading>Impression DPD</s-heading>
          <s-text tone="subdued">Impression d'étiquettes by Jojo</s-text>
        </s-stack>
        <s-divider />
        {error ? (
          <s-banner tone="critical">{error}</s-banner>
        ) : isLoading ? (
          <s-stack direction="inline" gap="base">
            <s-spinner />
            <s-text tone="subdued">Chargement…</s-text>
          </s-stack>
        ) : (
          <s-stack direction="inline" gap="base">
            <s-box padding="base" background="surface-secondary">
              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Commandes</s-text>
                <s-heading>{String(orderCount)}</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="base" background="surface-secondary">
              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Étiquettes</s-text>
                <s-heading>{String(totalLabels)}</s-heading>
              </s-stack>
            </s-box>
          </s-stack>
        )}
      </s-stack>
    </s-admin-print-action>
  );
}