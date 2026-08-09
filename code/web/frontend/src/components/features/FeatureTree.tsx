import { useState } from "react";
import { IconChevronRight, IconFolder, IconFile } from "@tabler/icons-react";
import type { Feature, FeatureDocNode } from "@gootte/contract";
import { TicketRow } from "./TicketRow";

export type OpenDocFn = (featureSlug: string, path: string, trigger: HTMLElement) => void;

interface FeatureTreeProps {
  feature: Feature;
  onOpenDoc: OpenDocFn;
}

/**
 * 기능 카드 안의 폴더 트리 — `issues` 는 진입점으로 고정, 기본 펼침(티켓 01 §설계 2·3).
 * 그 아래는 폴더에 **실제로 있는 것만**(INV-4) — `adr/` 가 있으면 뜨고 없으면 안 뜬다.
 * 티켓 줄은 기존 화면(원문 상태·처리중·대기 → 선행·착수 가능)을 그대로 잃지 않는다 — 파일 이름만
 * 남기지 않는다.
 */
export function FeatureTree({ feature, onOpenDoc }: FeatureTreeProps) {
  const [issuesOpen, setIssuesOpen] = useState(true);

  return (
    <ul className="divide-y divide-border">
      <li>
        <button
          type="button"
          aria-expanded={issuesOpen}
          onClick={() => setIssuesOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-sm font-medium text-muted hover:bg-surface-2/60"
        >
          <IconChevronRight
            size={14}
            className={`shrink-0 transition-transform ${issuesOpen ? "rotate-90" : ""}`}
          />
          <IconFolder size={15} className="shrink-0" />
          issues
        </button>
        {issuesOpen &&
          (feature.tickets.length === 0 ? (
            <p className="px-4 py-3 pl-9 text-base text-muted">티켓이 없습니다.</p>
          ) : (
            <ul className="divide-y divide-border border-t border-border/60">
              {feature.tickets.map((t) => (
                <TicketRow key={t.slug} ticket={t} />
              ))}
            </ul>
          ))}
      </li>
      {feature.docs.map((node) => (
        <DocTreeNode
          key={node.path}
          node={node}
          depth={0}
          featureSlug={feature.slug}
          onOpenDoc={onOpenDoc}
        />
      ))}
    </ul>
  );
}

function DocTreeNode({
  node,
  depth,
  featureSlug,
  onOpenDoc,
}: {
  node: FeatureDocNode;
  depth: number;
  featureSlug: string;
  onOpenDoc: OpenDocFn;
}) {
  const [open, setOpen] = useState(false);
  const indent = { paddingLeft: `${1 + depth * 1.25}rem` };

  if (node.kind === "dir") {
    return (
      <li>
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          style={indent}
          className="flex w-full items-center gap-1.5 py-2 pr-4 text-left text-sm font-medium text-muted hover:bg-surface-2/60"
        >
          <IconChevronRight size={14} className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          <IconFolder size={15} className="shrink-0" />
          {node.name}
        </button>
        {open && (
          <ul className="divide-y divide-border border-t border-border/60">
            {(node.children ?? []).map((child) => (
              <DocTreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                featureSlug={featureSlug}
                onOpenDoc={onOpenDoc}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  return (
    <li>
      <button
        type="button"
        style={indent}
        onClick={(e) => onOpenDoc(featureSlug, node.path, e.currentTarget)}
        className="flex w-full items-center gap-1.5 py-2 pr-4 text-left text-sm text-fg hover:bg-surface-2/60"
      >
        <IconFile size={15} className="shrink-0 text-muted" />
        {node.name}
      </button>
    </li>
  );
}
