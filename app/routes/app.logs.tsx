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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import prisma from "@/db.server";
import { listLogs } from "@/services/dashboard.server";
import { requireShopContext } from "@/services/shop-context.server";
import { retryFailedSyncEvent } from "@/services/sync/sync-supplier-inventory";
import { authenticate } from "@/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );
  const [logs, failedEvents] = await Promise.all([
    listLogs(ctx.shop),
    prisma.inventorySyncEvent.findMany({
      where: { shop: ctx.shop, status: "failed" },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);
  return { logs, failedEvents };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );
  const form = await request.formData();
  const eventDbId = String(form.get("eventDbId") || "");
  if (!eventDbId) {
    return { ok: false as const, message: "Evento mancante" };
  }
  const result = await retryFailedSyncEvent({
    shop: ctx.shop,
    eventDbId,
    client: ctx.client,
  });
  return {
    ok: result.status === "succeeded",
    message: result.message,
  };
};

export default function LogsPage() {
  const { logs, failedEvents } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Log"
        description="Audit trail delle sincronizzazioni: esiti, quantità e errori."
      />

      {actionData && (
        <Alert variant={actionData.ok ? "default" : "destructive"}>
          <AlertTitle>{actionData.ok ? "Retry" : "Errore"}</AlertTitle>
          <AlertDescription>{actionData.message}</AlertDescription>
        </Alert>
      )}

      {failedEvents.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sync fallite</CardTitle>
            <CardDescription>Riprova in sicurezza gli eventi falliti.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Evento</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Errore</TableHead>
                  <TableHead>Tentativi</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {failedEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell className="font-mono text-xs">{e.eventId}</TableCell>
                    <TableCell className="font-mono text-xs">{e.sku}</TableCell>
                    <TableCell>{e.errorMessage}</TableCell>
                    <TableCell>{e.attempts}</TableCell>
                    <TableCell>
                      <Form method="post">
                        <input type="hidden" name="eventDbId" value={e.id} />
                        <Button type="submit" variant="outline" size="sm">
                          Riprova
                        </Button>
                      </Form>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Storico</CardTitle>
          <CardDescription>Registro completo degli esiti di sync.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data e ora</TableHead>
                <TableHead>ID evento</TableHead>
                <TableHead>Fornitore</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Qty prec.</TableHead>
                <TableHead>Nuova qty</TableHead>
                <TableHead>Esito</TableHead>
                <TableHead>Messaggio</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {logs.map((l) => (
                <TableRow key={l.id}>
                  <TableCell>{new Date(l.createdAt).toLocaleString()}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {l.eventId || "—"}
                  </TableCell>
                  <TableCell>{l.supplier}</TableCell>
                  <TableCell className="font-mono text-xs">{l.sku || "—"}</TableCell>
                  <TableCell>{l.previousQuantity ?? "—"}</TableCell>
                  <TableCell>{l.newQuantity ?? "—"}</TableCell>
                  <TableCell>
                    <StatusPill value={l.outcome} />
                  </TableCell>
                  <TableCell>{l.message || "—"}</TableCell>
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
