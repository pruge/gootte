import { IconLoader2 } from "@tabler/icons-react";

export function Loading({ label = "로드 중…" }: { label?: string }) {
  return (
    <p className="flex items-center gap-2 text-base text-muted">
      <IconLoader2 size={18} className="animate-spin" /> {label}
    </p>
  );
}

export function ErrorMsg({ error }: { error: unknown }) {
  return (
    <p role="alert" className="text-base text-drop">
      {error instanceof Error ? error.message : "로드 실패"}
    </p>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-base text-muted">{children}</p>;
}

/** 이니셔티브 상태 칩 — active/now 계열만 accent, 나머지 muted. semantic 색(장식 아님). */
export function StatusChip({ status }: { status: string }) {
  const hot = status === "active" || status === "in_progress";
  return (
    <span
      className={`mono rounded px-1.5 py-0.5 text-sm ${
        hot ? "bg-accent/15 text-accent" : "bg-surface-2 text-muted"
      }`}
    >
      {status}
    </span>
  );
}
