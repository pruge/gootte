import { describe, expect, it } from "vitest";
import {
  FIRSTMATE_STATUSES,
  mapFirstmateStatus,
  parseBlockedBy,
  parseBlockedByLine,
  parseFeatureSpec,
  parseNeedsCaptainEye,
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

  it("이모지 접두는 걷어내고 읽는다(jinwooauto/catalog-registry/05)", () => {
    expect(parseNeedsCaptainEye("## 🟢 캡틴 확인 완료 (2026-08-11)\n")).toBe(true);
  });

  it("H3(회고 보고)은 절로 세지 않는다(jinwooauto/access-control/01 '### 캡틴 확인 결과')", () => {
    expect(parseNeedsCaptainEye("### 🟢 캡틴 확인 결과 (2026-08-10 저녁)\n")).toBe(false);
  });

  it("'캡틴 확인' 을 안 담은 다른 H2 헤딩은 무시한다", () => {
    expect(parseNeedsCaptainEye("## 착수 전에 확인할 것\n\n체크리스트\n")).toBe(false);
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
