# Mermaid SoT — 프로젝트 전체 단일 다이어그램 색인

> 🔴 **이 폴더 = 프로젝트를 관통하는 모든 구조 다이어그램의 단일 SoT.** 그림은 여기 `M-NNNN` 파일에 **단 한 번** 산다. 다른 문서(brief/spec/design/ledger/adr)는 mermaid 블록을 **복사하지 않고 아래 앵커로 링크**한다 — 한 곳만 고쳐도 전부 최신이고, 같은 그림의 모순(drift)이 구조적으로 불가능해진다.

## 규약 (변경 전 필독)

1. **ID가 파일을 소유** — 파일명 = `M-NNNN-<slug>.md`. `M-NNNN`는 **영구 불변**, slug 는 **생성 시 동결**.
   - 🔴 **rename·이동·삭제 금지.** 개념 이름이 바뀌어도 파일명은 그대로 두고 frontmatter `title` 과 이 색인만 갱신. superseded 도 제자리(격리 폴더 X) — 인바운드 링크 영구 보존.
2. **링크는 이 색인의 ID 앵커를 가리킨다** — 다른 문서는 `[그림 M-NNNN](…/mermaid/INDEX.md#M-NNNN)` 형식(파일 직접 아님). 파일을 실제로 옮겨야 하면 아래 표의 **그 한 줄만** 고치면 모든 인바운드 링크가 산다. heading 자동앵커는 제목 따라 깨지므로 `<a id="M-NNNN">` 명시 앵커 사용.
3. **supersede = frontmatter + 이 색인, 파일 이동 없음**:
   - **구조·모델 자체가 바뀜** → **새 `M-ID` 생성** · 새 파일 `supersedes:[구ID]` · 구 파일 `status: superseded`+`superseded_by`+상단 배너 · 아래 Supersede 체인 한 줄.
   - **부분 확장·정확도 보정** → 기존 `M-ID` **edit-in-place**(`status: living`, `updated` 갱신).
   - **이름만 더 좋아짐** → 아무것도 안 함(rename 금지, `title` 만).
4. **`/cling:kickoff` 마다** 그 이니셔티브의 구조 그림을 여기 만든다(신규 M-ID 또는 기존 확장). 산출 ID 를 brief/spec/ledger 가 참조. (규칙 SoT = `.cling/profile.md` `## Mermaid SoT`.)
5. **무결성** — 문서의 모든 `M-NNNN` 참조가 정확히 1개 파일로 해소돼야 한다. `scripts/mermaid-refs-check.sh`(drift-guard) 가 검증.

## 파일 frontmatter 규격

```yaml
---
id: M-NNNN
title: <사람이 읽는 제목>          # 여기만 갱신, 파일명은 불변
status: living | superseded
supersedes: []                    # 이 그림이 무효화한 과거 ID
superseded_by: null               # 나중에 채워짐 (링크는 안 깨짐)
sources: [<이 그림을 쓰는 prose 문서 경로>]
updated: YYYY-MM-DD
---
```

## 다이어그램 (Track/도메인 별)

> 상태: 🟢 living · ⚫ superseded. 앵커 = `INDEX.md#M-NNNN`.

<!-- 예:
<a id="M-0001"></a>
- **M-0001** — [<제목>](M-0001-<slug>.md) · 🟢 living
  - <한 줄 설명>
  - 소유 prose = <경로>
-->

<a id="M-0001"></a>
- **M-0001** — [project-manager 전체 아키텍처 — 순수 CORE + IO + CONTRACT + 어댑터](M-0001-gootte-architecture.md) · 🟢 living
  - 순수 CORE + IO 층 + CONTRACT(zod) → 얇은 어댑터. phase별 색칠 + ⓐ~ⓓ 예약.
  - 소유 prose = docs/roadmap/project-manager/{blueprint.md, lineage-engine/spec.md}

<a id="M-0002"></a>
- **M-0002** — [web-dashboard 2a — CORE → Hono API → React 데이터흐름](M-0002-web-dashboard-2a.md) · 🟢 living
  - M-0001 phase 2a 상세(sources: M-0001). backend=CORE 릴레이 · frontend=렌더 · TanStack Query.
  - 소유 prose = docs/roadmap/project-manager/web-dashboard/spec.md

<a id="M-0003"></a>
- **M-0003** — [web-viz 2c — CORE projection → viz endpoint → 커스텀 뷰](M-0003-web-viz-2c.md) · 🟢 living
  - M-0002 위 시각화 레이어(sources: M-0001·M-0002). buildKanban/buildGantt + lineage 재사용 → 신규 endpoint → 커스텀 SVG/CSS 뷰.
  - 소유 prose = docs/roadmap/project-manager/web-viz/spec.md

## Supersede 체인

> 체인당 한 줄: `M-000X ⚫→ M-000Y — <왜>`. (아직 없음)

## ID 대장 (다음 번호)

> kickoff/신규 시 여기서 다음 번호를 취득하고 즉시 예약(영구). 리넘버 금지.

- **다음 = M-0004**
