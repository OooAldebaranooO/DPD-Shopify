import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export default function () {
  render(<Extension />, document.body);
}

interface LineItem {
  id:     string;
  title:  string;
  sku:    string;
  qty:    number;
  weight: number;
}

interface ColisItem {
  itemId: string;
  qty:    number;
}

interface Colis {
  id:    string;
  items: ColisItem[];
}

function Extension() {
  const { data } = shopify;

  const [orderName, setOrderName]           = useState<string | null>(null);
  const [shopifyOrderId, setShopifyOrderId] = useState<string | null>(null);
  const [lines, setLines]                   = useState<LineItem[]>([]);
  const [colis, setColis]                   = useState<Colis[]>([]);
  const [printUrl, setPrintUrl]             = useState<string | null>(null);
  const [error, setError]                   = useState<string | null>(null);
  const [isLoading, setIsLoading]           = useState(true);
  const [addr, setAddr]                     = useState<any>(null);

  useEffect(() => {
    async function loadOrder() {
      try {
        const orderId = data?.selected?.[0]?.id || null;
        if (!orderId) { setError("Aucun ID de commande reçu."); setIsLoading(false); return; }

        const result = await shopify.query(
          `query GetOrder($ids: [ID!]!) {
            nodes(ids: $ids) {
              __typename
              ... on Order {
                id name
                shippingAddress {
                  firstName lastName company address1 address2 zip city phone country
                }
                lineItems(first: 100) {
                  edges {
                    node {
                      currentQuantity title
                      variant {
                        sku
                        inventoryItem {
                          measurement { weight { value unit } }
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

        const order = result?.data?.nodes?.[0] as any;
        if (!order || order.__typename !== "Order") {
          setError("Impossible de charger la commande."); setIsLoading(false); return;
        }

        const numericId = order.id.split("/").pop() || "";

        const loadedLines: LineItem[] = (order.lineItems?.edges || [])
          .filter((e: any) => (e?.node?.currentQuantity || 0) > 0)
          .map((e: any, i: number) => {
            const node = e.node;
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
            return { id: `item-${i}`, title: node?.title || "", sku: node?.variant?.sku || "", qty: node?.currentQuantity || 1, weight: weightKg };
          });

        setOrderName(order.name);
        setShopifyOrderId(numericId);
        setAddr(order.shippingAddress);
        setLines(loadedLines);
        setColis([{ id: 'colis-1', items: loadedLines.map((l: LineItem) => ({ itemId: l.id, qty: l.qty })) }]);
        setIsLoading(false);
      } catch (e) {
        console.error(e);
        setError("Erreur lors du chargement.");
        setIsLoading(false);
      }
    }
    loadOrder();
  }, [data]);

  useEffect(() => {
    if (!addr || colis.length === 0 || lines.length === 0) return;

    const destName    = addr ? `${addr.firstName || ""} ${addr.lastName || ""}`.trim() : "";
    const destCompany = addr?.company || "";

    // Poids total divisé par nombre de colis
    const totalWeight = lines.reduce((acc, l) => acc + l.weight * l.qty, 0);
    const weightPerColis = Math.max(0.01, totalWeight / colis.length);

    const colisItems = colis.map(c => {
      const skus = c.items
        .filter(ci => ci.qty > 0)
        .map(ci => {
          const line = lines.find(l => l.id === ci.itemId);
          if (!line) return "";
          const sku = line.sku || line.title;
          return ci.qty > 1 ? `${sku}(x${ci.qty})` : sku;
        })
        .filter(Boolean)
        .join("+");
      return { weight: weightPerColis, sku: skus };
    });

    const count        = colis.length;
    const weightsParam = colisItems.map(i => i.weight.toFixed(3)).join(",");
    const skusParam    = colisItems.map(i => encodeURIComponent(i.sku)).join("|");

    const url = `https://dpd-shopify-oken.vercel.app/print-dpd-label` +
      `?orderName=${encodeURIComponent(orderName ?? "")}` +
      `&shopifyOrderId=${encodeURIComponent(shopifyOrderId ?? "")}` +
      `&count=${count}` +
      `&destName=${encodeURIComponent(destName)}` +
      `&destCompany=${encodeURIComponent(destCompany)}` +
      `&destAddress=${encodeURIComponent(addr?.address1 || "")}` +
      `&destAddress2=${encodeURIComponent(addr?.address2 || "")}` +
      `&destZip=${encodeURIComponent(addr?.zip || "")}` +
      `&destCity=${encodeURIComponent(addr?.city || "")}` +
      `&destPhone=${encodeURIComponent(addr?.phone || "")}` +
      `&destCountry=${encodeURIComponent(addr?.country || "France")}` +
      `&weights=${encodeURIComponent(weightsParam)}` +
      `&skus=${encodeURIComponent(skusParam)}` +
      `&titles=${encodeURIComponent(skusParam)}`;

    setPrintUrl(url);
  }, [colis, lines, addr, orderName, shopifyOrderId]);

  function addColis() {
    setColis(prev => [...prev, { id: `colis-${Date.now()}`, items: lines.map(l => ({ itemId: l.id, qty: 0 })) }]);
  }

  function removeColis(colisId: string) {
    setColis(prev => prev.filter(c => c.id !== colisId));
  }

  // Pas de blocage inter-colis — chaque colis est indépendant
  function setItemQty(colisId: string, itemId: string, newQty: number) {
    const line = lines.find(l => l.id === itemId);
    if (!line) return;
    const clamped = Math.max(0, Math.min(newQty, line.qty));
    setColis(prev => prev.map(c => {
      if (c.id !== colisId) return c;
      const existing = c.items.find(ci => ci.itemId === itemId);
      if (existing) return { ...c, items: c.items.map(ci => ci.itemId === itemId ? { ...ci, qty: clamped } : ci) };
      return { ...c, items: [...c.items, { itemId, qty: clamped }] };
    }));
  }

  function colisItemCount(c: Colis): number {
    return c.items.reduce((acc, ci) => acc + ci.qty, 0);
  }

  const totalWeight = lines.reduce((acc, l) => acc + l.weight * l.qty, 0);
  const weightPerColis = Math.max(0.01, totalWeight / Math.max(1, colis.length));
  const allAssigned = colis.every(c => colisItemCount(c) > 0);

  return (
    <s-admin-print-action src={printUrl || undefined}>
      <s-stack direction="block" gap="base">

        <s-stack direction="block" gap="none">
          <s-heading>Impression DPD</s-heading>
          <s-text tone="subdued">Impression d'étiquettes LiveDeco</s-text>
        </s-stack>
        <s-divider />

        {error ? (
          <s-banner tone="critical">{error}</s-banner>
        ) : isLoading ? (
          <s-stack direction="inline" gap="base">
            <s-spinner /><s-text tone="subdued">Chargement…</s-text>
          </s-stack>
        ) : (
          <s-stack direction="block" gap="base">

            {/* Résumé commande */}
            {/* @ts-ignore */}
            <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
              <s-box padding="base" background="surface-secondary">
                <s-stack direction="block" gap="none">
                  <s-text tone="subdued">Commande</s-text>
                  <s-heading>{orderName}</s-heading>
                </s-stack>
              </s-box>
              <s-box padding="base" background="surface-secondary">
                <s-stack direction="block" gap="none">
                  <s-text tone="subdued">Poids total</s-text>
                  <s-heading>{totalWeight.toFixed(2)} kg</s-heading>
                </s-stack>
              </s-box>
              <s-box padding="base" background="surface-secondary">
                <s-stack direction="block" gap="none">
                  <s-text tone="subdued">Par colis</s-text>
                  <s-heading>{weightPerColis.toFixed(2)} kg</s-heading>
                </s-stack>
              </s-box>
              <s-box padding="base" background="surface-secondary">
                <s-stack direction="block" gap="none">
                  <s-text tone="subdued">Colis</s-text>
                  <s-heading>{String(colis.length)}</s-heading>
                </s-stack>
              </s-box>
              <s-button variant="primary" onClick={addColis}>+ Ajouter un colis</s-button>
            </s-stack>

            {/* Liste des colis */}
            {colis.map((c, colisIndex) => {
              const itemCount = colisItemCount(c);
              return (
                <s-box key={c.id} padding="base" background="surface-secondary" border-radius="base">
                  <s-stack direction="block" gap="small">

                    {/* @ts-ignore */}
                    <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
                      <s-stack direction="block" gap="none">
                        <s-heading>Colis {colisIndex + 1} / {colis.length}</s-heading>
                        <s-text tone="subdued">
                          {itemCount} article{itemCount !== 1 ? "s" : ""} · {weightPerColis.toFixed(2)} kg
                        </s-text>
                      </s-stack>
                      {colis.length > 1 && (
                        <s-button variant="primary" tone="critical" onClick={() => removeColis(c.id)}>
                          Supprimer
                        </s-button>
                      )}
                    </s-stack>

                    <s-divider />

                    {lines.map(line => {
                      const ci      = c.items.find(i => i.itemId === line.id);
                      const current = ci?.qty ?? 0;
                      const label   = line.sku || line.title;

                      return (
                        <s-box key={line.id} padding="base" background="surface-secondary" border-radius="base">
                          {/* @ts-ignore */}
                          <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base">
                            <s-stack direction="block" gap="none">
                              <s-text>{label}</s-text>
                              {line.weight > 0 && (
                                <s-text tone="subdued">{line.weight.toFixed(3)} kg/unité</s-text>
                              )}
                            </s-stack>
                            {/* @ts-ignore */}
                            <s-stack direction="inline" alignItems="center" gap="small">
                              <s-button variant="plain" onClick={() => setItemQty(c.id, line.id, current - 1)}>−</s-button>
                              <s-text><strong>{String(current)}</strong> / {line.qty}</s-text>
                              <s-button variant="plain" onClick={() => setItemQty(c.id, line.id, current + 1)}>+</s-button>
                            </s-stack>
                          </s-stack>
                        </s-box>
                      );
                    })}

                  </s-stack>
                </s-box>
              );
            })}

          </s-stack>
        )}
      </s-stack>
    </s-admin-print-action>
  );
}
