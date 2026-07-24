---
created: 2026-07-25
status: in_progress
priority: high
kind: single
todos: [010-plan-lineage-views]
worktree: plan-lineage-views
startedAt: 2026-07-25
related_sprints: [2026-07-25-frontend-scaffold]
---

# plan-lineage-views — 뷰 본체 (T4·T5)
> 단독. 1 worktree = 1 sprint. 009 셸의 MainPanel 플레이스홀더를 실제 뷰로 교체 → 2a 읽기전용 대시보드 완성.

## scope
- 010-plan-lineage-views (high) — plan 뷰(T4) + lineage 뷰(T5). MainPanel placeholder 대체.

## 🔴 Invariant 점검
- **INV-4 verbatim** — rationale "왜"(priorityBasis·delayCost·stoppingPoint) · lineage note · resolvedBy 를 **요약 없이 그대로** 렌더. 프론트 재계산/판정 X(kind·순서 = 서버 CORE 산출).
- **INV-1** — 서버상태 = TanStack Query 캐시만(usePlan/useLineage). 별 스토어 X.

## 작업 path (예상 phase)
### Phase 1 — plan 뷰 (T4)
- `usePlan(slug)` → `PlanItem[]` + `PlanRationale[]` 렌더.
- 리스트: `▶NOW` 마커(now) · 순서(order ①②③) · initiative · status · subSteps(들여쓰기 할일) · deps.
- 하단 "왜 이 순서": rationale — priorityBasis · delayCost(방치비용·git) · stoppingPoint(정지점). verbatim.
- wireframe 레이아웃 준수. NOW=accent 강조.

### Phase 2 — lineage 뷰 (T5)
- `useLineage(slug)` → `edges: LineageEdge[]` + `drops: DropRecord[]`.
- supersede 체인: `from → to` + ADR 배지(Tabler tag, edge.adr) + note verbatim(들여쓰기). `kind==='supersede-partial'` = 다른 색(--partial 토큰).
- drop: `todo → resolvedBy` verbatim. reference/dep/spawn kind 는 필터 또는 구분 표기.

### Phase 3 — 컴포넌트 분리
- `components/plan/PlanView.tsx`·`PlanItemRow.tsx`·`RationaleList.tsx` · `components/lineage/LineageView.tsx`·`SupersedeChain.tsx`·`DropList.tsx`. MainPanel 이 소비(placeholder 제거).

## 다음 단계 결정 필요
- 없음(spec·wireframe 이 닫음). 시각그래프/칸반/Gantt = 2c(non-goal).

## 완료 기준
- 010 완료: jinwooauto plan(15) 순서+왜 정확 렌더 · lineage(edges 65·drops 40) 체인+drop verbatim(요약 0, INV-4) · partial 색 구분 · vitest(PlanView·LineageView, mock query data).
- 전체 회귀: `pnpm verify`(tsc + vitest 41+) green.

## 사용자 테스트
> sprint plan-lineage-views 완료 기준 — worktree 안 검토용. (자동 게이트 `pnpm verify` = 제가 머지 전 실행, green 47/47 · vite build 75kb gzip.)

🌐 dev 서버 (user-runs)
```
GOOTTE_ROOTS=$HOME/Documents/ai pnpm dev   → localhost:5173
```

✅ 테스트 (브라우저, jinwooauto 선택)
- **plan 탭** — ▶NOW 마커 + ①②③ 순서로 15개 이니셔티브, subSteps(할일) 들여쓰기·deps 표시
- plan 하단 "── 왜 이 순서 ──" — priorityBasis·방치비용·정지점 verbatim(요약 없이 그대로)
- **lineage 탭** — supersede 체인 65(from→to·ADR 배지·note verbatim), 부분대체=다른 색, drop 40(todo→resolvedBy verbatim)
- 탭 전환/프로젝트 전환 시 각 뷰 정확 반영 · 테마 다크/라이트 둘 다 가독

## 관련 todo / spec
- [010-plan-lineage-views](../todo/010-plan-lineage-views.md) — plan+lineage 뷰 (T4·T5)
- [spec](../roadmap/project-manager/web-dashboard/spec.md) · [wireframe](../roadmap/project-manager/web-dashboard/wireframe.md) · [M-0002](../mermaid/INDEX.md#M-0002)
