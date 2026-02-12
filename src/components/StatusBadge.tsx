import { Badge, type BadgeProps } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type StatusVariant = "ok" | "warning" | "error" | "info" | "neutral";

const variantMap: Record<StatusVariant, BadgeProps["variant"]> = {
  ok: "success",
  warning: "warning",
  error: "destructive",
  info: "info",
  neutral: "secondary",
};

interface StatusBadgeProps {
  text: string;
  variant?: StatusVariant;
  className?: string;
}

export function StatusBadge({
  text,
  variant = "neutral",
  className,
}: StatusBadgeProps) {
  return (
    <Badge variant={variantMap[variant]} className={cn("text-xs", className)}>
      {text}
    </Badge>
  );
}
