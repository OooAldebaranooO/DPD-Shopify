import {render} from 'preact';
import {useEffect, useState} from 'preact/hooks';

export default function () {
  render(<Extension />, document.body);
}

function Extension() {
  const {data} = shopify;

  const [orderCount, setOrderCount] = useState<number>(0);
  const [printUrl, setPrintUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    const selected = data?.selected || [];
    setOrderCount(selected.length);
  }, [data]);

  useEffect(() => {
    if (!orderCount) return;

    const selected = data?.selected || [];
    const shop = shopify.config?.shop || "";

    // On passe tous les IDs de commandes sélectionnées
    const ids = selected.map((s: { id: string }) => s.id).join(",");
    const url =
      `https://dpd-shopify-oken.vercel.app/print-dpd-label-bulk?ids=${encodeURIComponent(ids)}` +
      `&shop=${encodeURIComponent(shop)}`;

    setPrintUrl(url);
  }, [orderCount]);

  return (
    <s-admin-print-action src={printUrl || undefined}>
      <s-box>
        <s-stack direction="block" gap="base">
          <s-text>Impression DPD</s-text>
          <s-text>
            {orderCount} commande{orderCount > 1 ? "s" : ""} sélectionnée{orderCount > 1 ? "s" : ""}
          </s-text>
          <s-text>Impression étiquette by Jojo</s-text>
        </s-stack>
      </s-box>
    </s-admin-print-action>
  );
}