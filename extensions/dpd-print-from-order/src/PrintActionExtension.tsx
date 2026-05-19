import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const {data} = shopify;

  const [orderName, setOrderName] = useState<string | null>(null);
  const [labelCount, setLabelCount] = useState<number | null>(null);
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadOrder() {
      try {
        setError(null);
        const orderId = data?.selected?.[0]?.id || null;

        if (!orderId) {
          setError("Aucun ID de commande reçu.");
          return;
        }

        const result = await shopify.query(
          `query GetOrder($ids: [ID!]!) {
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
          { variables: { ids: [orderId] } },
        );

        const order = result?.data?.nodes?.[0];

        if (!order || order.__typename !== "Order") {
          setError("Impossible de charger la commande.");
          return;
        }

        const total = (order.lineItems?.edges || []).reduce((sum: number, item: any) => {
          return sum + (item?.node?.quantity || 0);
        }, 0);

        setOrderName(order.name || null);
        setLabelCount(total);
      } catch (e) {
        console.error(e);
        setError("Erreur lors du chargement de la commande.");
      }
    }

    loadOrder();
  }, [data]);

  useEffect(() => {
    if (!orderName || !labelCount) return;

    const shop = shopify.config?.shop || "";
    const url =
      `https://dpd-shopify-oken.vercel.app/print-dpd-label?orderName=${encodeURIComponent(orderName)}` +
      `&count=${labelCount}` +
      `&shop=${encodeURIComponent(shop)}`;

    setPrintUrl(url);
  }, [orderName, labelCount]);

  const isLoading = !error && labelCount === null;

  return (
    <s-admin-print-action src={printUrl || undefined}>
      <s-stack direction="block" gap="base">

        {/* En-tête */}
        <s-stack direction="block" gap="none">
          <s-heading>Impression DPD</s-heading>
          <s-text tone="subdued">Impression d'étiquettes by Jojo</s-text>
        </s-stack>

        <s-divider />

        {/* Contenu */}
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
                <s-text tone="subdued">Commande</s-text>
                <s-heading>{orderName}</s-heading>
              </s-stack>
            </s-box>
            <s-box padding="base" background="surface-secondary">
              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Étiquettes</s-text>
                <s-heading>{String(labelCount)}</s-heading>
              </s-stack>
            </s-box>
          </s-stack>
        )}

      </s-stack>
    </s-admin-print-action>
  );
}