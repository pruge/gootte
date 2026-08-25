import { describe, expect, it } from "vitest";
import {
  FIRSTMATE_STATUSES,
  mapFirstmateStatus,
  parseBlockedBy,
  parseBlockedByLine,
  parseCaptainEyeLine,
  parseCrossFeatureRef,
  parseFeatureSpec,
  parseNeedsCaptainEye,
  parseNewTicket,
  parseStatusLine,
  parseTicket,
} from "./feature";

/** 티켓 파일 한 장 합성 — 상단 두 줄이 서식의 전부다(triage-labels). */
function ticket(status: string, blockedBy?: string): string {
  return [
    "# 02 — 할일 목록을 기능 문서에서 읽는다",
    "",
    ...(blockedBy ? [`**Blocked by:** ${blockedBy}`] : []),
    `**Status:** ${status}`,
    "",
    "본문",
  ].join("\n");
}

describe("parseStatusLine — 아홉 값이 그대로 살아 돌아온다", () => {
  it.each(FIRSTMATE_STATUSES)("정규 값 %s 을 알아본다", (s) => {
    const line = parseStatusLine(ticket(s));
    expect(line.value).toBe(s);
    expect(line.raw).toBe(s); // 원문 보존
  });

  it("🔴 claimed 는 정규 값으로 인식된다 — 알 수 없는 상태가 아니다", () => {
    const line = parseStatusLine(ticket("claimed"));
    expect(line.value).toBe("claimed");
    expect(line.raw).toBe("claimed");
  });

  it("🔴 알 수 없는 상태 문자열을 조용히 버리지 않는다 — 원문이 그대로 실려 나온다", () => {
    const line = parseStatusLine(ticket("진행중"));
    expect(line.value).toBeNull(); // 아홉 값이 아니다
    expect(line.raw).toBe("진행중"); // 무엇이 이상한지 드러난다
  });

  it("`Status:` 줄이 아예 없으면 raw 도 null — 값을 지어내지 않는다", () => {
    expect(parseStatusLine("# 제목\n본문뿐")).toEqual({
      raw: null,
      value: null,
      completedAt: null,
    });
  });

  it("굵게 표시 없는 `Status:` 줄(spec.md 서식)도 읽는다", () => {
    expect(parseStatusLine("# 기능\n\nStatus: ready-for-agent\n").value).toBe("ready-for-agent");
  });

  it("첫 줄이 이긴다 — 하단 `## Comments` 의 인용에 흔들리지 않는다", () => {
    const doc = ticket("ready-for-agent") + "\n\n## Comments\n\n- 예전엔 **Status:** draft 였다\n";
    expect(parseStatusLine(doc).value).toBe("ready-for-agent");
  });
});

describe("parseStatusLine — 값 뒤에 붙는 것에 넘어가지 않는다", () => {
  it("괄호 날짜가 붙어도 값만 뽑고 완료일을 함께 읽는다", () => {
    expect(parseStatusLine(ticket("resolved (2026-08-09)"))).toEqual({
      raw: "resolved",
      value: "resolved",
      completedAt: "2026-08-09",
    });
  });

  it("🔴 06 — 시각까지 적힌 완료일은 분까지 읽는다", () => {
    expect(parseStatusLine(ticket("resolved (2026-08-12 14:30)"))).toEqual({
      raw: "resolved",
      value: "resolved",
      completedAt: "2026-08-12 14:30",
    });
  });

  it("🔴 06 — 시각이 없으면 날짜만 읽는다, 00:00 을 지어내지 않는다", () => {
    expect(parseStatusLine(ticket("resolved (2026-08-09)")).completedAt).toBe("2026-08-09");
  });

  it("🔴 06 — resolved 뿐이면(날짜도 시각도 없음) 완료일은 없음이다", () => {
    expect(parseStatusLine(ticket("resolved")).completedAt).toBeNull();
  });

  it("🔴 06 — 완료가 아닌 상태의 괄호 시각은 완료 시각으로 읽히지 않는다", () => {
    expect(parseStatusLine(ticket("ready-for-agent (2026-08-12 14:30)")).completedAt).toBeNull();
  });

  it("괄호 사유가 붙어도 값만 뽑는다", () => {
    const line = parseStatusLine(ticket("blocked — 02 착지 후"));
    expect(line.value).toBe("blocked");
    expect(line.completedAt).toBeNull();
  });

  it("괄호 뒤에 프로즈가 더 붙어도 값만 뽑는다", () => {
    expect(parseStatusLine("Status: ready-for-agent (2026-08-09) · 열린 결정 전부 닫음").value).toBe(
      "ready-for-agent",
    );
  });

  it("🔴 완료일은 완료 상태에만 붙는다 — ready-for-agent 옆 날짜는 완료일이 아니다", () => {
    expect(parseStatusLine(ticket("ready-for-agent (2026-08-09)")).completedAt).toBeNull();
  });
});

describe("mapFirstmateStatus — 아홉 값 → 다섯 값(결정 Q3)", () => {
  it("resolved → done · wontfix → dropped", () => {
    expect(mapFirstmateStatus("resolved")).toBe("done");
    expect(mapFirstmateStatus("wontfix")).toBe("dropped");
  });

  it.each(
    [
      "draft",
      "needs-triage",
      "needs-info",
      "ready-for-agent",
      "ready-for-human",
      "blocked",
      "claimed",
    ] as const,
  )("나머지 일곱 중 %s → pending", (s) => {
    expect(mapFirstmateStatus(s)).toBe("pending");
  });

  it("알 수 없는 값도 pending — 목록에서 사라지지 않는다", () => {
    expect(mapFirstmateStatus(null)).toBe("pending");
  });

  it("🔴 어떤 입력도 in_progress 를 만들지 않는다 — 그것은 관측의 몫이다(티켓 03)", () => {
    for (const s of [...FIRSTMATE_STATUSES, null]) {
      expect(mapFirstmateStatus(s)).not.toBe("in_progress");
    }
  });
});

describe("parseBlockedBy", () => {
  it("번호 목록을 뽑는다", () => {
    expect(parseBlockedBy(ticket("ready-for-agent", "01, 02"))).toEqual(["01", "02"]);
  });

  it("`없음 — 즉시 착수 가능` 은 선행이 아니다", () => {
    expect(parseBlockedBy(ticket("ready-for-agent", "없음 — 즉시 착수 가능"))).toEqual([]);
  });

  it("🔴 `없음` 뒤 사유에 번호가 있어도 선행이 아니다 — 없다고 적힌 것을 뒤집지 않는다", () => {
    // 실측 서식(jinwooauto/access-control/06 · worker-management/02).
    expect(parseBlockedBy(ticket("ready-for-agent", "없음 — 05,03 과 모두 독립이다."))).toEqual([]);
    expect(parseBlockedBy(ticket("ready-for-agent", "없음 (01 과 병렬 가능 — 다른 파일)"))).toEqual(
      [],
    );
  });

  it("번호 뒤에 사유가 붙어도 번호로 읽는다 — `Status:` 줄과 같은 서식 원리", () => {
    expect(parseBlockedBy(ticket("ready-for-agent", "02 — 02 가 필드 위치를 확정해야 한다"))).toEqual(
      ["02"],
    );
  });

  it("링크로 적힌 번호도 같은 번호로 읽는다", () => {
    // 실측 서식(jinwooauto/catalog-registry/03).
    expect(parseBlockedBy(ticket("blocked", "[02](02-owner-publishes.md) — 먼저 올릴 수 있어야"))).toEqual(
      ["02"],
    );
  });

  it("줄 자체가 없으면 빈 목록", () => {
    expect(parseBlockedBy(ticket("ready-for-agent"))).toEqual([]);
  });

  it("번호에 붙은 괄호 주석은 걷어내고 번호로 본다", () => {
    expect(parseBlockedBy(ticket("blocked", "01 (2026-08-09 이후)"))).toEqual(["01"]);
  });

  it("🔴 산문 속 번호를 이 기능의 번호로 읽지 않는다 — 문구 그대로 싣는다(INV-4)", () => {
    // 실제 서식(firstmate-migration/06): 다른 기능의 티켓을 산문으로 가리킨다.
    expect(
      parseBlockedBy(ticket("ready-for-agent", "03, 04, 그리고 **자매 기능 `other` 의 티켓 01**")),
    ).toEqual(["03", "04", "그리고 **자매 기능 `other` 의 티켓 01**"]);
  });

  describe("꾸며 쓴 '없음' — 이모지·굵게·괄호가 붙어도 막힘 없음이다(development-order/11)", () => {
    it("🔴 실제로 숨었던 서식(jinwooauto/catalog-registry/03 · admin-identity/02) — 이모지+굵게 다음에 없음, 뒤에 완료일 괄호", () => {
      expect(
        parseBlockedBy(ticket("ready-for-agent", "🟢 **없음 — 지금 착수 가능**(2026-08-10 막힘 해제).")),
      ).toEqual([]);
    });

    it("실제 서식(jinwooauto/farm-owned-authoring/01) — 없음 뒤에 이모지+굵게만", () => {
      expect(parseBlockedBy(ticket("ready-for-agent", "없음 — 🟢 **지금 착수 가능**"))).toEqual([]);
    });

    it("굵게만 붙어도 알아본다", () => {
      expect(parseBlockedBy(ticket("ready-for-agent", "**없음** — 확인 완료"))).toEqual([]);
    });

    it("괄호로 감싼 없음도 알아본다", () => {
      expect(parseBlockedBy(ticket("ready-for-agent", "(없음) — 검토 후 갱신"))).toEqual([]);
    });
  });

  describe("느슨해지지 않는다 — 번호·링크로 적힌 진짜 막힘은 꾸며도 그대로 막힘이다", () => {
    it("링크로 적힌 번호는 꾸며 쓴 '없음' 과 섞여도 여전히 선행이다", () => {
      expect(parseBlockedBy(ticket("blocked", "[03](03-x.md), 04"))).toEqual(["03", "04"]);
    });

    it("🔴 번호 앞에 없던 꾸밈(이모지·굵게)이 번호 자리를 가리면 번호로 풀리지 않는다 — 없음으로도 안 풀린다(여전히 기다린다)", () => {
      // LEADING_NUM 은 항목이 번호로 "시작" 할 때만 번호로 읽는다(서식 SoT, issue-tracker).
      // 이 항목은 번호로 시작하지 않으니 문구 그대로 남아 계속 기다린다 — "없음" 으로 잘못 풀리지 않는다.
      expect(parseBlockedBy(ticket("blocked", "🔴 **02** — 아직 안 끝났다"))).toEqual([
        "🔴 **02** — 아직 안 끝났다",
      ]);
    });
  });

  describe("번호도 '없음' 도 없는 산문 — 막히면서 동시에 못 읽었다는 사실도 드러낸다(development-order/17, 11 의 결정 하나를 뒤집는다)", () => {
    it("🔴 산문만 있으면 blockedBy 에도 unreadable 에도 같은 값이 verbatim 으로 실린다", () => {
      expect(parseBlockedByLine(ticket("ready-for-agent", "디자인 논의가 아직 안 끝났다"))).toEqual({
        blockedBy: ["디자인 논의가 아직 안 끝났다"],
        unreadable: ["디자인 논의가 아직 안 끝났다"],
      });
    });

    it("🔴 parseBlockedBy 는 이제 이 산문을 선행으로 센다 — 착수 가능을 막는다(development-order/17 이 11 의 이 결정을 뒤집는다)", () => {
      expect(parseBlockedBy(ticket("ready-for-agent", "디자인 논의가 아직 안 끝났다"))).toEqual([
        "디자인 논의가 아직 안 끝났다",
      ]);
    });

    it("🔴 같은 뜻인 산문에 우연히 숫자(날짜)가 섞여도 답이 같다 — 이 결함의 본체(development-order/17)", () => {
      expect(
        parseBlockedByLine(ticket("ready-for-agent", "스케줄 표면 재구축")),
      ).toEqual({
        blockedBy: ["스케줄 표면 재구축"],
        unreadable: ["스케줄 표면 재구축"],
      });
      expect(
        parseBlockedByLine(ticket("ready-for-agent", "스케줄 표면 재구축 (2026-07-09 계획)")),
      ).toEqual({
        blockedBy: ["스케줄 표면 재구축 (2026-07-09 계획)"],
        unreadable: ["스케줄 표면 재구축 (2026-07-09 계획)"],
      });
    });

    it("🔴 번호가 하나라도 있으면 나머지 산문은 사유(주석)로 보고 unreadable 에 안 올린다 — 느슨해지지 않는다", () => {
      // 번호 뒤 사유는 원래도 주석 취급이었다(기존 규칙). 가운뎃점으로 더 쪼개면 실제 서식
      // (jinwooauto/user-grant-console/02 `읽기·쓰기·복제`)에서 헛된 어긋남이 생긴다.
      expect(parseBlockedByLine(ticket("blocked", "02, 아직 정해지지 않은 것"))).toEqual({
        blockedBy: ["02"],
        unreadable: [],
      });
      expect(
        parseBlockedByLine(
          ticket("blocked", "[01](01-x.md) — 읽기·쓰기·복제 경로를 그쪽이 만든다"),
        ),
      ).toEqual({ blockedBy: ["01"], unreadable: [] });
    });

    it("실제 서식(jinwooauto/access-control/07) — 번호 뒤에 가운뎃점 섞인 사유가 붙어도 번호만 선행이다", () => {
      expect(
        parseBlockedBy(
          ticket("ready-for-agent", "02, 스케줄 표면 재구축(번호 없음 — 아래 §범위·Comments 참고)"),
        ),
      ).toEqual(["02"]);
    });
  });
});

describe("parseCrossFeatureRef — markdown 링크의 경로에서 기능·번호를 읽는다(cross-feature-blocker)", () => {
  it("🔴 실측 서식(jinwooauto failing-reads-widen-their-period/01) — 이모지·굵게로 꾸며도 경로에서 읽는다", () => {
    expect(
      parseCrossFeatureRef(
        "🔴 **[failure-retries-in-one-place 02](../../failure-retries-in-one-place/issues/02-sends-report-their-outcome-and-the-plc-is-watched-again.md)**",
      ),
    ).toEqual({ feature: "failure-retries-in-one-place", num: "02" });
  });

  it("표시 문구는 안 본다 — 경로만 읽으므로 표시 문구가 엉터리여도 같은 답", () => {
    expect(parseCrossFeatureRef("[아무 말이나 999](../../other-feature/issues/03-x.md)")).toEqual({
      feature: "other-feature",
      num: "03",
    });
  });

  it("링크가 없으면 null", () => {
    expect(parseCrossFeatureRef("번호 없이 적힌 진짜 산문")).toBeNull();
  });

  it("링크가 있어도 `<기능>/issues/<번호>-` 형태가 아니면 null", () => {
    expect(parseCrossFeatureRef("[어딘가](https://example.com/docs)")).toBeNull();
  });

  it("같은 기능 안 링크(`[02](02-x.md)`)는 이 함수가 안 다룬다 — LEADING_NUM 이 먼저 번호로 읽는다", () => {
    // parseCrossFeatureRef 는 waitingOn 에서 numKey 가 실패한 항목에만 시도된다.
    expect(parseCrossFeatureRef("[02](02-x.md)")).toBeNull();
  });
});

describe("parseTicket — 번호·제목·상태·선행 네 가지", () => {
  it("번호는 파일명이 주고, 제목의 번호 접두는 걷어낸다", () => {
    const t = parseTicket("02-read-features-and-issues.md", ticket("ready-for-agent", "01"));
    expect(t.num).toBe("02");
    expect(t.slug).toBe("02-read-features-and-issues");
    expect(t.title).toBe("할일 목록을 기능 문서에서 읽는다");
    expect(t.status).toBe("pending");
    expect(t.sourceStatus).toBe("ready-for-agent");
    expect(t.statusKnown).toBe(true);
    expect(t.blockedBy).toEqual(["01"]);
  });

  it("완료 티켓은 완료일을 함께 싣는다", () => {
    const t = parseTicket("01-discover.md", ticket("resolved (2026-08-09)"));
    expect(t.status).toBe("done");
    expect(t.sourceStatus).toBe("resolved");
    expect(t.completedAt).toBe("2026-08-09");
  });

  it("🔴 06 — 완료 티켓은 시각까지 있으면 분까지 싣는다", () => {
    const t = parseTicket("01-discover.md", ticket("resolved (2026-08-12 14:30)"));
    expect(t.completedAt).toBe("2026-08-12 14:30");
  });

  it("🔴 알 수 없는 상태의 티켓도 살아남는다 — statusKnown=false 로 이상함이 드러난다", () => {
    const t = parseTicket("03-mystery.md", ticket("in-flight"));
    expect(t.statusKnown).toBe(false);
    expect(t.sourceStatus).toBe("in-flight"); // 원문 보존
    expect(t.status).toBe("pending"); // 목록에서 사라지지 않는다
  });

  it("제목(H1)이 없으면 slug 로 대신한다", () => {
    expect(parseTicket("04-no-heading.md", "**Status:** draft\n").title).toBe("04-no-heading");
  });

  it("번호 없는 파일도 버리지 않는다", () => {
    expect(parseTicket("notes.md", "**Status:** draft\n").num).toBe("");
  });

  it("`## 캡틴 확인` 절이 있으면 needsCaptainEye=true 다(development-order/15 ②)", () => {
    const content = `${ticket("ready-for-agent")}\n\n## 캡틴 확인\n\n- 어디서\n`;
    expect(parseTicket("05-x.md", content).needsCaptainEye).toBe(true);
  });

  it("절이 없으면 needsCaptainEye=false 다", () => {
    expect(parseTicket("05-x.md", ticket("ready-for-agent")).needsCaptainEye).toBe(false);
  });
});

describe("parseNeedsCaptainEye — `## 캡틴 확인` 절이 있나 없나로만 정한다(INV-4, development-order/15 ②)", () => {
  it("H2 헤딩이 있으면 true", () => {
    expect(parseNeedsCaptainEye("# 제목\n\n## 캡틴 확인\n\n- 어디서 — plan 탭\n")).toBe(true);
  });

  it("헤딩이 아예 없으면 false", () => {
    expect(parseNeedsCaptainEye("# 제목\n\n본문뿐이다\n")).toBe(false);
  });

  it("🔴 실측: '— 없음' 접미는 캡틴이 이미 필요 없다고 정하신 절이라 false 다(access-control/03)", () => {
    expect(parseNeedsCaptainEye("## 캡틴 확인 — 없음 (캡틴 결정, 2026-08-08)\n")).toBe(false);
  });

  it("이모지 접두는 걷어내고 읽는다 — 실제로 쓰이는 서식(the-eye-mark-comes-from-one-place/spec §지금 쓰이는 제목 서식)", () => {
    expect(parseNeedsCaptainEye("## 🔴 캡틴 확인 — 눈으로 봐야 한다\n")).toBe(true);
  });

  it("🔴 옛 티켓 전용: 사후 기록(`완료 (날짜)`)만 있어도 요청으로 센다 — F8, 표시 줄 없는 옛 티켓에만 걸리는 오늘 동작 그대로다. 결정된 적 없는 물음이지만 손대지 않는다(캡틴 결정 2026-08-14)", () => {
    expect(parseNeedsCaptainEye("## 🟢 캡틴 확인 완료 (2026-08-11)\n")).toBe(true);
  });

  it("H3(회고 보고)은 절로 세지 않는다(jinwooauto/access-control/01 '### 캡틴 확인 결과')", () => {
    expect(parseNeedsCaptainEye("### 🟢 캡틴 확인 결과 (2026-08-10 저녁)\n")).toBe(false);
  });

  it("'캡틴 확인' 을 안 담은 다른 H2 헤딩은 무시한다", () => {
    expect(parseNeedsCaptainEye("## 착수 전에 확인할 것\n\n체크리스트\n")).toBe(false);
  });
});

describe("parseCaptainEyeLine — `**캡틴 확인:**` 표시 줄(캡틴 결정 2026-08-14, INV-E2·E3)", () => {
  it("🔴 `필요 — <자유 문구>` → true, `—` 뒤 문구는 읽지 않는다", () => {
    const line = parseCaptainEyeLine("**캡틴 확인:** 필요 — 화면에서 18개가 이름으로 보이는지\n");
    expect(line.known).toBe(true);
    expect(line.needsCaptainEye).toBe(true);
    expect(line.raw).toBe("필요");
  });

  it("🔴 `필요 없음` → false", () => {
    const line = parseCaptainEyeLine("**캡틴 확인:** 필요 없음\n");
    expect(line.known).toBe(true);
    expect(line.needsCaptainEye).toBe(false);
  });

  it("🔴 `완료 (날짜)` → false", () => {
    const line = parseCaptainEyeLine("**캡틴 확인:** 완료 (2026-08-11)\n");
    expect(line.known).toBe(true);
    expect(line.needsCaptainEye).toBe(false);
  });

  it("굵게 없는 `캡틴 확인: 필요` 도 읽는다(Status: 줄과 같은 관대함)", () => {
    const line = parseCaptainEyeLine("캡틴 확인: 필요\n");
    expect(line.known).toBe(true);
    expect(line.needsCaptainEye).toBe(true);
  });

  it("🔴 못 알아본 값은 원문을 보존하고 알아봤나를 거짓으로 둔다 — 조용히 버리지 않는다", () => {
    const line = parseCaptainEyeLine("**캡틴 확인:** 잘 모르겠음\n");
    expect(line.known).toBe(false);
    expect(line.needsCaptainEye).toBeNull();
    expect(line.raw).toBe("잘 모르겠음");
  });

  it("줄이 아예 없으면 raw 도 null — 값을 지어내지 않는다", () => {
    expect(parseCaptainEyeLine("# 제목\n본문뿐\n")).toEqual({
      raw: null,
      known: false,
      needsCaptainEye: null,
    });
  });
});

describe("parseNeedsCaptainEye — 표시 줄과 제목의 우선순위(INV-E1·E2)", () => {
  it("🔴 표시 줄이 있으면 제목과 달라도 표시 줄이 이긴다", () => {
    const content = "**캡틴 확인:** 필요 없음\n\n## 캡틴 확인\n\n- 어디서\n";
    expect(parseNeedsCaptainEye(content)).toBe(false);
  });

  it("표시 줄이 없으면 오늘 그대로 제목을 읽는다", () => {
    expect(parseNeedsCaptainEye("## 캡틴 확인\n\n- 어디서\n")).toBe(true);
  });

  it("🔴 표시 줄이 못 알아본 값이면 제목 읽기로 되돌아간다", () => {
    const content = "**캡틴 확인:** 잘 모르겠음\n\n## 캡틴 확인\n\n- 어디서\n";
    expect(parseNeedsCaptainEye(content)).toBe(true);
  });

  it("🔴 이 티켓 자신이 첫 사용자다 — 표시 줄 값과 제목 읽기 값이 같다(the-eye-mark-comes-from-one-place/01 §완료 시 시연되는 것)", () => {
    // 티켓 01 머리의 실제 줄. `## 캡틴 확인` 절이 없으니 제목 읽기는 오늘도 false 다.
    const content = "**캡틴 확인:** 필요 없음 — 파서와 출력이라 시험으로 다 판정된다\n\n본문뿐\n";
    const line = parseCaptainEyeLine(content);
    expect(line.needsCaptainEye).toBe(false); // 표시 줄이 말하는 값
    expect(parseNeedsCaptainEye("본문뿐\n")).toBe(false); // 제목만 읽었을 때의 값(표시 줄 없이)
    expect(parseNeedsCaptainEye(content)).toBe(false); // 실제 판정 — 둘이 같다
  });
});

describe("펜스 코드 블록 — 구조는 펜스 밖에서만 읽는다(실제 결함 2026-08)", () => {
  // 실물 발단: steps-start-from-dependencies/T01.md 의 구현 노트가 관례 자체를 예시로
  // 보여주는데, 파서가 펜스 안의 예시를 진짜 구조로 읽었다. 티켓 문서가 관례를 예시로
  // 보여주는 것은 정상이며 반복된다 — 파서 쪽이 걸러야 한다.

  it("옛 관례 — 펜스 안의 `**Blocked by:**` 예시는 막힘이 아니다", () => {
    const content = [
      "# 03 — 티켓",
      "",
      "서식은 이렇다:",
      "",
      "```markdown",
      "**Blocked by:** 01, 02",
      "```",
      "",
      "**Blocked by:** 없음",
    ].join("\n");
    expect(parseBlockedByLine(content).blockedBy).toEqual([]);
  });

  it("옛 관례 — 펜스 뒤의 진짜 `Blocked by:` 줄은 정상적으로 읽는다", () => {
    const content = [
      "# 03 — 티켓",
      "",
      "~~~",
      "**Blocked by:** 09 (없는 예시)",
      "~~~",
      "",
      "**Blocked by:** 01, 02",
    ].join("\n");
    expect(parseBlockedByLine(content).blockedBy).toEqual(["01", "02"]);
  });

  it("Status — 펜스 안의 `**Status:** resolved` 예시가 완료로 만들지 않는다", () => {
    const content = [
      "# 04 — 티켓",
      "",
      "```markdown",
      "**Status:** resolved (2026-08-01)",
      "```",
      "",
      "**Status:** ready-for-agent",
    ].join("\n");
    expect(parseStatusLine(content).value).toBe("ready-for-agent");
    expect(parseTicket("04-x.md", content).status).toBe("pending");
  });

  it("캡틴 확인 — 펜스 안의 예시 절·표시 줄이 눈 표시를 만들지 않는다", () => {
    const content = [
      "# 05 — 티켓",
      "",
      "```markdown",
      "**캡틴 확인:** 필요",
      "## 캡틴 확인",
      "```",
      "",
      "본문뿐이다",
    ].join("\n");
    expect(parseCaptainEyeLine(content).known).toBe(false);
    expect(parseNeedsCaptainEye(content)).toBe(false);
  });

  it("표제 — 펜스 안에 인용된 다른 문서의 `# 제목` 이 이 문서의 표제가 되지 않는다", () => {
    const content = [
      "```markdown",
      "# T09 — 인용된 예시 표제",
      "```",
      "",
      "# 06 — 진짜 표제",
    ].join("\n");
    expect(parseFeatureSpec("some-feature", content).title).toBe("06 — 진짜 표제");
  });
});

describe("parseFeatureSpec", () => {
  it("표제와 상태를 읽는다", () => {
    const spec = parseFeatureSpec(
      "firstmate-project-source",
      "# firstmate-project-source — 관리 대상 전환\n\nStatus: ready-for-agent (2026-08-09) · 결정 닫음\n",
    );
    expect(spec.title).toBe("firstmate-project-source — 관리 대상 전환");
    expect(spec.status).toBe("pending");
    expect(spec.sourceStatus).toBe("ready-for-agent");
    expect(spec.statusKnown).toBe(true);
  });

  it("표제가 없으면 폴더명", () => {
    expect(parseFeatureSpec("some-feature", "본문뿐\n").title).toBe("some-feature");
  });
});

describe("parseNewTicket — `## Depends on` 을 읽는다(T01)", () => {
  // 실물 서식(tauri-desktop-app/tickets/T04.md 끝부분) — 여러 줄 목록이다.
  const t = (body: string) =>
    parseNewTicket(
      "T03.md",
      `# T03 — 제목\n\n## Goal\n본문\n${body}\n\n## Can run in parallel with\n- nothing\n`,
    );

  it("`- T02` 가 있으면 그 티켓의 의존에 02 가 실린다", () => {
    const doc = t("## Depends on\n- T02");
    expect(doc.blockedBy).toEqual(["02"]);
    expect(doc.unreadableBlockedBy).toEqual([]);
  });

  it("사유가 붙어도 번호만 읽는다 — `- T02 (경로 설정값)`", () => {
    expect(t("## Depends on\n- T02 (경로 설정값)").blockedBy).toEqual(["02"]);
  });

  it("여러 항목을 순서대로 읽고, 중복 번호는 한 번만 싣는다", () => {
    expect(t("## Depends on\n- T02\n- T03\n- T02 (다시)").blockedBy).toEqual(["02", "03"]);
  });

  it("`- none`·`- nothing` 선언은 의존 없음으로 읽는다", () => {
    expect(t("## Depends on\n- none").blockedBy).toEqual([]);
    expect(parseNewTicket("T01.md", "# T01 — a\n\n## Depends on\n- nothing\n").blockedBy).toEqual([]);
  });

  it("🔴 절이 없으면 의존 없음 — 옛 관례가 `Blocked by:` 줄 없음을 읽듯(INV-4 일관)", () => {
    expect(parseNewTicket("T01.md", "# T01 — a\n\n본문뿐이다\n").blockedBy).toEqual([]);
  });

  it("절의 끝은 다음 헤딩이다 — `Can run in parallel with` 안의 `- nothing` 이 의존을 지우지 않는다", () => {
    expect(t("## Depends on\n- T02\n\n## Can run in parallel with\n- nothing").blockedBy).toEqual(["02"]);
  });

  it("번호로 안 풀린 항목은 막히며 verbatim 으로 드러난다(옛 관례와 같은 규율, development-order/17)", () => {
    const doc = t("## Depends on\n- 자매 기능이 먼저 끝나야");
    expect(doc.blockedBy).toEqual(["자매 기능이 먼저 끝나야"]);
    expect(doc.unreadableBlockedBy).toEqual(["자매 기능이 먼저 끝나야"]);
  });

  it("🔴 펜스 코드 블록 안의 예시 `## Depends on` 은 절로 읽지 않는다 — 구현 노트 속 인용이 의존을 지어내지 않는다(실물 결함, steps-start-from-dependencies/T01.md)", () => {
    // 실물 T01.md 의 모양 — 본문 중간에 펜스로 인용된 예시가 있고, 진짜 절은 맨 밑에 있다.
    const doc = parseNewTicket(
      "T01.md",
      [
        "# T01 — 제목",
        "",
        "## Implementation notes",
        "",
        "실물은 이렇다:",
        "",
        "```markdown",
        "## Depends on",
        "- T02 (경로 설정값)",
        "```",
        "",
        "## Can run in parallel with",
        "- nothing",
        "",
        "## Depends on",
        "",
        "- none",
        "",
      ].join("\n"),
    );
    expect(doc.blockedBy).toEqual([]);
    expect(doc.unreadableBlockedBy).toEqual([]);
  });

  it("🔴 펜스 뒤의 진짜 절은 정상적으로 읽는다 — 예시와 실제 의존이 섞이지 않는다", () => {
    const doc = parseNewTicket(
      "T02.md",
      [
        "# T02 — 제목",
        "",
        "예시:",
        "",
        "~~~",
        "## Depends on",
        "- T09 (없는 예시)",
        "~~~",
        "",
        "## Depends on",
        "- T01",
        "",
      ].join("\n"),
    );
    expect(doc.blockedBy).toEqual(["01"]);
  });

  it("제목·번호 읽기는 그대로 유지한다(회귀)", () => {
    const doc = t("## Depends on\n- T02");
    expect(doc.num).toBe("03");
    expect(doc.slug).toBe("T03");
    expect(doc.title).toBe("제목");
  });
});
