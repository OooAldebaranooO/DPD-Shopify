import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Layout, Card, Text, BlockStack, List, Banner, Box, InlineStack, Badge } from "@shopify/polaris";

export const loader = async () => {
  return null;
};

export default function Index() {
  return (
    <Page
        title="Impression d'étiquettes DPD LiveDeco"
        titleMetadata={
          <img
            src="https://dpd-shopify-oken.vercel.app/dpd-logo.png"
            alt="DPD"
            style={{ height: "32px" }}
          />
        }
      >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Comment ça marche ?</Text>
                <List type="number">
                  <List.Item>Depuis une commande, cliquez sur <strong>Imprimer</strong> puis <strong>DPD Livedeco</strong>.</List.Item>
                  <List.Item>Les articles sont automatiquement chargés et assignés à un colis.</List.Item>
                  <List.Item>Un aperçu s'affiche avec une étiquette DPD par page, prêt à imprimer.</List.Item>
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
                  <Text as="p" tone="subdued">Utilisez les boutons <strong>−</strong> et <strong>+</strong> pour ajuster la quantité de chaque article dans chaque colis. Un banner indique si des articles ne sont assignés dans aucun colis.</Text>
                  <InlineStack gap="200">
                    <Badge tone="warning">Article non assigné</Badge>
                    <Text as="span" tone="subdued">→ l'article n'est dans aucun colis</Text>
                  </InlineStack>
                  <InlineStack gap="200">
                    <Badge tone="success">Tous les articles sont assignés</Badge>
                    <Text as="span" tone="subdued">→ prêt à imprimer</Text>
                  </InlineStack>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Poids par colis</Text>
                  <Text as="p" tone="subdued">Le poids affiché sur chaque étiquette est calculé automatiquement : poids total ÷ nombre de colis. Vous pouvez créer autant de colis que nécessaire pour un même produit lourd.</Text>
                </BlockStack>
                <BlockStack gap="200">
                  <Text as="h3" variant="headingSm">Supprimer un colis</Text>
                  <Text as="p" tone="subdued">Cliquez sur <strong>Supprimer</strong> à côté du colis concerné. Le premier colis ne peut pas être supprimé.</Text>
                </BlockStack>
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Limites DPD</Text>
                <Banner tone="warning">
                  <Text as="p">Le poids maximum par colis est de <strong>31,5 kg</strong>.</Text>
                </Banner>
                <List>
                  <List.Item>Poids maximum par colis : <strong>31,5 kg</strong></List.Item>
                  <List.Item>Destinations : France, Allemagne, Belgique, Espagne, Italie, Pays-Bas, Luxembourg, Suisse, Autriche, Portugal, Pologne</List.Item>
                  <List.Item>Service <strong>Predict</strong> activé automatiquement pour les mobiles français (06/07)</List.Item>
                  <List.Item>Étiquettes au format A6 (105×148 mm)</List.Item>
                </List>
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

            <Card>
              <InlineStack align="space-between">
                <BlockStack gap="200">
                  <Text as="h2" variant="headingMd">Informations</Text>
                  <Text as="p" tone="subdued">Application développée exclusivement pour Livedeco.com</Text>
                  <Text as="p" tone="subdued">Johan Vauche-Forot - contact@johanvf.pro</Text>
                  <Text as="p" tone="subdued">© 2026 - Tous droits réservés</Text>
                </BlockStack>
                <a href="https://www.johanvf.pro/" target="_blank" rel="noopener noreferrer">
                    <img src="https://www.johanvf.pro/logo_jvfpro.png" alt="Logo" style={{ height: "60px", margin: "auto 0px" }} />
                </a>
              </InlineStack>
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