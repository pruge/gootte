import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseSecondmateHomes, readSecondmateHomes, secondmatesFile } from "./secondmates";

let home = "";
afterEach(() => {
  if (home) rmSync(home, { recursive: true, force: true });
  home = "";
});

describe("parseSecondmateHomes — 명부 파서(결정적, INV-4)", () => {
  it("실물 명부 세 줄(2026-08-26)에서 홈 셋을 명부 순 그대로 뽑는다", () => {
    // 아래 세 줄은 `/Users/pruge/Documents/ai2/firstmate2/data/secondmates.md` 실물을 그대로 붙여 넣었다.
    // 이 결함의 원인이 지어낸 단독 줄 픽스처였으니, 실물 모양은 반드시 여기서 검증한다.
    const content = [
      "- gootte-mate - gootte 대시보드를 맡는 두 번째 항해사 (home: /Users/pruge/.treehouse/firstmate2-4b2429/1/firstmate2; scope: gootte 대시보드 자체에 관한 모든 일 — 기능·티켓 화면, 계획 판, 처리중 표시, 읽음 표시, 문서 파서, 백로그 조인, Tauri 데스크톱 껍데기, 그리고 gootte 의 기획 문서. 다른 프로젝트의 코드는 이 영역이 아니다.; projects: gootte; added 2026-08-26)",
      "- dictation-mate - 폰 마이크에서 받아쓰기까지의 갈래를 맡는 두 번째 항해사 (home: /Users/pruge/.treehouse/firstmate2-4b2429/2/firstmate2; scope: 폰을 마이크로 쓰는 것부터 받아쓴 글자가 나오기까지의 모든 일 — QuicMic 의 전송·짝짓기·메뉴바·웹앱, OpenSuperWhisper 의 받아쓰기와 녹음 관리, murmur 의 누르고 말하기, 그리고 셋 사이의 오디오 경로 가상 케이블, 장치, 지연, 표본율 . 세 저장소 중 어느 것이든 이 갈래에 속하면 여기로 온다.; projects: QuicMic, OpenSuperWhisper, murmur; added 2026-08-26)",
      "- jinwoo-mate - 진우오토 jinwooauto 범용 제어 플랫폼을 맡는 두 번째 항해사. 이 저장소는 capability 기반 범용 제어 플랫폼이다. 측창 멜론 단일앱 `jinwoofarmcare` 에서 갈라져 나왔고, 측창은 이제 plugin #1 이다. 제어 대상은 측창·새송이 생육실·에어탈병기·적재기·입병이며 각각 plugin 으로 끼운다. 설계의 단일 출처는 `docs/spec/범용/` 이다 — README 결정 D1~D7 , 범용-제어-플랫폼.md 아키텍처 , 사례-새송이-생육실.md. 여기서 벗어나는 판단을 하기 전에 그 문서를 먼저 읽어라. 🔴 이 영역은 이미 개발이 진행된 도메인이다. 상속받은 계획을 그대로 열린 일로 다루지 마라. 착수 전에 origin/main 의 실제 착지 상태와 대조해서, 이미 배달된 것은 done 으로 정리하거나 버리고 진짜로 남은 것만 네 대기열에 남겨라. 예전 메모나 문서 문장은 착지 증거가 아니다 — 저장소가 증거다. 🔴 `jinwoofarmcare` 는 필드 테스트용으로 동결돼 있고 의도적으로 갈라져 있다. 이 영역이 아니다. 그쪽을 건드리지 마라. 배달 방식은 direct-PR 이다. 이 저장소는 fork 가 아니므로 PR 은 평소대로 열면 된다. (home: /Users/pruge/.treehouse/firstmate2-4b2429/3/firstmate2; scope: 진우오토 jinwooauto 범용 제어 플랫폼 저장소에 관한 모든 일 — capability/plugin 구조, 제어 모듈과 IO 풀, FSM 풀 등록과 수명주기, 게이트웨이와 장치 드라이버 seam, 접근 제어와 신원, 카탈로그 레지스트리, 배포와 확인 흐름, 그리고 이 저장소의 기획 문서. 동결된 jinwoofarmcare 는 이 영역이 아니다.; projects: jinwooauto; added 2026-08-26)",
    ].join("\n");
    expect(parseSecondmateHomes(content)).toEqual([
      "/Users/pruge/.treehouse/firstmate2-4b2429/1/firstmate2",
      "/Users/pruge/.treehouse/firstmate2-4b2429/2/firstmate2",
      "/Users/pruge/.treehouse/firstmate2-4b2429/3/firstmate2",
    ]);
  });

  it("단독 줄 형식(`home: <경로>`)도 그대로 뽑는다 — 실물 형식의 상위집합", () => {
    const content = [
      "# Secondmates",
      "",
      "home: /Users/pruge/.treehouse/firstmate2-4b2429/1/firstmate2",
      "home: /Users/pruge/.treehouse/firstmate2-4b2429/2/firstmate2",
      "",
    ].join("\n");
    expect(parseSecondmateHomes(content)).toEqual([
      "/Users/pruge/.treehouse/firstmate2-4b2429/1/firstmate2",
      "/Users/pruge/.treehouse/firstmate2-4b2429/2/firstmate2",
    ]);
  });

  it("나머지 줄은 무시하고, 중복 경로는 첫 번째만 남긴다", () => {
    const content = [
      "secondmate: 누군가의 사본", // home: 이 아닌 줄
      "home: /a/firstmate2",
      "  home:   /b/firstmate2  ", // 앞뒤 공백 허용
      "home:", // 빈 값 — 후보 아님
      "home: /a/firstmate2", // 중복 — 첫 번째가 이긴다
    ].join("\n");
    expect(parseSecondmateHomes(content)).toEqual(["/a/firstmate2", "/b/firstmate2"]);
  });

  it("빈 내용이면 빈 목록", () => {
    expect(parseSecondmateHomes("")).toEqual([]);
  });
});

describe("readSecondmateHomes — 명부 리더", () => {
  it("명부 파일에서 홈 목록을 낸다", () => {
    home = mkdtempSync(join(tmpdir(), "gootte-secondmates-"));
    mkdirSync(join(home, "data"), { recursive: true });
    writeFileSync(secondmatesFile(home), "home: /mate/one\nhome: /mate/two\n");

    expect(readSecondmateHomes(home)).toEqual(["/mate/one", "/mate/two"]);
  });

  it("명부가 없거나 홈이 미설정이면 빈 목록 — 예외로 죽지 않는다", () => {
    expect(readSecondmateHomes("/없는/홈")).toEqual([]);
    expect(readSecondmateHomes(null)).toEqual([]);
    expect(readSecondmateHomes(undefined)).toEqual([]);
    expect(readSecondmateHomes("")).toEqual([]);
  });
});
