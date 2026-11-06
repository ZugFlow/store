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
import prisma from "@/db.server";
import { generateSupplierSecret, secretLastFour } from "@/lib/hmac";
import { supplierCreateSchema, supplierUpdateSchema } from "@/lib/validation";
import { listSuppliers } from "@/services/dashboard.server";
import { requireShopContext } from "@/services/shop-context.server";
import { authenticate } from "@/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );
  return { suppliers: await listSuppliers(ctx.shop), mode: ctx.mode };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "create") {
    const parsed = supplierCreateSchema.safeParse({
      name: form.get("name"),
      externalId: form.get("externalId") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, message: "Dati fornitore non validi" };
    }

    const externalId =
      parsed.data.externalId ||
      `supplier-${parsed.data.name.toLowerCase().replace(/\s+/g, "-").slice(0, 40)}`;
    const secret = generateSupplierSecret();

    try {
      const supplier = await prisma.supplier.create({
        data: {
          shop: ctx.shop,
          externalId,
          name: parsed.data.name,
          status: "active",
          mode: ctx.mode,
          credentials: {
            create: {
              secretHash: secret,
              secretLastFour: secretLastFour(secret),
            },
          },
        },
      });
      return {
        ok: true as const,
        message: `Fornitore creato: ${supplier.name}`,
        oneTimeSecret: ctx.mode === "mock" ? secret : undefined,
      };
    } catch {
      return { ok: false as const, message: "External ID già in uso" };
    }
  }

  if (intent === "update") {
    const parsed = supplierUpdateSchema.safeParse({
      id: form.get("id"),
      name: form.get("name") || undefined,
      status: form.get("status") || undefined,
    });
    if (!parsed.success) {
      return { ok: false as const, message: "Aggiornamento non valido" };
    }
    await prisma.supplier.updateMany({
      where: { id: parsed.data.id, shop: ctx.shop },
      data: {
        ...(parsed.data.name ? { name: parsed.data.name } : {}),
        ...(parsed.data.status ? { status: parsed.data.status } : {}),
      },
    });
    return { ok: true as const, message: "Fornitore aggiornato" };
  }

  return { ok: false as const, message: "Azione sconosciuta" };
};

export default function SuppliersPage() {
  const { suppliers } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fornitori"
        description="Registry dei fornitori collegati e stato delle sincronizzazioni."
      />

      {actionData && (
        <Alert variant={actionData.ok ? "default" : "destructive"}>
          <AlertTitle>{actionData.ok ? "OK" : "Errore"}</AlertTitle>
          <AlertDescription>
            {actionData.message}
            {"oneTimeSecret" in actionData && actionData.oneTimeSecret ? (
              <code className="mt-2 block font-mono text-xs">
                Secret (una sola volta): {actionData.oneTimeSecret}
              </code>
            ) : null}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Elenco</CardTitle>
          <CardDescription>Fornitori attivi e inattivi per lo shop.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Identificativo</TableHead>
                <TableHead>Stato</TableHead>
                <TableHead>Prodotti</TableHead>
                <TableHead>Ultimo aggiornamento</TableHead>
                <TableHead>Secret</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {suppliers.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs">{s.externalId}</TableCell>
                  <TableCell>
                    <StatusPill value={s.status} />
                  </TableCell>
                  <TableCell>{s.productsLinked}</TableCell>
                  <TableCell>
                    {s.lastSyncAt
                      ? new Date(s.lastSyncAt).toLocaleString()
                      : "—"}
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    ••••{s.secretLastFour}
                  </TableCell>
                  <TableCell>
                    <Form method="post">
                      <input type="hidden" name="intent" value="update" />
                      <input type="hidden" name="id" value={s.id} />
                      <input
                        type="hidden"
                        name="status"
                        value={s.status === "active" ? "inactive" : "active"}
                      />
                      <Button type="submit" variant="outline" size="sm">
                        {s.status === "active" ? "Disattiva" : "Attiva"}
                      </Button>
                    </Form>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nuovo fornitore demo</CardTitle>
          <CardDescription>
            Crea un fornitore di test con secret HMAC monouso.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form method="post" className="grid max-w-lg gap-4">
            <input type="hidden" name="intent" value="create" />
            <div className="grid gap-2">
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" required placeholder="Atelier Roma" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="externalId">Identificativo (opzionale)</Label>
              <Input
                id="externalId"
                name="externalId"
                placeholder="supplier-atelier-roma"
              />
            </div>
            <Button type="submit">Crea fornitore</Button>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
