import { useState } from "react";
import { IconChevronRight, IconFolder, IconFile, IconListCheck } from "@tabler/icons-react";
import type { Feature, FeatureDocNode } from "@gootte/contract";
import { TicketRow } from "./TicketRow";

export type OpenDocFn = (featureSlug: string, path: string, trigger: HTMLElement) => void;

interface FeatureTreeProps {
  feature: Feature;
  onOpenDoc: OpenDocFn;
}

/** `adr` → `issues` → 나머지(spec.md 등 낱장) 순으로 고정한다(캡틴 지시). 없으면 그 자리가 빈다. */
function splitDocs(docs: Feature["docs"]) {
  const pick = (name: string) => docs.find((d) => d.kind === "dir" && d.name === name) ?? null;
  const adr = pick("adr");
  const issues = pick("issues");
  const rest = docs.filter((d) => d !== adr && d !== issues);
  return { adr, issues, rest };
}

/**
 * 기능 카드 안의 폴더 트리. `check` 는 실제 폴더가 아니라 화면이 만든 현황판 —
 * 파싱된 제목·원문 상태·처리중·대기 선행을 보여준다(예전 화면이 보여주던 것을 잃지 않는다).
 * 기본 펼침(캡틴 피드백 — issues 자리는 실제 파일 목록으로 남기고, 요약은 여기로 옮겼다).
 *
 * 순서는 **adr → issues → check → 나머지 낱장 문서**(spec.md 등) 로 고정한다(캡틴 지시) —
 * 없는 칸은 그 자리가 빈다(INV-4, 폴더에 없는 걸 그려 넣지 않는다).
 * `issues/` 도 `feature.docs` 에 포함돼 있어서 진짜 파일 이름으로 뜬다. 눌러서 원문을 읽는다.
 */
export function FeatureTree({ feature, onOpenDoc }: FeatureTreeProps) {
  const [checkOpen, setCheckOpen] = useState(true);
  const { adr, issues, rest } = splitDocs(feature.docs);

  return (
    <ul className="divide-y divide-border">
      {adr && <DocTreeNode node={adr} depth={0} featureSlug={feature.slug} onOpenDoc={onOpenDoc} />}
      {issues && <DocTreeNode node={issues} depth={0} featureSlug={feature.slug} onOpenDoc={onOpenDoc} />}
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
      {rest.map((node) => (
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
