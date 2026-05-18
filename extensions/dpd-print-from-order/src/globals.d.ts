declare const shopify: {
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

declare namespace JSX {
  interface IntrinsicElements {
    "s-admin-print-action": { src?: string; children?: any };
    "s-box": { children?: any };
    "s-stack": { direction?: string; gap?: string; children?: any };
    "s-text": { tone?: string; children?: any };
  }
}