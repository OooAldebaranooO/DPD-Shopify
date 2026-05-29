import type { LoaderFunctionArgs, HeadersFunction } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Layout, Card, Text, BlockStack, List, Banner, Box, InlineStack, Badge } from "@shopify/polaris";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <Page title="Impression DPD LiveDeco">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Comment ça marche ?</Text>
                <List type="number">
                  <List.Item>Depuis n'importe quelle commande, cliquez sur <strong>Autres actions</strong> puis <strong>Impression DPD</strong>.</List.Item>
                  <List.Item>Les articles sont automatiquement chargés et assignés à un colis.</List.Item>
                  <List.Item>Un aperçu s'affiche avec une étiquette DPD par page, prêt à imprimer.</List.Item>
                  <List.Item>Vous pouvez sélectionner plusieurs commandes et imprimer toutes les étiquettes en une fois.</List.Item>
                </List>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Gérer les colis</Text>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Ajouter un colis</Text>
                  <Text as="p" tone="subdued">Par défaut, tous les articles sont regroupés dans un seul colis. Cliquez sur <strong>+ Ajouter un colis</strong> pour en créer un nouveau.</Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Affecter les articles</Text>
                  <Text as="p" tone="subdued">Utilisez les boutons <strong>−</strong> et <strong>+</strong> pour ajuster la quantité de chaque article dans chaque colis.</Text>
                  <InlineStack gap="200">
                    <Badge tone="warning">2 restant(s)</Badge>
                    <Text as="span" tone="subdued">→ des unités ne sont pas encore affectées</Text>
                  </InlineStack>
                  <InlineStack gap="200">
                    <Badge tone="success">✓ Assigné</Badge>
                    <Text as="span" tone="subdued">→ toutes les unités sont affectées</Text>
                  </InlineStack>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Supprimer un colis</Text>
                  <Text as="p" tone="subdued">Cliquez sur <strong>Supprimer</strong> à côté du colis concerné. Le premier colis ne peut pas être supprimé.</Text>
                </BlockStack>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Limites et contraintes DPD</Text>
                <Banner tone="warning">
                  <Text as="p">Le poids maximum par colis est de <strong>31,5 kg</strong>.</Text>
                </Banner>
                <List>
                  <List.Item>Poids maximum par colis : <strong>31,5 kg</strong></List.Item>
                  <List.Item>Destinations : France, Allemagne, Belgique, Espagne, Italie, Pays-Bas, Luxembourg, Suisse, Autriche, Portugal, Pologne</List.Item>
                  <List.Item>Le service <strong>Predict</strong> est activé automatiquement pour les mobiles français (06/07)</List.Item>
                  <List.Item>Étiquettes au format A6 (105×148 mm)</List.Item>
                </List>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
        <Layout.Section variant="oneThird">
          <BlockStack gap="400">
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">Informations</Text>
                <Text as="p" tone="subdued">Application développée exclusivement pour Livedeco.com</Text>
                <Text as="p" tone="subdued">Johan Vauche-Forot — contact@johanvf.pro</Text>
                <Text as="p" tone="subdued">© 2026 - Tous droits réservés</Text>
              </BlockStack>
            </Card>
            <Card>
              <BlockStack gap="200">
                <Text as="h2" variant="headingMd">En cas de problème</Text>
                <List>
                  <List.Item>Vérifiez le poids total du colis (max 31,5 kg)</List.Item>
                  <List.Item>Vérifiez l'adresse de livraison (code postal + ville cohérents)</List.Item>
                  <List.Item>Vérifiez que le pays est supporté par DPD</List.Item>
                </List>
                <Box paddingBlockStart="200">
                  <Text as="p" tone="subdued">Contact : <strong>contact@johanvf.pro</strong></Text>
                </Box>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};