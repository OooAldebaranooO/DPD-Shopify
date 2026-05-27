import '@shopify/ui-extensions/preact';
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';

export default function () {
  render(<Extension />, document.body);
}

// ── Types ────────────────────────────────────────────────────────────────────

interface LineItem {
  id:     string;
  title:  string;
  sku:    string;
  qty:    number;
  weight: number;
}

interface Colis {
  id:      string;
  itemIds: string[];
}

// ── Component ────────────────────────────────────────────────────────────────

function Extension() {
  const { data } = shopify;

  const [orderName, setOrderName] = useState<string | null>(null);
  const [lines, setLines]         = useState<LineItem[]>([]);
  const [colis, setColis]         = useState<Colis[]>([]);
  const [printUrl, setPrintUrl]   = useState<string | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [addr, setAddr]           = useState<any>(null);

  // ── Chargement commande ──
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
                  firstName lastName company address1 address2 zip city phone
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
            return {
              id:     `item-${i}`,
              title:  node?.title || "",
              sku:    node?.variant?.sku || "",
              qty:    node?.currentQuantity || 1,
              weight: weightKg,
            };
          });

        setOrderName(order.name);
        setAddr(order.shippingAddress);
        setLines(loadedLines);
        setColis([{ id: 'colis-1', itemIds: loadedLines.map((l: LineItem) => l.id) }]);
        setIsLoading(false);
      } catch (e) {
        console.error(e);
        setError("Erreur lors du chargement.");
        setIsLoading(false);
      }
    }
    loadOrder();
  }, [data]);

  // ── Génère l'URL à chaque changement de colis ──
  useEffect(() => {
    if (!addr || colis.length === 0 || lines.length === 0) return;

    const destName    = addr ? `${addr.firstName || ""} ${addr.lastName || ""}`.trim() : "";
    const destCompany = addr?.company || "";

    const colisItems = colis.map(c => {
      const colisLines = lines.filter(l => c.itemIds.includes(l.id));
      const totalWeight = colisLines.reduce((acc, l) => acc + l.weight * l.qty, 0);
      const skus = colisLines.map(l => l.sku).filter(Boolean).join("+");
      return { weight: Math.max(0.01, totalWeight), sku: skus };
    });

    const count        = colis.length;
    const weightsParam = colisItems.map(i => i.weight.toFixed(3)).join(",");
    const skusParam    = colisItems.map(i => encodeURIComponent(i.sku)).join("|");

    const url = `https://dpd-shopify-oken.vercel.app/print-dpd-label` +
      `?orderName=${encodeURIComponent(orderName ?? "")}` +
      `&count=${count}` +
      `&destName=${encodeURIComponent(destName)}` +
      `&destCompany=${encodeURIComponent(destCompany)}` +
      `&destAddress=${encodeURIComponent(addr?.address1 || "")}` +
      `&destAddress2=${encodeURIComponent(addr?.address2 || "")}` +
      `&destZip=${encodeURIComponent(addr?.zip || "")}` +
      `&destCity=${encodeURIComponent(addr?.city || "")}` +
      `&destPhone=${encodeURIComponent(addr?.phone || "")}` +
      `&weights=${encodeURIComponent(weightsParam)}` +
      `&skus=${encodeURIComponent(skusParam)}` +
      `&titles=${encodeURIComponent(skusParam)}`;

    setPrintUrl(url);
  }, [colis, lines, addr, orderName]);

  // ── Actions ──
  function addColis() {
    setColis(prev => [...prev, { id: `colis-${Date.now()}`, itemIds: [] }]);
  }

  function removeColis(colisId: string) {
    setColis(prev => prev.filter(c => c.id !== colisId));
  }

  function toggleItem(colisId: string, itemId: string) {
    setColis(prev => prev.map(c => {
      if (c.id !== colisId) return c;
      const has = c.itemIds.includes(itemId);
      return { ...c, itemIds: has ? c.itemIds.filter(id => id !== itemId) : [...c.itemIds, itemId] };
    }));
  }

  const unassignedItems = lines.filter(l => !colis.some(c => c.itemIds.includes(l.id)));

  return (
    <s-admin-print-action src={printUrl || undefined}>
      <s-stack direction="block" gap="base">

        {/* Header */}
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

            {/* Résumé */}
            <s-stack direction="inline" gap="base">
              <s-box padding="base" background="surface-secondary">
                <s-stack direction="block" gap="none">
                  <s-text tone="subdued">Commande</s-text>
                  <s-heading>{orderName}</s-heading>
                </s-stack>
              </s-box>
              <s-box padding="base" background="surface-secondary">
                <s-stack direction="block" gap="none">
                  <s-text tone="subdued">Colis</s-text>
                  <s-heading>{String(colis.length)}</s-heading>
                </s-stack>
              </s-box>
            </s-stack>

            {/* Alerte produits non assignés */}
            {unassignedItems.length > 0 && (
              <s-banner tone="warning">
                {unassignedItems.length} produit(s) non assigné(s) à un colis
              </s-banner>
            )}

            {/* Liste des colis */}
            {colis.map((c, colisIndex) => (
              <s-box padding="base" background="surface-secondary">
                <s-stack direction="block" gap="small">

                  {/* Header colis */}
                  <s-stack direction="inline" gap="base">
                    <s-text><strong>📦 Colis {colisIndex + 1}/{colis.length}</strong></s-text>
                    {colis.length > 1 && (
                      <s-button tone="critical" variant="plain" onClick={() => removeColis(c.id)}>
                        Supprimer
                      </s-button>
                    )}
                  </s-stack>

                  {/* Produits */}
                  {lines.map(line => (
                    <s-checkbox
                      label={`${line.sku ? line.sku + ' — ' : ''}${line.title} (x${line.qty})`}
                      checked={c.itemIds.includes(line.id)}
                      onChange={() => toggleItem(c.id, line.id)}
                    />
                  ))}

                </s-stack>
              </s-box>
            ))}

            {/* Bouton ajouter colis */}
            <s-button onClick={addColis}>+ Ajouter un colis</s-button>

          </s-stack>
        )}
      </s-stack>
    </s-admin-print-action>
  );
}
