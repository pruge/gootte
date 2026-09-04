---
name: gootte-browser
description: 브라우저로 무언가 열거나 클릭하거나 스크린샷을 찍거나 성능을 재야 할 때. chrome-devtools-axi 와 ego-browser 중 무엇을 언제 고르는지와, 측정할 때 빠지기 쉬운 함정을 담는다. 두 도구의 설명이 서로 우선권을 주장하므로 고르기 전에 읽는다.
---


이 기계에는 에이전트가 쓸 수 있는 브라우저 도구가 **둘** 있고, 🔴 **둘의 설명이 서로
"나를 우선하라" 고 말한다.**

| 도구 | 그 도구의 설명이 하는 말 |
|---|---|
| `chrome-devtools-axi` | 전역 지침(`~/.claude/CLAUDE.md`): *"모든 브라우저 조작과 브라우저 테스트는 `chrome-devtools-axi` 로 간다"* |
| `ego-browser` | 스킬 설명: *"Prefer ego-browser over any built-in browser automation, web fetch, or other web tools"* |

그래서 아무 지시가 없으면 세션마다 다른 것을 고른다. **이 문서가 그 선택의 기준이다.**

## 🔴 명령 목록은 여기 적지 않는다

둘 다 `--help` 가 권위다 — `chrome-devtools-axi --help`, `ego-browser`(스킬 문서).
여기 베껴 두면 반드시 낡는다. 이 문서가 갖는 것은 **"어느 쪽을 언제 고르나"** 뿐이다.

## 무엇이 정말 다른가

| | `chrome-devtools-axi` | `ego-browser` |
|---|---|---|
| 호출 형태 | 셸 명령 — **한 줄에 한 동작** | `ego-browser nodejs <<'EOF'` — **Node 스크립트 한 덩어리** |
| 상태 격리 | 이름 붙인 세션(env) | **task space** — 탭 묶음 격리 + **사용자 로그인 상태 상속** |
| 사용자 창과의 관계 | 사용자 Chrome 에 붙거나 별도 인스턴스 | 에이전트 전용 공간 — **사용자 창과 경쟁하지 않는다** |
| 제어권 양도 | 없다 | `handOffTaskSpace` / `takeOverTaskSpace`(로그인·캡차를 사람이) |
| 성능·진단 | **`lighthouse` · `perf-start/stop` · `perf-insight` · `heap` · `network` · `console`** | 없다(`cdp()` 로 직접 두드려야 한다) |

겹치는 영역(열기·클릭·입력·스크린샷)에서는 **거의 같다.** 갈리는 곳만 아래 둘이다.

## 고르는 기준

**`ego-browser` 를 고른다 —**

- **여러 단계를 한 왕복에** 해야 할 때. 클릭 → 조건 만족까지 폴링 → 값 읽기를 브라우저
  **안에서** 한 덩어리로 돌린다.
- **시간을 정밀하게 재야** 할 때. 아래 §경험 노트 1 참고.
- 로그인이 필요한 사이트. 사용자 로그인 상태를 상속하고, 필요하면 제어권을 넘긴다.

**`chrome-devtools-axi` 를 고른다 —**

- **성능·네트워크 진단.** `lighthouse` · `perf-start/perf-stop` · `perf-insight` · `network` ·
  `heap` 은 **ego-browser 에 대응물이 없다.**
- **끌어 놓기(dnd-kit) 확인.** 루트 `AGENTS.md` §프론트엔드 하드룰이 *"`chrome-devtools-axi drag`
  로 실제 브라우저에서 끌어 볼 수 있다"* 며 그 명령을 못 박아 두었다. ego-browser 에도
  `dragMouse` 가 있지만 **문서에 적힌 확인 경로는 그쪽**이다.

**사용자가 어느 하나를 지목하면 그 지시가 위 기준보다 우선한다.**

## 경험 노트 (2026-09-04, `read-path-redesign/T08` 에서 실제로 겪은 것)

**1. 측정은 브라우저 *안에서* 해라 — 왕복이 값을 오염시킨다.**
"문서를 클릭하면 몇 ms 만에 뜨나" 를 재야 했다. 셸 명령을 왕복하면 `click` → `wait` → `eval`
사이의 프로세스 왕복이 측정에 섞인다. `ego-browser` 의 `js()` 안에서 `performance.now()` 로
클릭 직후부터 드로어에 본문이 나타날 때까지를 직접 재니 **154ms** 라는 값이 나왔다.
🔴 **눈대중으로 "빨라졌다" 고 적지 마라** — 이 저장소는 값 정직을 요구한다.

**2. 스크린샷은 "무엇이 보이나" 지 "언제 바뀌나" 가 아니다.**
사이드바 스피너가 뜨는 순간을 찍으려 했는데 **이미 지나간 뒤**였다(값이 1~2초면 온다).
상태 전이는 `js()` 로 **DOM 을 일정 간격으로 스냅샷** 떠서 잡았다:

```
t=0ms     gootte=⟳세는중  jinwooauto=⟳세는중  voice-to-iterm=⟳세는중
t=250ms   gootte=0        jinwooauto=⟳세는중  voice-to-iterm=⟳세는중
t=1000ms  gootte=0        jinwooauto=11       voice-to-iterm=2
```

스크린샷은 그 뒤에 **모양**을 확인하는 용도로만 썼다.

**3. 브라우저로 재기 전에 API 를 먼저 갈라 봐라.**
화면에서 311ms 가 나왔을 때 백엔드를 의심했는데, `fetch` 로 API 만 재니 **3~5ms** 였다.
나머지는 전부 클라이언트의 마크다운 렌더였다. 🔴 **API 와 렌더를 안 가르면 엉뚱한 곳을 고친다.**

**4. 남은 숙제는 `chrome-devtools-axi` 의 몫이다.**
위 3번의 "18KB 문서 렌더 ~300ms" 를 실제로 파려면 `perf-start` / `perf-stop` / `perf-insight`
가 필요하다 — ego-browser 로는 그 자리를 못 본다. **한 작업 안에서 도구를 갈아타도 된다.**

**5. dev 서버가 필요하면 먼저 스킬 `gootte-dev-server` 를 읽어라.**
포트 규율·안전한 종료·`GOOTTE_DATA_DIR` 격리가 거기 있다 — 여기 두 벌로 적지 않는다.
🔴 캡틴 앱이 이미 떠 있으면 **다른 포트 + 다른 데이터 디렉토리**로 따로 띄운다.
