import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { PageHeader } from "@/components/AppShell";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import prisma from "@/db.server";
import { signPayload } from "@/lib/hmac";
import { demoSimulateSchema } from "@/lib/validation";
import { listProducts } from "@/services/dashboard.server";
import { demoSecretFor, ensureDemoSeeded } from "@/services/demo/seed";
import { requireShopContext } from "@/services/shop-context.server";
import { authenticate } from "@/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );
  const seed = await ensureDemoSeeded(ctx.shop);
  const products = await listProducts(ctx.shop);
  return {
    products,
    mode: ctx.mode,
    shop: ctx.shop,
    demoSecrets: seed.suppliers,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );
  const form = await request.formData();
  const parsed = demoSimulateSchema.safeParse({
    mappingId: form.get("mappingId"),
    quantity: Number(form.get("quantity")),
    eventId: form.get("eventId") || undefined,
  });

  if (!parsed.success) {
    return { ok: false as const, message: "Input non valido", detail: null };
  }

  const mapping = await prisma.supplierProductMapping.findFirst({
    where: { id: parsed.data.mappingId, shop: ctx.shop },
    include: { supplier: true },
  });

  if (!mapping) {
    return {
      ok: false as const,
      message: "Prodotto non trovato",
      detail: null,
    };
  }

  const eventId =
    parsed.data.eventId ||
    `evt-demo-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  const timestamp = new Date().toISOString();
  const body = {
    eventId,
    supplierId: mapping.supplier.externalId,
    sku: mapping.sku,
    quantity: parsed.data.quantity,
    timestamp,
  };
  const rawBody = JSON.stringify(body);
  const secret = demoSecretFor(mapping.supplier.externalId);
  const signature = signPayload(secret, timestamp, rawBody);

  const url = new URL(request.url);
  const apiUrl = `${url.origin}/api/supplier/inventory-update`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-ArtSync-Shop": ctx.shop,
      "X-ArtSync-Supplier-Id": mapping.supplier.externalId,
      "X-ArtSync-Timestamp": timestamp,
      "X-ArtSync-Signature": signature,
    },
    body: rawBody,
  });

  const json = (await response.json()) as Record<string, unknown>;

  return {
    ok: response.ok,
    message: String(json.message || response.statusText),
    detail: {
      status: response.status,
      eventId,
      request: body,
      response: json,
    },
  };
};

export default function DemoPage() {
  const { products } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aggiorna stock"
        description="Invia un aggiornamento inventario dal fornitore a Shopify."
      />

      {actionData && (
        <Alert variant={actionData.ok ? "default" : "destructive"}>
          <AlertTitle>{actionData.message}</AlertTitle>
          {actionData.detail && (
            <AlertDescription>
              <pre className="mt-3 overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs">
                {JSON.stringify(actionData.detail, null, 2)}
              </pre>
            </AlertDescription>
          )}
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nuovo aggiornamento</CardTitle>
          <CardDescription>
            Invia un evento firmato HMAC all&apos;API fornitori.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid max-w-xl gap-4">
            <div className="grid gap-2">
              <Label htmlFor="mappingId">Prodotto</Label>
              <select
                id="mappingId"
                name="mappingId"
                required
                defaultValue={products[0]?.id}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} ({p.sku}) — qty attuale {p.shopifyQuantity}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="quantity">Nuova quantità</Label>
              <Input
                id="quantity"
                name="quantity"
                type="number"
                min={0}
                defaultValue={2}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="eventId">Event ID (opzionale)</Label>
              <Input
                id="eventId"
                name="eventId"
                placeholder="evt-10001"
                className="font-mono"
              />
            </div>
            <Button type="submit">Invia aggiornamento</Button>
          </Form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Come funziona</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
            <li>Seleziona il prodotto da aggiornare.</li>
            <li>Imposta la nuova quantità disponibile.</li>
            <li>ArtSync firma l&apos;evento con HMAC e lo invia all&apos;API.</li>
            <li>
              Il backend valida, deduplica e aggiorna l&apos;inventario Shopify.
            </li>
            <li>Dashboard, Prodotti e Log mostrano l&apos;esito.</li>
            <li>
              Lo stesso Event ID viene riconosciuto come duplicato.
            </li>
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
