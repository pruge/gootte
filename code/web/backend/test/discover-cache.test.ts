import { describe, expect, test } from "vitest";
import type { Project } from "@gootte/contract";
import { clearDiscoverCache, getProjectsPayload } from "../src/discover-cache";

const fakeProject = (): Project[] => [{ slug: "x", path: "/x", copies: ["/x"] }];

describe("getProjectsPayload 캐시 키", () => {
  test("salt 가 캐시 키에 들어간다 — 같은 salt 는 히트, 다른 salt 는 리빌드", () => {
    clearDiscoverCache();
    let calls = 0;
    const build = (): Project[] => {
      calls++;
      return fakeProject();
    };
    getProjectsPayload(["/r"], build, "homeA"); // miss → 1
    getProjectsPayload(["/r"], build, "homeA"); // 같은 salt → hit → 1
    getProjectsPayload(["/r"], build, "homeB"); // 다른 salt → miss → 2
    getProjectsPayload(["/r"], build, "homeB"); // 같은 salt → hit → 2
    expect(calls).toBe(2);
  });

  test("salt 를 안 주면 빈 문자열로 취급(기존 동작 보존)", () => {
    clearDiscoverCache();
    let calls = 0;
    const build = (): Project[] => {
      calls++;
      return fakeProject();
    };
    getProjectsPayload(["/r"], build);
    getProjectsPayload(["/r"], build);
    expect(calls).toBe(1);
  });

  test("roots 가 바뀌면 리빌드(기존 동작 보존)", () => {
    clearDiscoverCache();
    let calls = 0;
    const build = (): Project[] => {
      calls++;
      return fakeProject();
    };
    getProjectsPayload(["/r1"], build, "homeA");
    getProjectsPayload(["/r2"], build, "homeA");
    expect(calls).toBe(2);
  });
});
