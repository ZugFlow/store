import type { HeadersFunction, LinksFunction, LoaderFunctionArgs } from "react-router";
import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { AppShell } from "@/components/AppShell";
import { isMockMode } from "@/lib/config";
import { requireShopContext } from "@/services/shop-context.server";
import { authenticate } from "@/shopify.server";
import stylesheet from "@/app.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-sans/style.min.css",
  },
  {
    rel: "stylesheet",
    href: "https://cdn.jsdelivr.net/npm/geist@1.3.1/dist/fonts/geist-mono/style.min.css",
  },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    mode: ctx.mode,
    shop: ctx.shop,
    mock: isMockMode(),
  };
};

export default function App() {
  const data = useLoaderData<typeof loader>();

  const body = (
    <AppShell mode={data.mode} shop={data.shop}>
      <Outlet />
    </AppShell>
  );

  if (data.mock) {
    return body;
  }

  return <AppProvider apiKey={data.apiKey}>{body}</AppProvider>;
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
