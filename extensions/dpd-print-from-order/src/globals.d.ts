import { JSX as PreactJSX } from "preact";

declare global {
  const shopify: {
    data: {
      selected?: Array<{ id: string }>;
    };
    query: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{
      data?: {
        nodes?: Array<{
          __typename: string;
          id?: string;
          name?: string;
          lineItems?: {
            edges: Array<{
              node: {
                quantity: number;
                name: string;
              };
            }>;
          };
        }>;
      };
    }>;
    config?: {
      shop?: string;
    };
  };
}

declare module "preact" {
  namespace JSX {
    interface IntrinsicElements {
      "s-admin-print-action": PreactJSX.HTMLAttributes<HTMLElement> & { src?: string };
      "s-box": PreactJSX.HTMLAttributes<HTMLElement>;
      "s-stack": PreactJSX.HTMLAttributes<HTMLElement> & { direction?: string; gap?: string };
      "s-text": PreactJSX.HTMLAttributes<HTMLElement> & { tone?: string };
    }
  }
}