import { describe, expect, it } from "vitest";
import { formatBytes } from "../src/lib/bytes";

describe("formatBytes", () => {
  it("잴 수 없으면 확인 불가", () => {
    expect(formatBytes(null)).toBe("확인 불가");
    expect(formatBytes(undefined)).toBe("확인 불가");
  });
  it("바이트 단위", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
  });
  it("KB·MB·GB", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1048576)).toBe("1 MB");
    expect(formatBytes(104577992)).toBe("99.7 MB");
    expect(formatBytes(1073741824)).toBe("1 GB");
  });
});
