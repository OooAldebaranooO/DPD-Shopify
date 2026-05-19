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
                      name
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

        const total = (order.lineItems?.edges || []).reduce((sum, item) => {
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

  return (
    <s-admin-print-action src={printUrl || undefined}>
      <s-box>
        <s-stack direction="block" gap="base">
          <s-text>Impression des étiquettes</s-text>

          {error ? (
            <s-text tone="critical">{error}</s-text>
          ) : labelCount === null ? (
            <s-text>Chargement...</s-text>
          ) : (
            <>
              <s-text>N° de commande : {orderName}</s-text>
              <s-text>Nombre d'étiquettes à imprimer : {labelCount}</s-text>
            </>
          )}

          <s-text>-------------------</s-text>
          <s-text>Impression d'étiquettes by Jojo</s-text>
        </s-stack>
      </s-box>
    </s-admin-print-action>
  );
}