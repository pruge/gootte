import { useState } from "react";
import { IconChevronRight, IconFolder, IconFile, IconListCheck } from "@tabler/icons-react";
import type { Feature, FeatureDocNode } from "@gootte/contract";
import { TicketRow } from "./TicketRow";

export type OpenDocFn = (featureSlug: string, path: string, trigger: HTMLElement) => void;

interface FeatureTreeProps {
  feature: Feature;
  onOpenDoc: OpenDocFn;
}

/**
 * 기능 카드 안의 폴더 트리. `check` 는 실제 폴더가 아니라 화면이 만든 현황판 —
 * 파싱된 제목·원문 상태·처리중·대기 선행을 보여준다(예전 화면이 보여주던 것을 잃지 않는다).
 * 진입점으로 고정, 기본 펼침(캡틴 피드백 — issues 자리는 실제 파일 목록으로 남기고, 요약은
 * 여기로 옮겼다).
 *
 * 그 아래는 `feature.docs` — 기능 폴더에 **실제로 있는 것만**(INV-4), `issues/` 도 포함해서
 * 진짜 파일 이름으로 뜬다. 눌러서 원문을 그대로 읽을 수 있다.
 */
export function FeatureTree({ feature, onOpenDoc }: FeatureTreeProps) {
  const [checkOpen, setCheckOpen] = useState(true);

  return (
    <ul className="divide-y divide-border">
      <li>
        <button
          type="button"
          aria-expanded={checkOpen}
          onClick={() => setCheckOpen((v) => !v)}
          className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-sm font-medium text-muted hover:bg-surface-2/60"
        >
          <IconChevronRight
            size={14}
            className={`shrink-0 transition-transform ${checkOpen ? "rotate-90" : ""}`}
          />
          <IconListCheck size={15} className="shrink-0" />
          check
        </button>
        {checkOpen &&
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
