import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, Layout, Card, Text, BlockStack, List, Banner, Box, InlineStack, Badge } from "@shopify/polaris";

export const loader = async () => {
  return null;
};

export default function Index() {
  return (
    <Page title="Impression DPD LiveDeco">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Comment ça marche ?</Text>
              <List type="number">
                <List.Item>Depuis une commande, cliquez sur <strong>Autres actions</strong> puis <strong>Impression DPD</strong>.</List.Item>
                <List.Item>Les articles sont automatiquement chargés et assignés à un colis.</List.Item>
                <List.Item>Un aperçu s'affiche avec une étiquette DPD par page, prêt à imprimer.</List.Item>
              </List>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};