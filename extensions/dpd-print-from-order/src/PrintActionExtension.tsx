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
        if (!orderId) { setError("Aucun ID de commande reçu."); return; }

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
                      variant {
                        id
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

        //console.log('GraphQL result', JSON.stringify(result, null, 2));

        const order = result?.data?.nodes?.[0] as any;
        if (!order || order.__typename !== "Order") {
          setError("Impossible de charger la commande."); return;
        }

        const items = (order.lineItems?.edges || []).filter(
          (item: any) => (item?.node?.currentQuantity || 0) > 0
        );

        const totalLabels = items.length;

        // Calcul du poids total en grammes
        const totalWeightGrams = items.reduce((sum: number, item: any) => {
          const node = item?.node;
          if (!node) return sum;

          const qty = node.quantity ?? 0;
          const weight = node.variant?.inventoryItem?.measurement?.weight;
          if (!weight || weight.value == null) {
            return sum;
          }

          let weightInGrams = weight.value as number;

          switch (weight.unit) {
            case 'KILOGRAMS':
              weightInGrams = weight.value * 1000;
              break;
            case 'POUNDS':
              weightInGrams = weight.value * 453.592;
              break;
            case 'OUNCES':
              weightInGrams = weight.value * 28.3495;
              break;
            // GRAMS ou autre → on laisse tel quel
            default:
              break;
          }

          return sum + qty * weightInGrams;
        }, 0);

        console.log("ITEMS WEIGHTS:", items.map((item: any) => ({
          name: item?.node?.variant?.id,
          weight: item?.node?.variant?.inventoryItem?.measurement?.weight,
          qty: item?.node?.currentQuantity,
        })));

        // Si DPD attend des kilos avec un nombre à virgule :
        const totalWeightKg = totalWeightGrams / 1000;

        const addr = order.shippingAddress;
        const destName = addr
          ? `${addr.firstName || ""} ${addr.lastName || ""}`.trim()
          : "";

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
          return weightKg;
        });

        // Passe les poids individuels dans l'URL
        const weightsParam = activeItems.join(",");

        const url = `https://dpd-shopify-oken.vercel.app/print-dpd-label` +
          `?orderName=${encodeURIComponent(order.name ?? "")}` +
          `&count=${totalLabels}` +
          `&destName=${encodeURIComponent(destName)}` +
          `&destAddress=${encodeURIComponent(addr?.address1 || "")}` +
          `&destAddress2=${encodeURIComponent(addr?.address2 || "")}` +
          `&destZip=${encodeURIComponent(addr?.zip || "")}` +
          `&destCity=${encodeURIComponent(addr?.city || "")}` +
          `&destPhone=${encodeURIComponent(addr?.phone || "")}` +
          `&weights=${encodeURIComponent(weightsParam)}`; // ← plural, liste de poids

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