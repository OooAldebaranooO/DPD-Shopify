import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export default function () {
  render(<BulkPrintExtension />, document.body);
}

interface OrderItem {
  weight: number;
  sku:    string;
  title:  string;
}

interface OrderPayload {
  orderName:    string;
  destName:     string;
  destCompany:  string;
  destAddress:  string;
  destAddress2: string;
  destZip:      string;
  destCity:     string;
  destPhone:    string;
  items:        OrderItem[];
}

function BulkPrintExtension() {
  const { data } = shopify;

  const [status, setStatus]           = useState<'loading' | 'ready' | 'error'>('loading');
  const [totalLabels, setTotalLabels] = useState(0);
  const [totalOrders, setTotalOrders] = useState(0);
  const [printUrl, setPrintUrl]       = useState<string | null>(null);
  const [error, setError]             = useState<string | null>(null);

  useEffect(() => {
    async function prepare() {
      try {
        const selectedIds: string[] = (data?.selected || [])
          .map((s: any) => s.id)
          .filter(Boolean);

        if (selectedIds.length === 0) {
          setError("Aucune commande sélectionnée.");
          setStatus('error');
          return;
        }

        const result = await shopify.query(
          `query GetOrders($ids: [ID!]!) {
            nodes(ids: $ids) {
              __typename
              ... on Order {
                id
                name
                shippingAddress {
                  firstName lastName company
                  address1 address2 zip city phone
                }
                lineItems(first: 100) {
                  edges {
                    node {
                      currentQuantity
                      title
                      variant {
                        sku
                        inventoryItem {
                          measurement {
                            weight { value unit }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }`,
          { variables: { ids: selectedIds } },
        );

        const nodes = (result?.data?.nodes || []) as any[];
        const orders: OrderPayload[] = [];

        for (const order of nodes) {
          if (!order || order.__typename !== "Order") continue;

          const addr     = order.shippingAddress;
          const destName = addr
            ? `${addr.firstName || ""} ${addr.lastName || ""}`.trim()
            : "";

          const lines = (order.lineItems?.edges || []).filter(
            (e: any) => (e?.node?.currentQuantity || 0) > 0
          );

          const items: OrderItem[] = [];
          for (const edge of lines) {
            const node = edge?.node;
            const qty  = node?.currentQuantity || 1;
            const w    = node?.variant?.inventoryItem?.measurement?.weight;

            let weightKg = 0;
            if (w?.value != null) {
              switch (w.unit) {
                case 'KILOGRAMS': weightKg = w.value; break;
                case 'GRAMS':     weightKg = w.value / 1000; break;
                case 'POUNDS':    weightKg = w.value * 0.453592; break;
                case 'OUNCES':    weightKg = w.value * 0.0283495; break;
                default:          weightKg = w.value;
              }
            }

            for (let q = 0; q < qty; q++) {
              items.push({
                weight: weightKg,
                sku:    node?.variant?.sku || "",
                title:  node?.title        || "",
              });
            }
          }

          orders.push({
            orderName:    order.name    || "",
            destName,
            destCompany:  addr?.company  || "",
            destAddress:  addr?.address1 || "",
            destAddress2: addr?.address2 || "",
            destZip:      addr?.zip      || "",
            destCity:     addr?.city     || "",
            destPhone:    addr?.phone    || "",
            items,
          });
        }

        const total = orders.reduce((acc, o) => acc + o.items.length, 0);
        setTotalOrders(orders.length);
        setTotalLabels(total);

        // POST → prepare-labels → token
        const resp = await fetch("https://dpd-shopify-oken.vercel.app/prepare-labels", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orders }),
        });

        if (!resp.ok) throw new Error(`prepare-labels: ${resp.status}`);
        const { token } = await resp.json() as { token: string };

        setPrintUrl(`https://dpd-shopify-oken.vercel.app/print-dpd-label?token=${token}`);
        setStatus('ready');

      } catch (e) {
        console.error(e);
        setError("Erreur lors de la préparation des étiquettes.");
        setStatus('error');
      }
    }

    prepare();
  }, [data]);

  // Le target admin.order-index.selection-print-action.render
  // utilise s-admin-print-action, exactement comme la vue individuelle
  return (
    <s-admin-print-action src={printUrl || undefined}>
      <s-stack direction="block" gap="base">
        <s-stack direction="block" gap="none">
          <s-heading>Impression DPD</s-heading>
          <s-text tone="subdued">Impression d'étiquettes DPD LiveDeco</s-text>
        </s-stack>
        <s-divider />
        {status === 'error' ? (
          <s-banner tone="critical">{error}</s-banner>
        ) : status === 'loading' ? (
          <s-stack direction="inline" gap="base">
            <s-spinner />
            <s-text tone="subdued">Préparation des étiquettes…</s-text>
          </s-stack>
        ) : (
          <s-stack direction="inline" gap="base">
            <s-box padding="base" background="surface-secondary">
              <s-stack direction="block" gap="none">
                <s-text tone="subdued">Commandes</s-text>
                <s-heading>{String(totalOrders)}</s-heading>
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
