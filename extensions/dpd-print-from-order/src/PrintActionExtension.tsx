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
          `query GetOrderWithWeights($ids: [ID!]!) {
            nodes(ids: $ids) {
              __typename
              ... on Order {
                id
                name
                shippingAddress {
                  firstName
                  lastName
                  company
                  address1
                  address2
                  zip
                  city
                  phone
                }
                lineItems(first: 100) {
                  edges {
                    node {
                      quantity
                      currentQuantity
                      title
                      variant {
                        id
                        sku
                        inventoryItem {
                          measurement {
                            weight {
                              value
                              unit
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }`,
          { variables: { ids: [orderId] } },
        );

        console.log('GraphQL result', JSON.stringify(result, null, 2));

        const order = result?.data?.nodes?.[0] as any;
        if (!order || order.__typename !== "Order") {
          setError("Impossible de charger la commande.");
          return;
        }

        const items = (order.lineItems?.edges || []).filter(
          (item: any) => (item?.node?.currentQuantity || 0) > 0
        );

        const totalLabels = items.length;

        const addr = order.shippingAddress;
        const destName = addr
          ? `${addr.firstName || ""} ${addr.lastName || ""}`.trim()
          : "";
        
        const destCompany = addr?.company || "";

        setOrderName(order.name || null);
        setLabelCount(totalLabels);

        const activeItems = items.map((item: any) => {
          const w = item?.node?.variant?.inventoryItem?.measurement?.weight;
          let weightKg = 0;
          if (w?.value != null) {
            switch (w.unit) {
              case 'KILOGRAMS': weightKg = w.value; break;
              case 'GRAMS':     weightKg = w.value / 1000; break;
              case 'POUNDS':    weightKg = w.value * 0.453592; break;
              case 'OUNCES':    weightKg = w.value * 0.0283495; break;
              default:          weightKg = w.value; break;
            }
          }
          return {
            weight: weightKg,
            sku:   item?.node?.variant?.sku   || "",
            title: item?.node?.title          || "",
          };
        });

        const weightsParam = activeItems.map((i: any) => i.weight).join(",");
        const skusParam    = activeItems.map((i: any) => encodeURIComponent(i.sku)).join("|");
        const titlesParam  = activeItems.map((i: any) => encodeURIComponent(i.title)).join("|");

        const ref1 = activeItems
          .map((i: any) => (i.sku ? `${i.sku} - ${i.title}` : i.title))
          .join(" | ");

        console.log('Ref1 string', ref1);

        const url = `https://dpd-shopify-oken.vercel.app/print-dpd-label` +
          `?orderName=${encodeURIComponent(order.name ?? "")}` +
          `&count=${totalLabels}` +
          `&destName=${encodeURIComponent(destName)}` +
          `&destCompany=${encodeURIComponent(destCompany)}` +
          `&destAddress=${encodeURIComponent(addr?.address1 || "")}` +
          `&destAddress2=${encodeURIComponent(addr?.address2 || "")}` +
          `&destZip=${encodeURIComponent(addr?.zip || "")}` +
          `&destCity=${encodeURIComponent(addr?.city || "")}` +
          `&destPhone=${encodeURIComponent(addr?.phone || "")}` +
          `&weights=${encodeURIComponent(weightsParam)}` +
          `&skus=${encodeURIComponent(skusParam)}` +
          `&titles=${encodeURIComponent(titlesParam)}` +
          `&ref1=${encodeURIComponent(ref1)}`;

        setPrintUrl(url);
      } catch (e) {
        console.error(e);
        setError("Erreur lors du chargement de la commande.");
      }
    }
    loadOrder();
  }, [data]);

  const isLoading = !error && labelCount === null;

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