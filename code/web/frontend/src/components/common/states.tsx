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
