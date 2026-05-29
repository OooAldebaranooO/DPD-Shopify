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
      return { weight: 1, sku: skus }; // poids fixe à 1
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

  function assignedQty(itemId: string): number {
    return colis.reduce((acc, c) => {
      const ci = c.items.find(i => i.itemId === itemId);
      return acc + (ci?.qty || 0);
    }, 0);
  }

  function setItemQty(colisId: string, itemId: string, newQty: number) {
    const line = lines.find(l => l.id === itemId);
    if (!line) return;
    setColis(prev => {
      const assignedInOthers = prev
        .filter(c => c.id !== colisId)
        .reduce((acc, c) => acc + (c.items.find(ci => ci.itemId === itemId)?.qty ?? 0), 0);
      const maxForThis = line.qty - assignedInOthers;
      const clamped = Math.max(0, Math.min(newQty, maxForThis));
      return prev.map(c => {
        if (c.id !== colisId) return c;
        const existing = c.items.find(ci => ci.itemId === itemId);
        if (existing) return { ...c, items: c.items.map(ci => ci.itemId === itemId ? { ...ci, qty: clamped } : ci) };
        return { ...c, items: [...c.items, { itemId, qty: clamped }] };
      });
    });
  }

  function assignRemaining(colisId: string) {
    setColis(prev => prev.map(c => {
      if (c.id !== colisId) return c;
      const updated = c.items.map(ci => {
        const line = lines.find(l => l.id === ci.itemId);
        if (!line) return ci;
        const assignedInOthers = prev
          .filter(other => other.id !== colisId)
          .reduce((acc, other) => acc + (other.items.find(i => i.itemId === ci.itemId)?.qty ?? 0), 0);
        return { ...ci, qty: line.qty - assignedInOthers };
      });
      return { ...c, items: updated };
    }));
  }

  function colisWeight(c: Colis): number {
    return c.items.reduce((acc, ci) => {
      const line = lines.find(l => l.id === ci.itemId);
      return acc + (line ? line.weight * ci.qty : 0);
    }, 0);
  }

  function colisItemCount(c: Colis): number {
    return c.items.reduce((acc, ci) => acc + ci.qty, 0);
  }

  const unassignedLines = lines.filter(l => assignedQty(l.id) < l.qty);
  const allAssigned     = unassignedLines.length === 0;
  const totalWeight     = lines.reduce((acc, l) => acc + l.weight * l.qty, 0);

  return (
    <s-admin-print-action src={allAssigned && printUrl ? printUrl : undefined}>
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
            <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base" {...{} as any}>
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
                  <s-text tone="subdued">Colis</s-text>
                  <s-heading>{String(colis.length)}</s-heading>
                </s-stack>
              </s-box>
              <s-button variant="primary" onClick={addColis}>+ Ajouter un colis</s-button>
            </s-stack>

            {/* Statut d'assignation */}
            {!allAssigned ? (
              <s-banner tone="warning">
                {unassignedLines.map(l => {
                  const missing = l.qty - assignedQty(l.id);
                  return `${l.sku || l.title} — ${missing} unité${missing > 1 ? "s" : ""} non assignée${missing > 1 ? "s" : ""}`;
                }).join("  •  ")}
              </s-banner>
            ) : (
              <s-banner tone="success">Tous les articles sont assignés — prêt à imprimer</s-banner>
            )}

            {/* Liste des colis */}
            {colis.map((c, colisIndex) => {
              const weight    = colisWeight(c);
              const itemCount = colisItemCount(c);
              const hasRemaining = lines.some(l => {
                const assignedInOthers = colis
                  .filter(other => other.id !== c.id)
                  .reduce((acc, other) => acc + (other.items.find(ci => ci.itemId === l.id)?.qty ?? 0), 0);
                return l.qty - assignedInOthers > (c.items.find(ci => ci.itemId === l.id)?.qty ?? 0);
              });

              return (
                <s-box key={c.id} padding="base" background="surface-secondary" border-radius="base">
                  <s-stack direction="block" gap="small">

                    <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base" {...{} as any}>
                      <s-stack direction="block" gap="none">
                        <s-heading>Colis {colisIndex + 1} / {colis.length}</s-heading>
                        <s-text tone="subdued">
                          {itemCount} article{itemCount !== 1 ? "s" : ""}
                        </s-text>
                      </s-stack>
                      <s-stack direction="inline" gap="small" {...{} as any}>
                        {hasRemaining && (
                          <s-button variant="plain" onClick={() => assignRemaining(c.id)}>
                            Tout assigner ici
                          </s-button>
                        )}
                        {colis.length > 1 && (
                          <s-button variant="primary" tone="critical" onClick={() => removeColis(c.id)}>
                            Supprimer
                          </s-button>
                        )}
                      </s-stack>
                    </s-stack>

                    <s-divider />

                    {lines.map(line => {
                      const ci              = c.items.find(i => i.itemId === line.id);
                      const current         = ci?.qty ?? 0;
                      const globalRemaining = line.qty - assignedQty(line.id);
                      const label           = line.sku || line.title;

                      const badgeTone = globalRemaining === 0
                        ? "success"
                        : current === 0
                          ? "neutral"
                          : "warning";
                      const badgeText = globalRemaining === 0
                        ? "Complet"
                        : current === 0
                          ? "Non assigné"
                          : `${globalRemaining} non assigné${globalRemaining > 1 ? "s" : ""}`;

                      return (
                        <s-box key={line.id} padding="base" background="surface-secondary" border-radius="base" borderColor="base" {...{} as any}>
                          <s-stack direction="inline" justifyContent="space-between" alignItems="center" gap="base" {...{} as any}>
                            <s-stack direction="block" gap="none">
                              <s-text>{label}</s-text>
                              {line.weight > 0 && (
                                <s-text tone="subdued">{line.weight.toFixed(3)} kg/unité</s-text>
                              )}
                            </s-stack>
                            <s-stack direction="inline" alignItems="center" gap="small" {...{} as any}>
                              <s-button variant="plain" onClick={() => setItemQty(c.id, line.id, current - 1)}>−</s-button>
                              <s-text><strong>{String(current)}</strong> / {line.qty}</s-text>
                              <s-button variant="plain" onClick={() => setItemQty(c.id, line.id, current + 1)}>+</s-button>
                              <s-badge tone={badgeTone}>{badgeText}</s-badge>
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
