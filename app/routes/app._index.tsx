import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import db from "../db.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await db.dpdConfig.findUnique({
    where: { shop: session.shop },
  });
  return { configured: !!config?.login };
};

export default function Index() {
  const { configured } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Impression DPD">
      <s-section heading="Statut de la configuration">
        {configured ? (
          <s-banner tone="success">
            <s-paragraph>
              ✅ Votre compte DPD est configuré. L'impression d'étiquettes est active depuis vos commandes.
            </s-paragraph>
          </s-banner>
        ) : (
          <s-banner tone="warning">
            <s-paragraph>
              ⚠️ Votre compte DPD n'est pas encore configuré. Rendez-vous dans "Configuration DPD" pour renseigner vos identifiants.
            </s-paragraph>
          </s-banner>
        )}
      </s-section>

      <s-section heading="Comment ça marche ?">
        <s-paragraph>
          1. Renseignez vos credentials DPD dans la page "Configuration DPD".
        </s-paragraph>
        <s-paragraph>
          2. Depuis n'importe quelle commande, cliquez sur "Autres actions" puis "Impression DPD".
        </s-paragraph>
        <s-paragraph>
          3. Le nombre d'étiquettes est calculé automatiquement selon la quantité d'articles de la commande.
        </s-paragraph>
        <s-paragraph>
          4. Un PDF est généré avec une étiquette DPD par page, prêt à imprimer.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Accès rapide">
        <s-button href="/app/dpd-config" variant="primary">
          Configuration DPD
        </s-button>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};