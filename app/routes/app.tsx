import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="Impression DPD">
      <s-section heading="Comment ça marche ?">
        <s-paragraph>
          1. Depuis n'importe quelle commande, cliquez sur "Autres actions" puis "Impression DPD".
        </s-paragraph>
        <s-paragraph>
          2. Le nombre d'étiquettes est calculé automatiquement selon la quantité d'articles de la commande.
        </s-paragraph>
        <s-paragraph>
          3. Un aperçu s'affiche avec une étiquette DPD par page, prêt à imprimer.
        </s-paragraph>
        <s-paragraph>
          4. Vous pouvez aussi sélectionner plusieurs commandes depuis la liste et imprimer toutes les étiquettes en une fois.
        </s-paragraph>
      </s-section>

      <s-section slot="aside" heading="Informations">
        <s-paragraph>
          Application développée exclusivement pour Livedeco.com
        </s-paragraph>
        <s-paragraph>
          Johan Vauche-Forot - contact@johanvf.pro
        </s-paragraph>
        <s-paragraph>
          © 2026 - Tous droits réservés
        </s-paragraph>
      </s-section>
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};