import "@shopify/polaris/build/esm/styles.css";
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from "react-router";

export default function App() {
  console.log("DB proto:", process.env.DATABASE_URL?.slice(0, 15));
  console.log("DIRECT proto:", process.env.DIRECT_URL?.slice(0, 15));
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}