import { useState } from "react";
import {
  FlaskConical,
  Gauge,
  LogOut,
  Menu,
  Waypoints,
  type LucideIcon,
} from "lucide-react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router";

import { Brand } from "@/components/Brand";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

const navigation: Array<{ to: string; label: string; icon: LucideIcon; end?: boolean }> = [
  { to: "/dashboard", label: "Overview", icon: Gauge, end: true },
  { to: "/dashboard/traces", label: "Traces", icon: Waypoints },
  { to: "/dashboard/playground", label: "Playground", icon: FlaskConical },
];

const pageTitles: Record<string, string> = {
  "/dashboard": "Overview",
  "/dashboard/traces": "Traces",
  "/dashboard/playground": "Playground",
};

function SidebarContent({ onNavigate }: { onNavigate?: () => void }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-16 items-center border-b border-sidebar-border px-4">
        <Brand showVersion />
      </div>

      <div className="flex-1 px-3 py-5">
        <p className="mono-label px-2">Workbench</p>
        <nav className="mt-2 space-y-1">
          {navigation.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={onNavigate}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[13px] transition-colors",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground",
                )
              }
            >
              <item.icon className="size-4" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-8 px-2">
          <p className="mono-label">This device</p>
          <div className="mt-2 rounded-md border border-sidebar-border bg-background/40 p-2.5">
            <div className="flex items-center gap-2 font-mono text-[10px] text-muted-foreground">
              <span className="size-1.5 rounded-full bg-primary" />
              local mode
            </div>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              Sample runs use the real inspector package. No provider keys are
              needed.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          <div className="grid size-7 shrink-0 place-items-center rounded-full border border-border bg-muted font-mono text-[10px] text-muted-foreground">
            {(user?.name ?? user?.email ?? "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11.5px] text-foreground/85">
              {user?.name ?? (user?.isAnonymous ? "Guest" : user?.email ?? "Signed in")}
            </p>
            <p className="truncate font-mono text-[9.5px] text-muted-foreground">
              {user?.email ?? "anonymous session"}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="size-7 text-muted-foreground"
            aria-label="Sign out"
            onClick={() => {
              void signOut().then(() => navigate("/"));
            }}
          >
            <LogOut className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default function DashboardLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const title = pageTitles[location.pathname] ?? "Workbench";

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-sidebar-border bg-sidebar md:block">
        <SidebarContent />
      </aside>

      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" className="w-[280px] border-sidebar-border bg-sidebar p-0">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="md:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border/70 bg-background/85 px-4 backdrop-blur md:px-8">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="size-5" />
            </Button>
            <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <span className="hidden sm:inline">Workbench</span>
              <span className="hidden text-border sm:inline">/</span>
              <span className="text-foreground/80">{title}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden rounded border border-primary/20 bg-primary/[0.07] px-2 py-1 font-mono text-[9.5px] uppercase tracking-[0.1em] text-primary sm:inline">
              v0.1.0
            </span>
            <span className="max-w-[160px] truncate font-mono text-[10px] text-muted-foreground">
              {user?.email ?? "guest"}
            </span>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => {
                void signOut().then(() => navigate("/"));
              }}
            >
              <LogOut className="size-3.5" />
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl px-4 py-7 md:px-8 md:py-9">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
