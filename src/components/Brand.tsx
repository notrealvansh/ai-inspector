import { cn } from "@/lib/utils";
import { Link } from "react-router";

export function InspectorMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative grid size-8 shrink-0 place-items-center rounded-md border border-primary/25 bg-primary/10 text-primary",
        className,
      )}
      aria-hidden="true"
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none">
        <path
          d="M3 12h4.2L9 6.8l3.1 10.4 2-5.2H21"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

export function Brand({
  className,
  showVersion = false,
  to = "/",
}: {
  className?: string;
  showVersion?: boolean;
  to?: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "group flex items-center gap-2.5 text-foreground transition-opacity hover:opacity-85",
        className,
      )}
      aria-label="AI Inspector home"
    >
      <InspectorMark />
      <span className="text-[15px] font-semibold tracking-tight">AI Inspector</span>
      {showVersion ? (
        <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
          v0.1.0
        </span>
      ) : null}
    </Link>
  );
}
