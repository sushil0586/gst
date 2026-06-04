import { cn } from "@/lib/utils";
import { statusColorClasses } from "@/design-system";

const variantClasses = {
  success: statusColorClasses.success,
  warning: statusColorClasses.warning,
  danger: statusColorClasses.danger,
  primary: statusColorClasses.info,
  neutral: statusColorClasses.neutral,
};

export function StatusBadge({
  label,
  variant = "neutral",
}: {
  label: string;
  variant?: keyof typeof variantClasses;
}) {
  return (
    <span
      className={cn(
        "status-pill",
        variantClasses[variant],
      )}
    >
      {label}
    </span>
  );
}
