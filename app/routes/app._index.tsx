import type { HeadersFunction } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async () => {
  return null;
};

export default function Index() {
  return (
    <div style={{ padding: "20px", color: "red", fontSize: "24px" }}>
      HELLO WORLD
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};