import type { HeadersFunction } from "react-router";
import { Outlet } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useRouteError } from "react-router";
import { AppProvider } from "@shopify/polaris";
import fr from "@shopify/polaris/locales/fr.json";

export const loader = async () => {
  return null;
};

export default function App() {
  return (
    <AppProvider i18n={fr}>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};