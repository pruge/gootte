import { useState } from "react";
import {
  IconChevronRight,
  IconFolder,
  IconFile,
  IconListCheck,
} from "@tabler/icons-react";
import type { Feature, FeatureConflict, FeatureDocNode } from "@gootte/contract";
import { ConflictBadge } from "./ConflictBadge";
import { TicketRow } from "./TicketRow";
import { TICKET_LIST_DEPTH, treeIndentStyle } from "../../lib/tree-indent";
import { triggerKey } from "./docTrigger";

export type OpenDocFn = (
  featureSlug: string,
  path: string,
  trigger: HTMLElement,
) => void;

interface FeatureTreeProps {
  feature: Feature;
  onOpenDoc: OpenDocFn;
  /** 검색어 — 티켓 제목에 걸린 자리를 노란 칩으로 보여준다(a-long-list-stays-usable/01). */
  query?: string;
}

/**
 * `adr` → `issues` → `tickets`(T04 신관례) → 나머지(spec.md·grill.md·design/·wayfinder.md 등
 * 낱장) 순으로 고정한다(캡틴 지시 + T04). 없으면 그 자리가 빈다.
 */
function splitDocs(docs: Feature["docs"]) {
  const pick = (name: string) =>
    docs.find((d) => d.kind === "dir" && d.name === name) ?? null;
  const adr = pick("adr");
  const issues = pick("issues");
  const tickets = pick("tickets");
  const rest = docs.filter((d) => d !== adr && d !== issues && d !== tickets);
  return { adr, issues, tickets, rest };
}

/**
 * `issues/`·`tickets/` 안에서 티켓(.md)이 아닌 것 — 하위 폴더거나 `.md` 가 아닌 파일. 감추지
 * 않고 목록 끝에 그대로 띄운다(INV-4, feature-doc-browser/04 §숨기지 않는다). `.md` 판정은
 * core-io 의 티켓 필터(`core-io/src/features.ts`)와 같은 규칙(대소문자 무시)이어야
 * 1:1 이 어긋나지 않는다.
 */
function nonTicketEntries(dir: FeatureDocNode | null): FeatureDocNode[] {
  if (!dir) return [];
  return (dir.children ?? []).filter(
    (c) => !(c.kind === "file" && c.name.toLowerCase().endsWith(".md")),
  );
}

/**
 * 기능 카드 안의 폴더 트리. `issues` 칸 하나가 **파일 이름과 파싱된 값을 함께** 보여준다 —
 * 번호·제목·원문 상태·단계·완료일·막힘·작업 가지(예전 "check" 가 보여주던 전부)에 더해
 * 누르면 그 티켓 원문이 드로어로 열린다(feature-doc-browser/04, 캡틴 지시 2026-08-12).
 * `issues/` 안에 티켓이 아닌 파일이 있으면 목록 끝에 파일 이름만 한 줄로 띄운다(같은 지시).
 * 기본 펼침(캡틴 피드백 — 예전 "check" 와 같다).
 *
 * 순서는 **adr → issues → 나머지 낱장 문서**(spec.md 등) 로 고정한다(캡틴 지시) —
 * 없는 칸은 그 자리가 빈다(INV-4, 폴더에 없는 걸 그려 넣지 않는다).
 */
export function FeatureTree({
  feature,
  onOpenDoc,
  query = "",
}: FeatureTreeProps) {
  const [issuesOpen, setIssuesOpen] = useState(true);
  const [ticketsOpen, setTicketsOpen] = useState(true);
  const { adr, issues, tickets, rest } = splitDocs(feature.docs);
  const issuesExtras = nonTicketEntries(issues);
  const ticketsExtras = nonTicketEntries(tickets);
  const newTickets = feature.newTickets ?? [];
  // T03 — 갈라진 파일 경로 → 그 사실(어느 사본들인지). 파일 줄이 이 경로와 맞으면 갈라짐
  // 표시를 낸다(기능 수준 배지는 FeatureCard 가 이미 낸다, 여기는 어느 파일인지 짚는 자리).
  const conflictByPath = new Map<string, FeatureConflict>(
    (feature.conflict ?? []).map((c) => [c.path, c]),
  );

  return (
    <ul className="divide-y divide-border">
      {adr && (
        <DocTreeNode
          node={adr}
          depth={0}
          featureSlug={feature.slug}
          onOpenDoc={onOpenDoc}
          conflictByPath={conflictByPath}
        />
      )}
      {/* `issues/` 구관례 — 실재할 때만 칸을 낸다(INV-4, tickets 칸과 같은 규칙). 신관례만 쓰는
          기능에 빈 issues 칸(그 안의 "티켓이 없습니다.")이 붙던 결함(캡틴 지적)을 막는다. */}
      {issues && (
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
            <IconListCheck size={15} className="shrink-0" />
            issues
          </button>
          {issuesOpen &&
            (feature.tickets.length === 0 && issuesExtras.length === 0 ? (
              <p
                style={treeIndentStyle(TICKET_LIST_DEPTH)}
                className="py-3 pr-4 text-base text-muted"
              >
                티켓이 없습니다.
              </p>
            ) : (
              <ul className="divide-y divide-border border-t border-border/60">
                {feature.tickets.map((t) => (
                  <TicketRow
                    key={t.slug}
                    ticket={t}
                    featureSlug={feature.slug}
                    onOpenDoc={onOpenDoc}
                    query={query}
                    conflict={conflictByPath.get(t.path)}
                  />
                ))}
                {issuesExtras.map((node) => (
                  <DocTreeNode
                    key={node.path}
                    node={node}
                    depth={TICKET_LIST_DEPTH}
                    featureSlug={feature.slug}
                    onOpenDoc={onOpenDoc}
                    conflictByPath={conflictByPath}
                  />
                ))}
              </ul>
            ))}
        </li>
      )}
      {/* `tickets/` 신관례(T04) — 실재할 때만 칸을 낸다(INV-4). 빈 칸을 늘 그리지 않는다. */}
      {tickets && (
        <li>
          <button
            type="button"
            aria-expanded={ticketsOpen}
            onClick={() => setTicketsOpen((v) => !v)}
            className="flex w-full items-center gap-1.5 px-4 py-2 text-left text-sm font-medium text-muted hover:bg-surface-2/60"
          >
            <IconChevronRight
              size={14}
              className={`shrink-0 transition-transform ${ticketsOpen ? "rotate-90" : ""}`}
            />
            <IconListCheck size={15} className="shrink-0" />
            tickets
          </button>
          {ticketsOpen && (
            <ul className="divide-y divide-border border-t border-border/60">
              {newTickets.map((t) => (
                <TicketRow
                  key={t.slug}
                  ticket={t}
                  featureSlug={feature.slug}
                  onOpenDoc={onOpenDoc}
                  query={query}
                  conflict={conflictByPath.get(t.path)}
                />
              ))}
              {ticketsExtras.map((node) => (
                <DocTreeNode
                  key={node.path}
                  node={node}
                  depth={TICKET_LIST_DEPTH}
                  featureSlug={feature.slug}
                  onOpenDoc={onOpenDoc}
                  conflictByPath={conflictByPath}
                />
              ))}
            </ul>
          )}
        </li>
      )}
      {rest.map((node) => (
        <DocTreeNode
          key={node.path}
          node={node}
          depth={0}
          featureSlug={feature.slug}
          onOpenDoc={onOpenDoc}
          conflictByPath={conflictByPath}
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
  conflictByPath,
}: {
  node: FeatureDocNode;
  depth: number;
  featureSlug: string;
  onOpenDoc: OpenDocFn;
  /** T03 — 갈라진 파일 경로 → 그 사실(어느 사본들인지). `dir` 는 자식에게 그대로 물려준다. */
  conflictByPath: ReadonlyMap<string, FeatureConflict>;
}) {
  const [open, setOpen] = useState(false);
  const indent = treeIndentStyle(depth);

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
          <IconChevronRight
            size={14}
            className={`shrink-0 transition-transform ${open ? "rotate-90" : ""}`}
          />
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
                conflictByPath={conflictByPath}
              />
            ))}
          </ul>
        )}
      </li>
    );
  }

  const conflict = conflictByPath.get(node.path);

  return (
    <li>
      <button
        type="button"
        style={indent}
        data-doc-trigger={triggerKey({ featureSlug, path: node.path })}
        onClick={(e) => onOpenDoc(featureSlug, node.path, e.currentTarget)}
        className="flex w-full items-center gap-1.5 py-2 pr-4 text-left text-sm text-fg hover:bg-surface-2/60"
      >
        <IconFile size={15} className="shrink-0 text-muted" />
        {node.name}
        {conflict && <ConflictBadge conflicts={[conflict]} />}
      </button>
    </li>
  );
}
