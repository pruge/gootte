import { describe, it, expect } from "vitest";
import { encodeDocView, decodeDocView } from "../src/components/features/docView";

describe("docView — 드로어에 연 문서를 URL view 파라미터에 싣는다(F8)", () => {
  it("featureSlug + path → 왕복", () => {
    const encoded = encodeDocView("auth-login", "spec.md");
    expect(encoded).toBe("auth-login/spec.md");
    expect(decodeDocView(encoded)).toEqual({ featureSlug: "auth-login", path: "spec.md" });
  });

  it("path 자체가 `/` 를 담아도(adr/0001-x.md) 첫 `/` 로만 나눈다", () => {
    const encoded = encodeDocView("auth-login", "adr/0001-x.md");
    expect(decodeDocView(encoded)).toEqual({ featureSlug: "auth-login", path: "adr/0001-x.md" });
  });

  it("null 이면 닫힌 상태", () => {
    expect(decodeDocView(null)).toBeNull();
  });

  it("`/` 가 없거나 어느 한쪽이 비면 해석하지 않는다", () => {
    expect(decodeDocView("")).toBeNull();
    expect(decodeDocView("no-slash")).toBeNull();
    expect(decodeDocView("/leading-slash")).toBeNull();
    expect(decodeDocView("trailing-slash/")).toBeNull();
  });
});
