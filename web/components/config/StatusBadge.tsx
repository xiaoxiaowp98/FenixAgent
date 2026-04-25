import { cn } from "../../src/lib/utils";
import { Badge } from "../ui/badge";

interface StatusBadgeProps {
  status: string;
  colorMap?: Record<string, "default" | "secondary" | "destructive" | "outline">;
}

export function getBadgeVariant(status: string): string {
  const map: Record<string, string> = {
    configured: "green",
    enabled: "green",
    "已配置": "green",
    "已启用": "green",
    unconfigured: "secondary",
    disabled: "secondary",
    "未配置": "secondary",
    "已禁用": "secondary",
    builtIn: "blue",
    "内置": "blue",
    custom: "outline",
    "自定义": "outline",
  };
  return map[status] || "outline";
}

const variantMap: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  green: "default",
  secondary: "secondary",
  blue: "default",
  outline: "outline",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  const variant = getBadgeVariant(status);
  const badgeVariant = variantMap[variant] || "outline";
  return (
    <Badge variant={badgeVariant} className={cn(
      variant === "green" && "bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300",
      variant === "blue" && "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300",
    )}>
      {status}
    </Badge>
  );
}
