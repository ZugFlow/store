import { NavLink } from "react-router";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

const LINKS = [
  { to: "/app", label: "Dashboard", end: true },
  { to: "/app/suppliers", label: "Fornitori" },
  { to: "/app/products", label: "Prodotti" },
  { to: "/app/logs", label: "Log" },
  { to: "/app/demo", label: "Aggiorna stock" },
];

export function AppShell({
  shop,
  children,
}: {
  shop: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-svh bg-background">
      <header className="sticky top-0 z-20 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="min-w-0">
            <div className="text-base font-semibold tracking-tight">ArtSync</div>
            <div className="truncate text-xs text-muted-foreground">
              Inventory sync · {shop}
            </div>
          </div>

          <nav className="flex flex-wrap items-center gap-1">
            {LINKS.map((link) => (
              <NavLink
                key={link.to}
                to={link.to}
                end={link.end}
                className={({ isActive }) =>
                  cn(
                    "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                    isActive && "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
                  )
                }
              >
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <Separator />
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
        {children}
      </main>
    </div>
  );
}

export function StatusPill({ value }: { value: string }) {
  const variant =
    value === "succeeded" || value === "synced" || value === "active"
      ? "default"
      : value === "failed" || value === "rejected"
        ? "destructive"
        : "secondary";

  return (
    <Badge variant={variant} className="capitalize">
      {value}
    </Badge>
  );
}

export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
