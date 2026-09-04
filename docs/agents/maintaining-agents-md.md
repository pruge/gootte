# `AGENTS.md` 를 고칠 때

> 이 문서는 **`AGENTS.md` 자신을 고칠 때만** 필요하다. 그래서 본문에서 떼어 여기 둔다 —
> 매 요청에 실리는 자리에 "이 파일 고치는 법" 이 앉아 있을 이유가 없다
> (2026-09-04, agent-docs-diet). 규칙 자체는 한 글자도 바꾸지 않았다.

이 파일이 지침의 **유일한 실파일**이다 — `CLAUDE.md` 는 `@AGENTS.md` 임포트로 이 파일을 가리키는 스텁 파일이다.
지침을 고칠 때는 항상 `AGENTS.md` 를 고치고, `CLAUDE.md` 를 실파일로 되돌리지 않는다.

### 이 문서의 구조

절의 순서가 곧 **읽는 순서**이고, 각 절은 답하는 질문이 하나씩이다. 새 지식은 지어내지 말고 아래 중
해당하는 절에 넣는다.

| 절 | 답하는 질문 | 여기 들어가는 것 / 안 들어가는 것 |
|---|---|---|
| 머리말 | 이 제품은 무엇인가 | 한 문단. 아키텍처 서술은 `docs/agents/domain.md` 로 |
| 제품 불변식 | 무엇을 어기면 안 되는가 | 번호가 붙은 항구적 규칙만. **번호는 재사용·리넘버하지 않는다** |
| Verify gate | 무엇이 "완료" 인가 | 컴포넌트별 검증 수단. 개별 테스트 작성법은 코드가 SoT |
| Contract | 공유 타입은 어디서 오는가 | SoT 위치와 drift-guard. 타입 목록 자체는 코드가 SoT |
| 프론트엔드 하드룰 | 무엇을 임의로 못 고르는가 | 선택 금지 항목만. 컴포넌트 관례는 코드가 SoT |
| Track 어휘 | 그 어휘가 왜 없는가 | 은퇴 사실과 대체물(기능 폴더 · `Blocked by:`)만. 되살릴 일이 생기면 새 결정이다 |
| 실행 명령 | 어떻게 돌리는가 | 루트 명령과 누가 돌리는지. 세부 인자는 `package.json` 이 SoT |
| 구조 파악 | 코드를 어떻게 찾는가 | 도구와 그 함정 |
| 문서 관례 | 문서를 어디에 쓰는가 | `docs/agents/` 로 가는 포인터만. 규약 본문은 그쪽이 SoT |
| 운영 규칙 | 어떻게 일하는가 | 세션 단위 행동 규율 |

### 항목을 추가·수정하는 절차

1. **먼저 물어본다: 코드나 명령이 이미 보여주는 것인가?** 그렇다면 여기 적지 말고
   **권위 있는 파일·명령을 가리킨다.** 복사한 사실은 반드시 낡는다.
2. **어느 절인지 위 표에서 고른다.** 어디에도 안 맞으면 새 절을 만들되, 그 줄을 위 표에도 추가한다.
   (표에 없는 절은 다음 사람이 구조를 코드에서 역추적하게 만든다.)
3. **문서 관례·탐색 순서·티켓 서식은 여기 쓰지 않는다** — `docs/agents/` 의 해당 파일에 쓰고
   여기서는 한 줄로 가리킨다.
4. **불변식을 추가할 때는 다음 번호를 새로 딴다.** 폐기해도 번호 슬롯은 남기고(링크 보존),
   본문에 무엇으로 대체됐는지 적는다.
5. **덧붙이기보다 고쳐 쓰거나 지운다.** 같은 사실이 두 절에 있으면 그 순간부터 둘 중 하나는 거짓이다.
6. 실측한 사실을 적을 때는 **무엇으로 확인했는지**(파일 경로나 명령)를 함께 적는다.

Keep this file for knowledge useful to almost every future agent session in this project.
Do not repeat what the codebase already shows; point to the authoritative file or command instead.
Prefer rewriting or pruning existing entries over appending new ones.
When updating this file, preserve this bar for all agents and keep entries concise.
