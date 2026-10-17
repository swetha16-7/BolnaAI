import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const statusStyles: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700 border-emerald-200",
  busy: "bg-amber-100 text-amber-700 border-amber-200",
  idle: "bg-slate-100 text-slate-600 border-slate-200",
  converted: "bg-emerald-100 text-emerald-700 border-emerald-200",
  resolved: "bg-blue-100 text-blue-700 border-blue-200",
  booked: "bg-indigo-100 text-indigo-700 border-indigo-200",
  qualified: "bg-purple-100 text-purple-700 border-purple-200",
  hot: "bg-red-100 text-red-700 border-red-200",
  warm: "bg-amber-100 text-amber-700 border-amber-200",
  cold: "bg-blue-100 text-blue-700 border-blue-200",
  confirmed: "bg-emerald-100 text-emerald-700 border-emerald-200",
  pending: "bg-amber-100 text-amber-700 border-amber-200",
  high: "bg-red-100 text-red-700 border-red-200",
  medium: "bg-amber-100 text-amber-700 border-amber-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const key = status.toLowerCase();
  return (
    <Badge
      variant="outline"
      className={cn(
        "capitalize font-medium",
        statusStyles[key] ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      {status}
    </Badge>
  );
}
