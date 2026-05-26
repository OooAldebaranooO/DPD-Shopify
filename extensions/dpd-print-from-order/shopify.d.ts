import '@shopify/ui-extensions';

//@ts-ignore
declare module './src/BulkPrintExtension.tsx' {
  const shopify: import('@shopify/ui-extensions/admin.order-index.selection-print-action.render').Api;
  const globalThis: { shopify: typeof shopify };
}

//@ts-ignore
declare module './src/PrintActionExtension.tsx' {
  const shopify: import('@shopify/ui-extensions/admin.order-details.print-action.render').Api;
  const globalThis: { shopify: typeof shopify };
}
