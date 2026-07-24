# brief — lineage-engine (project-manager phase 1)

> blueprint 종속 phase. **전체 비전·재사용 구조·공유 seam·불변식 = [../blueprint.md](../blueprint.md)**(SoT).
> 씨앗 = [discovery](../../../_memo/discovery-rekickoff-lineage.md).

## 이 phase
blueprint phase 1 = **순수 CORE + core-io + CONTRACT + CLI + digest + agent-skill.** 소비자 = AI/터미널. 검증 = jinwooauto.
**산출 = `gootte plan jinwooauto` → 개발해야 할 순서(full) + 왜 텍스트 + digest 파일.**

## blueprint 에서 소비 (재정의 X)
- **Contract seam** — `Project·Initiative·TodoItem·LineageNode/Edge·KickoffEvent·GitSignal·PlanItem·PlanRationale·Digest`. phase 1 T1 이 **최초 스캐폴드**.
- **INV-1/2/3**(B4 carve-out) · **CORE/IO 분리**(B3) · **기록계약 하이브리드**(구조화 읽고 없으면 산문 fallback) · **M-0001**.

## 이 phase 고유 결정 (net-new — algorithm)
- **B1** GitSignal.conflictRisk = `git merge-tree` dry-run
- **B2** plan ordering = 3-분할(active/ready/blocked) 랭킹
- CORE(순수) / core-io(IO) 파일 경계

## non-goal (phase 1)
웹 · watcher push · Android · notify · report · distributed · 학습 — 전부 후속 phase(blueprint 로드맵).

## reuse map
기존 cling 스키마(ledger/ADR/mermaid/INDEX/todo) 파싱 — blueprint §reuse map. 새 포맷 발명 X.

## ADR 색인
- **ADR-0001** 재사용 spine 채택 — 순수 CORE / IO 분리 (blueprint B3 구현)
- **ADR-0002** plan+rationale 1급 산출물 — B1(conflictRisk=git merge-tree)·B2(3-분할 ordering)·trigger 하이브리드
- **ADR-0003** AI-access = herdr agent-skill (CLI+SKILL.md+digest, MCP 아님)
- **ADR-0004** 기록계약 하이브리드 — blueprint external-writer seam 소비(구조화+산문 fallback)
- **ADR-0005** 관찰 전용 + 제어 seam 예약
