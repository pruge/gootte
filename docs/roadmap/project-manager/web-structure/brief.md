# brief — web-structure (project-manager phase)

> 부모 epic = [blueprint](../blueprint.md). plan 탭 "보드" 슬롯을 **칸반 → 코드 구조 뷰**로 교체.
> 씨앗 = 사용자 논의 (2026-07-29): "roadmap 보다는 code 의 구조를 보여줘. roadmap 은 lineage 에서 시작하는데 그건 사실이 아니잖아."

## 문제
plan 탭의 **보드**(칸반 3파티션: 진행중/착수가능/선행대기)는 `deps` **개발 순서**를 그린다. 그런데 개발 순서(예: "lineage-engine 먼저")는 *언제 만들었나*지 *코드가 무엇 위에 서 있나*가 아니다 — 실제 뿌리는 `contract`(zod SoT)이고 `lineage` 는 `core` 안 projection 하나. roadmap 파생 그림은 코드의 **사실**을 오도한다. 또 칸반의 착수-준비도 정보는 이미 **리스트 뷰가 흡수**해 잘 보여주고 있어(중복).

## 의도
보드 슬롯 = 관리대상 프로젝트가 **직접 저작한 구조 다이어그램**(`docs/mermaid/` 의 `M-NNNN`)을 대시보드가 읽어 렌더. 사람이 유지하는 아키텍처 SoT(경계·불변식·의도까지 담김)를 그대로 보여줌 = "코드가 어떻게 구성됐나" 한 장. 리스트의 대분류(track)와 **동축**으로 그룹핑해, 리스트에서 track 을 훑던 감각 그대로 구조 그림을 훑는다.

## 라이프사이클
프로젝트가 `/cling:kickoff` 마다 `docs/mermaid/` 에 `M-NNNN` 을 저작(또는 확장) → gootte 는 **읽기 전용**(INV-2) 으로 그 폴더를 스캔·렌더. 그림 추가/supersede 는 프로젝트 쪽 사건, gootte 는 항상 현재 SoT 반영(INV-3).

## scope / phase 경계
- **IN**: `docs/mermaid/*.md` 읽기(core-io) → frontmatter 파싱 + ` ```mermaid ` 블록 추출 + track 파생 + 그룹/정렬(core, 순수) → `StructureResponse`(contract) → `/api/structure`(backend) → track 인덱스→클릭 포커스 렌더(frontend, 기존 `MermaidBlock` 재사용).
- **교체**: 칸반 제거 — `buildKanban` · `BoardView`/`BoardCard` · `useBoard` · `/api/board` · `BoardResponse`/`KanbanColumn`. (`partition.ts` 는 `buildPlan` 공유 → **보존**.) web-viz 부분 supersede(ADR-0003).
- **OUT (non-goal)**: 소스 import 자동추출(언어별 파서 — gootte non-goal) · 그림 노드 클릭→문서 이동(저작 노드는 이니셔티브가 아님) · 그림 편집(INV-2 read-only) · 그림 없는 프로젝트용 자동 아키텍처 생성.

## 재사용 map (Stage 0)
| 자산 | 재사용 |
|---|---|
| `frontend/components/common/MermaidBlock` | 렌더(lazy·테마·strict sanitize·실패 fallback) 그대로 |
| `core/parse/mermaid.ts` `parseMermaid` | frontmatter(id/title/status/supersedes/superseded_by) 파싱 — **`sources` 추가 파싱 필요** |
| `frontend/lib/track.ts` `groupByTrack` + 서버 `trackOrder` | 그룹핑·정렬(INV-4 verbatim) |
| core-io `load.ts`(repoPath·profile Tracks·initiatives) | 프로젝트 루트·track 어휘·이니셔티브 매핑 이미 로드 |
| `backend/app.ts` endpoint 패턴 · `frontend/lib/{api,query}.ts` | `/api/board`→`/api/structure` 스왑 지점 |
| `render.ts`(CORE 텍스트 산출 패턴) | `buildStructure` 를 같은 자리(순수 projection)에 |

## non-goal / future
- **future**: 그림 노드↔이니셔티브 연결(저작 규약이 성숙하면) · 그림 없는 프로젝트 자동 골격 · import 추출(다른 phase 로 분리 시).

## ADR 색인
- [ADR-0001](adr/0001-board-renders-authored-mermaid.md) — 보드 = 저작 `docs/mermaid/` 렌더(자동추출 X).
- [ADR-0002](adr/0002-track-from-sources-derivation.md) — track↔그림 연결을 `sources:`→이니셔티브→track 로 파생(frontmatter 에 track 필드 신설 X).
- [ADR-0003](adr/0003-replace-kanban-supersede-web-viz.md) — 칸반 완전 교체 + web-viz 부분 supersede(리스트가 준비도 흡수).

## 다이어그램
- 구조/데이터흐름 = [그림 M-0007](../../../mermaid/INDEX.md#M-0007).
