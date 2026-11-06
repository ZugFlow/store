import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { PageHeader, StatusPill } from "@/components/AppShell";
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
import { getDashboardStats } from "@/services/dashboard.server";
import { requireShopContext } from "@/services/shop-context.server";
import { authenticate } from "@/shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const ctx = await requireShopContext(request, (req) =>
    authenticate.admin(req),
  );
  const stats = await getDashboardStats(ctx.shop);
  return { stats, mode: ctx.mode };
};

export default function Dashboard() {
  const { stats } = useLoaderData<typeof loader>();

  const cards = [
    { label: "Fornitori", value: stats.suppliersConnected },
    { label: "Prodotti", value: stats.productsMonitored },
    { label: "Sync OK", value: stats.succeeded },
    { label: "Sync fallite", value: stats.failed },
    {
      label: "Ultima sync",
      value: stats.lastSyncAt
        ? new Date(stats.lastSyncAt).toLocaleString()
        : "—",
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dashboard"
        description="Panoramica sincronizzazione inventari."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardDescription>{card.label}</CardDescription>
              <CardTitle className="text-2xl tabular-nums">{card.value}</CardTitle>
            </CardHeader>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Eventi recenti</CardTitle>
          <CardDescription>
            Ultimi eventi elaborati dalla pipeline di sync.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {stats.recentEvents.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Nessun evento ancora. Invia un aggiornamento stock per iniziare.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Data</TableHead>
                  <TableHead>Evento</TableHead>
                  <TableHead>Fornitore</TableHead>
                  <TableHead>SKU</TableHead>
                  <TableHead>Qty</TableHead>
                  <TableHead>Esito</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.recentEvents.map((e) => (
                  <TableRow key={e.id}>
                    <TableCell>{new Date(e.createdAt).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.eventId || "—"}
                    </TableCell>
                    <TableCell>{e.supplier}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {e.sku || "—"}
                    </TableCell>
                    <TableCell>
                      {e.previousQuantity ?? "—"} → {e.newQuantity ?? "—"}
                    </TableCell>
                    <TableCell>
                      <StatusPill value={e.outcome} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
