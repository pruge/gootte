# 03 — cling 문서 트리 삭제

**What to build:** 은퇴한 워크플로우가 만들어 놓고 아무도 갱신하지 않는 문서 트리를 걷어낸다.
`docs/roadmap` `docs/todo` `docs/sprint` 113개 파일과, cling 레이아웃을 설명하는 `docs/README.md` 다.
그 자리에 firstmate 문서 지도를 새로 놓는다.

**Blocked by:** 01

**Status:** ready-for-agent

## 완료 시 시연 가능한 것

작업자가 `docs/` 를 열면 **지금 유효한 것만** 보인다 — `features/` 와 `agents/`.
"이 roadmap 이 아직 사는 문서인가" 를 판단할 일이 없어진다.

## 완료 조건

- `docs/roadmap` (52파일) · `docs/todo` (37파일) · `docs/sprint` (24파일) 이 없다.
- `docs/README.md` 가 cling 3그룹 IA 맵이 아니라 **이 저장소의 현재 문서 지도**다 —
  `features/` 는 사양과 티켓, `agents/` 는 작업자용 관례와 사전. 새 문서를 어디에 놓는지도 한 줄로.
- `pnpm verify` green.
  🔴 **영향이 없을 것으로 예측된다** — 저장소 자신의 `docs/` 는 테스트 픽스처가 아니고,
  테스트는 전부 임시 디렉토리에 자기 자료를 만들어 쓴다. **결과가 다르면 그 예측이 틀린 것이므로
  삭제를 계속하지 말고 멈추고 보고한다.**
- `git grep -rn cling -- . ':!code'` 의 잔량이 예상 집합과 정확히 일치한다 —
  이 시점에 남아 있어야 하는 것은 `.cling/profile.md`(티켓 06 이 지운다)와
  `scripts/mermaid-refs-check.sh`(티켓 04 가 지운다)뿐이다.

## 테스트

새로 만들지 않는다. **기존 전체 검증(`pnpm verify`)이 회귀 감시자**이고, 이 티켓에서 그것이
green 을 유지한다는 사실 자체가 "저장소 문서는 제품 입력이 아니다" 라는 예측의 확인이다.

## 이 티켓이 하지 않는 것

- `docs/mermaid` 삭제 — 티켓 04 가 제품 표면까지 함께 걷어낸다.
- `.cling/` 삭제 — 티켓 06. 순서가 있다.
- 삭제한 문서의 내용을 어디로 옮기기. **옮기지 않는다.** 유지할 지식은 이미 티켓 01 이
  `AGENTS.md` 로 가져갔고, 나머지는 캡틴이 삭제로 결정했다.
- `~/.cling/ports` 레지스트리 정리 — 다른 프로젝트가 아직 쓴다.
