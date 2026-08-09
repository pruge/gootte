# docs — 이 저장소의 문서 지도

> 이 저장소 문서가 어디에·왜 있는지의 지도. 새 문서를 만들기 전에 여기서 위치를 정한다.
> 여기 있는 것은 **작업 표면 하나**(`features/`)와 **작업자용 관례 하나**(`agents/`)뿐이다.

저장소 전체에 걸리는 지침은 문서가 아니라 루트 [`AGENTS.md`](../AGENTS.md) 가 갖는다
(`CLAUDE.md` 는 그 심링크). 제품 불변식·verify gate·실행 명령을 찾는다면 거기가 먼저다.

## 두 폴더

| 폴더 | 무엇 | 성질 |
|---|---|---|
| [`features/`](features/) | **작업 표면** — 기능별 사양(`spec.md`)과 티켓(`issues/NN-*.md`)과 결정(`adr/`) | 살아 있음 — 상태가 여기서 바뀐다 |
| [`agents/`](agents/) | **작업자용 관례** — 티켓 서식·`Status:` 어휘·탐색 순서, 그리고 한국어 개념어 → 영문 코드 앵커 사전 | 살아 있음 — 규약의 SoT |

### `features/<기능-slug>/`

```
docs/features/<기능-slug>/
├── spec.md              ← spec 1개 = 파일 1개
├── issues/NN-<slug>.md  ← 티켓당 파일 1개. 의존 순서로 01 부터
└── adr/NNNN-<slug>.md   ← 그 기능에 속한 결정 기록
```

**별도 원장은 없다.** 상태는 티켓의 `Status:` 줄이, 순서는 `Blocked by:` 줄이 소유하고,
다음 할 일(frontier)은 적어 두는 것이 아니라 그 두 줄에서 계산된다 —
규약 전문은 [`agents/issue-tracker.md`](agents/issue-tracker.md).

### `agents/`

| 파일 | 답하는 질문 |
|---|---|
| [`domain.md`](agents/domain.md) | 이 저장소를 탐색하기 전에 무엇을 어떤 순서로 읽나 · 여섯 컨텍스트 |
| [`issue-tracker.md`](agents/issue-tracker.md) | spec·티켓을 어떤 레이아웃으로 쓰나 · `Blocked by:` 의 의미 |
| [`triage-labels.md`](agents/triage-labels.md) | 정규 `Status:` 여덟 값과 서식 |
| [`codegraph/`](agents/codegraph/) | 한국어 개념어에서 출발할 때 어떤 영문 심볼을 찾나 |

## 새 문서는 어디에?

**기능에 속하면 그 기능 폴더(`features/<기능-slug>/`)에, 작업 방식에 대한 것이면 `agents/` 에,
저장소 전체에 걸리는 지침이면 문서가 아니라 [`AGENTS.md`](../AGENTS.md) 에 쓴다** —
어느 것도 아니라면 아직 문서가 아니라 티켓이다.

세부 배치 규칙(어느 기능 폴더인지, ADR 을 새로 쓸지 옛 파일을 고칠지)은
[`agents/domain.md`](agents/domain.md) §쓰기 규칙이 SoT 다.

---

`mermaid/` 는 은퇴한 표면이다 — 제품 표면과 함께 걷어내는 중이며
(`features/firstmate-migration/issues/04-remove-mermaid.md`), 새로 쓰지 않는다.
