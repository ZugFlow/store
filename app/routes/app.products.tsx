import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { Form, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { PageHeader, StatusPill } from "@/components/AppShell";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listProducts, listSuppliers } from "@/services/dashboard.server";
import { requireShopContext } from "@/services/shop-context.server";
import { importProductsFromShopify } from "@/services/shopify/import-products.server";
import { authenticate } from "@/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );
  const [products, suppliers] = await Promise.all([
    listProducts(ctx.shop),
    listSuppliers(ctx.shop),
  ]);
  return {
    products,
    suppliers,
    mode: ctx.mode,
    shop: ctx.shop,
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent !== "import") {
    return { ok: false as const, message: "Azione sconosciuta" };
  }

  if (ctx.mode !== "live" || !ctx.admin) {
    return {
      ok: false as const,
      message:
        "Import da Shopify non disponibile: app non collegata allo shop.",
    };
  }

  const supplierId = String(form.get("supplierId") || "");
  const onlySku = String(form.get("onlySku") || "").trim() || undefined;
  if (!supplierId) {
    return { ok: false as const, message: "Seleziona un fornitore" };
  }

  try {
    const result = await importProductsFromShopify({
      shop: ctx.shop,
      admin: ctx.admin,
      supplierId,
      onlySku,
    });
    return {
      ok: true as const,
      message: `Import completato: ${result.imported} nuovi, ${result.updated} aggiornati, ${result.skipped} saltati.`,
      issues: result.issues.slice(0, 20),
    };
  } catch (error) {
    return {
      ok: false as const,
      message: error instanceof Error ? error.message : "Import fallito",
    };
  }
};

export default function ProductsPage() {
  const { products, suppliers, mode, shop } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Prodotti"
        description={`Mappatura SKU fornitore ↔ inventory item Shopify · ${shop}`}
      />

      {actionData && (
        <Alert variant={actionData.ok ? "default" : "destructive"}>
          <AlertTitle>{actionData.ok ? "Import" : "Errore"}</AlertTitle>
          <AlertDescription>
            <p>{actionData.message}</p>
            {"issues" in actionData &&
            Array.isArray(actionData.issues) &&
            actionData.issues.length > 0 ? (
              <ul className="mt-2 list-disc pl-5 text-xs">
                {actionData.issues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      {mode === "live" && (
        <Card>
          <CardHeader>
            <CardTitle>Importa prodotti da Shopify</CardTitle>
            <CardDescription>
              Legge prodotti/varianti/SKU/inventory item/location via GraphQL.
              Non riassegna SKU già legati a un altro fornitore.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="grid max-w-xl gap-4">
              <input type="hidden" name="intent" value="import" />
              <div className="grid gap-2">
                <Label htmlFor="supplierId">Associa a fornitore</Label>
                <select
                  id="supplierId"
                  name="supplierId"
                  required
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs"
                  defaultValue={suppliers[0]?.id}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.externalId})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="onlySku">Solo SKU (opzionale)</Label>
                <Input
                  id="onlySku"
                  name="onlySku"
                  placeholder="PET-001"
                  className="font-mono"
                />
              </div>
              <Button type="submit">Importa prodotti da Shopify</Button>
            </Form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Catalogo monitorato</CardTitle>
          <CardDescription>
            Quantità fornitore e quantità Shopify a confronto.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Prodotto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Fornitore</TableHead>
                <TableHead>Qty fornitore</TableHead>
                <TableHead>Qty Shopify</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Aggiornato</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <img
                        src={
                          p.imageUrl ||
                          "https://cdn.shopify.com/s/files/1/0533/2089/files/placeholder-images-image_large.png"
                        }
                        alt=""
                        className="size-10 rounded-md border object-cover"
                      />
                      <span className="font-medium">{p.title}</span>
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{p.sku}</TableCell>
                  <TableCell>{p.supplierName}</TableCell>
                  <TableCell>{p.supplierQuantity}</TableCell>
                  <TableCell>{p.shopifyQuantity}</TableCell>
                  <TableCell>
                    <StatusPill value={p.syncStatus} />
                  </TableCell>
                  <TableCell>
                    {p.lastSyncedAt
                      ? new Date(p.lastSyncedAt).toLocaleString()
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
