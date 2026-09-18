# gootte v2 시간 기록 이관 프롬프트 (타 프로젝트용)

이 파일을 통째로 에이전트에게 붙여넣으면 된다. gootte 저장소에서 실증済(2026-09-18)의
순서 그대로다. **순서를 바꾸지 마라** — 기록→검증→정리→재검증이다.

## 전제

- `gootte` CLI는 npm 타볼 1개로 설치한다 (저장소 체크아웃·npx 불필요, `node`만 필요).
- 타볼 받기 (gootte 저장소에서): `code/web/cli` 로 가서 `npm pack` → 나온
  `gootte-cli-0.0.0.tgz` 1개가 전부다.

## 0. 준비 (이 프로젝트에서 실행)

```bash
cd <이-프로젝트-루트>          # docs/features + AGENTS.md 가 있는 곳
git status --short            # 전부 커밋돼 있어야 한다. 미커밋이 있으면 먼저 정리
npm i -g <타볼-경로>/gootte-cli-0.0.0.tgz
gootte migrate --dry-run <프로젝트-slug>   # slug = 프로젝트 폴더 basename
```

## 1. dry-run 검수 (눈으로 본다)

출력 `검사 S · 기록 M · 생략 K · 사본병합 C` + 티켓별 한 줄을 전부 읽는다.

- `기록 없음(레코드 생략, 미시작)` 티켓마다 캡틴에게 묻는다: (a) 아직 안 시작한 게 맞나 →
  그대로 둔다, (b) 이미 끝났는데 기록이 없나 → §2로, (c) 진행 중인데 기록이 없나 →
  `gootte start --at <대략-시각> <기능> <티켓>` 으로 지금 기록한다.
- 🔴 **시각을 지어내지 마라.** (b)의 완료 시각도 캡틴이 준 날짜만 쓴다.
  런타임에 가상 시간을 넣는 규칙은 없다 — 이 이관 때, 캡틴 확인된 티켓에만 손으로 찍는다.

## 2. 완료 칸 잔재 처리 (해당될 때만)

판(board) 완료 칸에 있는데 레코드가 없는 티켓 = §1-(b). 티켓마다 캡틴 확인 후:

```bash
gootte start --at <시작-대략> <기능> <티켓> && gootte end --at <완료-대략> <기능> <티켓>
```

티켓 인자는 `T03`·`03`·구관례 번호 다 된다(번들이 파일명으로 정규화한다).
`issues/` 티켓은 키가 파일 basename(예: `01-x`)으로 잡힌다 — dry-run 줄에서 확인한다.

## 3. 이관 실행 + 화면 검증

```bash
gootte migrate <프로젝트-slug>     # dry-run 과 같은 숫자가 나와야 한다
```

다음이 서로 일치하는지 확인한다 (어긋나면 중단하고 보고):

- `gootte status --working` / `gootte status --pending` (또는 대시보드 features 탭)
- 배지(`.gootte/state.json` 의 `openFeatures`) — 이관 전 "남은 카드" 인식과 같은 수인가
- 판(board) 완료 칸에 있어야 할 카드가 그대로 있는가

## 4. MD 줄 정리 (2-pass, fail-closed)

```bash
gootte migrate --dry-run --strip <프로젝트-slug>   # 지울 줄 전수 미리보기
```

`정리 예정 N줄(줄 a, b)` 을 **전부** 읽는다. 보장되는 것:

- 지우는 것은 펜스 밖 `Time:`/`Status:` 줄뿐이다. 펜스 안 예시·`**Blocked by:**` 는 살린다.
- 지울 줄에 값이 있는데 레코드에 백업이 없으면 **전체 거부**한다 (한 줄도 안 건드림).
  거부되면 손으로 고치지 말고 그대로 보고한다.

문제없으면 실행하고, 화면이 §3과 **바이트로 같은지** 재확인한다
(정리는 화면을 바꾸지 않아야 한다 — 바꾸면 중단하고 보고):

```bash
gootte migrate --strip <프로젝트-slug>
grep -rE '^[ \t]*(\*\*)?(Time|Status):' docs/features/*/tickets docs/features/*/issues || echo "잔여 없음"
gootte status --working   # §3 과 동일해야 한다
```

## 5. 커밋

```bash
git add -A && git status --short   # .gootte/state.json + 정리된 티켓만 있어야 한다
git commit -m "chore(ledger): 시간 기록 v2 이관 + MD Time:/Status: 줄 정리"
```

## 완료 조건

- [ ] `migrate --dry-run` 재실행 시 `기록 0` (삭제해도 잃을 값 없음은 매 실행 보장)
- [ ] 잔여 `Time:`/`Status:` grep 0건 (tickets/·issues/ — `spec.md` 는 대상 아님)
- [ ] 화면(작업중·배지·판)이 §3 = §4 로 동일
- [ ] `gootte start/end` 가 npx 없이 동작 (번들은 `node`만 쓴다)

## 막히면

- `정리 거부` 출력 → 손대지 말고 그 메시지 그대로 보고
- 화면이 §3≠§4 → 커밋하지 말고 보고 (`git checkout -- .` 로 정리 되돌리기 가능 — 레코드는 남는다)
- `프로젝트 없음` → 프로젝트 루트(AGENTS.md 있는 곳)에서 실행했는지 확인
