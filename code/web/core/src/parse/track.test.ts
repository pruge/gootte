import { describe, it, expect } from "vitest";
import { normalizeTrack, parseProfileTracks } from "./track";
import { parseLedger } from "./ledger";

const VOCAB = new Map([
  ["A", "저장 spine"],
  ["C", "제어 알고리즘"],
  ["F", "실시간 / 게이트웨이 오케스트레이션"],
]);

describe("normalizeTrack — 18변형 → canonical {key,label}", () => {
  it("볼드·Track 접두·괄호 설명 제거 (같은 C 수렴)", () => {
    for (const raw of [
      "**Track C 제어 알고리즘** (positional 우회 대체 · 최우선 INV-0/INV-9)",
      "**Track C 제어 알고리즘** (FSM 실행 모델)",
      "C — 제어 알고리즘",
      "C — 제어 알고리즘 🔴 (control-algorithm-layer phase 2)",
    ]) {
      expect(normalizeTrack(raw, VOCAB)?.key).toBe("C");
    }
  });

  it("어휘 있으면 label = canonical(SoT)", () => {
    // 프로즈 label 이 달라도 어휘가 이김
    expect(normalizeTrack("C — 제어 알고리즘 🔴 (딴 설명)", VOCAB)).toEqual({
      key: "C",
      label: "제어 알고리즘",
    });
  });

  it("어휘 없으면 label = 프로즈 파생(verbatim)", () => {
    expect(normalizeTrack("**Track C 제어 알고리즘**", new Map())).toEqual({
      key: "C",
      label: "제어 알고리즘",
    });
    expect(normalizeTrack("B — device 모델", new Map())).toEqual({ key: "B", label: "device 모델" });
  });

  it("label 내부 '/'(실시간 / 게이트웨이)는 보존, 복수 track(A … / E —)은 선두 채택", () => {
    expect(normalizeTrack("F — 실시간 / 게이트웨이 오케스트레이션", new Map())).toEqual({
      key: "F",
      label: "실시간 / 게이트웨이 오케스트레이션",
    });
    expect(normalizeTrack("A — 저장 spine / E — operator 트리 (하류)", new Map())).toEqual({
      key: "A",
      label: "저장 spine",
    });
  });

  it("이모지·후행 마커 제거", () => {
    expect(normalizeTrack("C — 제어 알고리즘 🔴", new Map())?.label).toBe("제어 알고리즘");
  });

  it("선두 대문자 없음 = 도메인 slug(label 자체가 축)", () => {
    expect(normalizeTrack("제어 알고리즘", new Map())).toEqual({ key: "제어", label: "제어 알고리즘" });
  });

  it("null/공백/undefined = 미분류(null)", () => {
    expect(normalizeTrack(null, VOCAB)).toBeNull();
    expect(normalizeTrack("", VOCAB)).toBeNull();
    expect(normalizeTrack("   ", VOCAB)).toBeNull();
    expect(normalizeTrack(undefined, VOCAB)).toBeNull();
  });
});

describe("parseProfileTracks — ## Tracks 표 → 어휘", () => {
  const PROFILE = `# profile

## Tracks (대분류)
> 설명 blurb.
- key = 식별자.

| key | label |
|-----|-------|
| A | 저장 spine |
| C | 제어 알고리즘 |
| <플레이스홀더> | <채움> |

## Initiative ledger
| x | y |
`;
  it("표 행만 key↔label (헤더·구분선·플레이스홀더·다음 섹션 skip)", () => {
    const v = parseProfileTracks(PROFILE);
    expect(v.get("A")).toBe("저장 spine");
    expect(v.get("C")).toBe("제어 알고리즘");
    expect(v.has("key")).toBe(false);
    expect(v.has("x")).toBe(false); // 다음 섹션 표 미포함
    expect([...v.keys()].some((k) => k.startsWith("<"))).toBe(false); // 플레이스홀더 제외
  });
  it("## Tracks 없으면 빈 맵", () => {
    expect(parseProfileTracks("# no tracks here").size).toBe(0);
  });
});

describe("parseLedger — track frontmatter 우선 + 프로즈 fallback", () => {
  it("frontmatter track: 우선(카노니컬)", () => {
    const md = `---
initiative: control-exec
track: C
---
# control-exec — ledger
- 상태: 🔜 active · 의존: 없음
`;
    expect(parseLedger("control-exec", md).track).toBe("C");
  });
  it("frontmatter 없으면 프로즈 트랙:(레거시 무회귀)", () => {
    const md = `# control-exec — 원장 조각
- 상태: 🔜 active · 트랙: **Track C 제어 알고리즘** (설명) · 의존: 없음
`;
    expect(parseLedger("control-exec", md).track).toContain("Track C");
  });
  it("둘 다 없으면 null", () => {
    const md = `# x — ledger
- 상태: 🔜 active · 의존: 없음
`;
    expect(parseLedger("x", md).track).toBeNull();
  });
});
