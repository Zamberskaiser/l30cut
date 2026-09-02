import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border-strong/60 px-4 py-6 text-center">
      {icon}
      <p className="text-xs font-medium">{title}</p>
      <p className="max-w-[22rem] text-[11px] leading-relaxed text-muted-foreground">
        {description}
      </p>
      {action}
    </div>
  );
}
