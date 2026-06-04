import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  CheckCheck,
  CircleSlash,
  CopyCheck,
  FolderPlus,
  Eye,
  FilePenLine,
  Lock,
  LockOpen,
  PencilLine,
  Save,
  Send,
  ShieldCheck,
  ShieldMinus,
  RefreshCcw,
  Trash2,
  X,
  AlertOctagon,
  Sparkles,
} from "lucide-react";

import { cn } from "@/lib/utils";

const iconMap = {
  open: ArrowUpRight,
  view: Eye,
  review: Eye,
  edit: PencilLine,
  update: FilePenLine,
  delete: Trash2,
  lock: Lock,
  unlock: LockOpen,
  deactivate: ShieldMinus,
  approve: ShieldCheck,
  reject: CircleSlash,
  cancel: X,
  close: X,
  confirm: CheckCheck,
  save: Save,
  manage: Sparkles,
  create: FolderPlus,
  escalate: AlertOctagon,
  clear: CircleSlash,
  send: Send,
  complete: CopyCheck,
  dismiss: X,
  reprocess: RefreshCcw,
} satisfies Record<string, LucideIcon>;

export function ActionLabel({
  kind,
  label,
  icon: Icon,
  iconClassName,
  className,
}: {
  kind: keyof typeof iconMap;
  label?: string;
  icon?: LucideIcon;
  iconClassName?: string;
  className?: string;
}) {
  const ResolvedIcon = Icon ?? iconMap[kind];

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <ResolvedIcon className={cn("size-3.5", iconClassName)} />
      <span>{label ?? kind[0].toUpperCase() + kind.slice(1)}</span>
    </span>
  );
}
