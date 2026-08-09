import { describe, expect, it } from "vitest";
import {
  FIRSTMATE_STATUSES,
  mapFirstmateStatus,
  parseBlockedBy,
  parseFeatureSpec,
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

describe("parseStatusLine — 여덟 값이 그대로 살아 돌아온다", () => {
  it.each(FIRSTMATE_STATUSES)("정규 값 %s 을 알아본다", (s) => {
    const line = parseStatusLine(ticket(s));
    expect(line.value).toBe(s);
    expect(line.raw).toBe(s); // 원문 보존
  });

  it("🔴 알 수 없는 상태 문자열을 조용히 버리지 않는다 — 원문이 그대로 실려 나온다", () => {
    const line = parseStatusLine(ticket("진행중"));
    expect(line.value).toBeNull(); // 여덟 값이 아니다
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

describe("mapFirstmateStatus — 여덟 값 → 다섯 값(결정 Q3)", () => {
  it("resolved → done · wontfix → dropped", () => {
    expect(mapFirstmateStatus("resolved")).toBe("done");
    expect(mapFirstmateStatus("wontfix")).toBe("dropped");
  });

  it.each(["draft", "needs-triage", "needs-info", "ready-for-agent", "ready-for-human", "blocked"] as const)(
    "나머지 여섯 중 %s → pending",
    (s) => {
      expect(mapFirstmateStatus(s)).toBe("pending");
    },
  );

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
