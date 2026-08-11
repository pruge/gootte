import { IconBulb } from "@tabler/icons-react";
import type { OpinionRequest, OpinionTrigger } from "@gootte/contract";

interface AskOpinionPanelProps {
  /** 버튼이 뜰 자리 — 06 의 순수 함수가 매 읽기 계산한 것(INV-1), 저장하지 않는다. */
  triggers: readonly OpinionTrigger[];
  /** 이미 남긴 요청/답 — 처리·미처리 가리지 않고 함께 온다(gootte 가 저장한 것, INV-5). */
  requests: readonly OpinionRequest[];
  onAsk: (detail: string) => void;
  /** 방금 눌러 응답을 기다리는 중인 물음 — 재조회 전까지 버튼을 "보냈습니다" 로 보여준다. */
  sending: ReadonlySet<string>;
}

/**
 * 판단 요청(티켓 06) — **04 의 즉시 검사(`DragWarningBanner`)와 다른 자리**(spec §섞지 마라).
 * 저것은 기계가 아는 사실이라 그 자리에서 끝나고, 이것은 사람(planner)에게 가는 판단이다.
 * 채팅창이 아니다 — 한 물음에 한 답, 스레드 없음(spec §한 왕복만 그린다).
 */
export function AskOpinionPanel({ triggers, requests, onAsk, sending }: AskOpinionPanelProps) {
  if (triggers.length === 0 && requests.length === 0) return null;

  const askedQuestions = new Set(requests.map((r) => r.question));

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-accent/40 bg-accent/5 p-3">
      {triggers.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <span className="mono flex items-center gap-1.5 text-xs font-medium text-accent">
            <IconBulb size={14} /> 판단이 필요합니다 — 캡틴 의견을 청할 수 있습니다
          </span>
          <ul className="flex flex-col gap-1.5">
            {triggers.map((t) => {
              const alreadyAsked = askedQuestions.has(t.detail) || sending.has(t.detail);
              return (
                <li
                  key={`${t.kind}-${t.feature ?? ""}-${t.step ?? ""}-${t.detail}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-sm"
                >
                  <span className="min-w-0 flex-1">{t.detail}</span>
                  <button
                    type="button"
                    disabled={alreadyAsked}
                    onClick={() => onAsk(t.detail)}
                    className={`mono shrink-0 rounded-md border px-2.5 py-1 text-xs transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                      alreadyAsked
                        ? "cursor-default border-border bg-surface-2 text-muted"
                        : "border-accent/50 bg-accent/15 text-accent hover:bg-accent/25"
                    }`}
                  >
                    {alreadyAsked ? "보냈습니다" : "의견 물어보기"}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {requests.length > 0 && (
        <ul className="flex flex-col gap-1.5 border-t border-accent/20 pt-2">
          {requests.map((r) => (
            <li key={r.id} className="rounded-md border border-border bg-surface px-2.5 py-2 text-sm">
              <div className="mono text-xs text-muted">{r.question}</div>
              {r.answer ? (
                <div className="mt-1 whitespace-pre-wrap text-fg/90">
                  <span className="mono mr-2 text-xs text-accent">planner · {r.updatedAt}</span>
                  {r.answer}
                </div>
              ) : (
                <div className="mono mt-1 text-xs text-muted">답을 기다리는 중…</div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
