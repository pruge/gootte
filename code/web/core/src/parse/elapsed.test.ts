import { describe, expect, it } from "vitest";
import { elapsedPhrase } from "./elapsed";

const NOW = "2026-08-27T13:00:00+09:00";

describe("elapsedPhrase", () => {
  it("59초는 약 1분이다(0분 아님)", () => {
    const started = "2026-08-27T12:48:00+09:00";
    const finished = "2026-08-27T12:48:59+09:00";
    expect(elapsedPhrase(started, finished, NOW)).toBe("약 1분");
  });

  it("60초는 약 1분이다", () => {
    const started = "2026-08-27T12:48:00+09:00";
    const finished = "2026-08-27T12:49:00+09:00";
    expect(elapsedPhrase(started, finished, NOW)).toBe("약 1분");
  });

  it("14분은 약 14분이다(캡틴 예시 문구)", () => {
    const started = "2026-08-27T12:48:43+09:00";
    const finished = "2026-08-27T13:02:43+09:00";
    expect(elapsedPhrase(started, finished, NOW)).toBe("약 14분");
  });

  it("3600초(정확히 1시간)는 약 1시간이다(분이 0)", () => {
    const started = "2026-08-27T12:00:00+09:00";
    const finished = "2026-08-27T13:00:00+09:00";
    expect(elapsedPhrase(started, finished, NOW)).toBe("약 1시간");
  });

  it("3660초(1시간 1분)는 약 1시간 1분이다", () => {
    const started = "2026-08-27T12:00:00+09:00";
    const finished = "2026-08-27T13:01:00+09:00";
    expect(elapsedPhrase(started, finished, NOW)).toBe("약 1시간 1분");
  });

  it("2시간 5분 — 캡틴 예시(D4)", () => {
    const started = "2026-08-27T11:00:00+09:00";
    const finished = "2026-08-27T13:05:00+09:00";
    expect(elapsedPhrase(started, finished, NOW)).toBe("약 2시간 5분");
  });

  it("finished 가 없으면 진행 중임이 문구에 드러난다 — now 인자로 잰다", () => {
    const started = "2026-08-27T12:45:00+09:00";
    expect(elapsedPhrase(started, null, NOW)).toBe("약 15분 진행 중");
  });

  it("started 가 없으면 아무것도 모른다 — null", () => {
    expect(elapsedPhrase(null, null, NOW)).toBeNull();
    expect(elapsedPhrase(undefined, undefined, NOW)).toBeNull();
  });

  it("망가진 시각은 예외 없이 모름으로 접힌다", () => {
    expect(elapsedPhrase("not-a-date", null, NOW)).toBeNull();
    expect(elapsedPhrase("2026-08-27T12:00:00+09:00", "also-not-a-date", NOW)).toBeNull();
  });

  it("역전된 시각(완료가 착수보다 이름)은 모름으로 접힌다 — 음수 시간을 내지 않는다", () => {
    const started = "2026-08-27T13:00:00+09:00";
    const finished = "2026-08-27T12:00:00+09:00";
    expect(elapsedPhrase(started, finished, NOW)).toBeNull();
  });

  it("순수 함수 — 같은 인자는 같은 결과(호출 시각에 안 흔들린다)", () => {
    const started = "2026-08-27T12:48:43+09:00";
    const finished = "2026-08-27T13:06:12+09:00";
    const a = elapsedPhrase(started, finished, NOW);
    const b = elapsedPhrase(started, finished, "2030-01-01T00:00:00Z");
    expect(a).toBe(b); // finished 가 있으면 now 는 안 쓰인다
  });
});
