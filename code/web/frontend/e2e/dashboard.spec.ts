import { test, expect } from "@playwright/test";

// 여정: 로드 → 사이드바 → 프로젝트 선택 → plan → lineage 탭 → 테마 토글.
// 데이터 = backend 픽스처 alpha(supersede 2·drop 1, plan 비어있음).
test("대시보드 여정 — 목록→선택→탭→테마", async ({ page }) => {
  await page.goto("/");

  // 사이드바 자동발견 목록
  const alpha = page.getByRole("button", { name: /alpha/ });
  await expect(alpha).toBeVisible();

  // 선택 → URL ?p= + 헤더
  await alpha.click();
  await expect(page).toHaveURL(/[?&]p=alpha/);
  await expect(page.getByRole("heading", { level: 1, name: "alpha" })).toBeVisible();

  // plan 탭(기본) — alpha 는 ledger 없어 빈 상태
  await expect(page.getByText(/실행 가능한 이니셔티브가 없습니다/)).toBeVisible();

  // lineage 탭 → URL tab= + supersede 체인·drop verbatim
  await page.getByRole("tab", { name: "lineage" }).click();
  await expect(page).toHaveURL(/[?&]tab=lineage/);
  await expect(page.getByRole("heading", { name: /supersede 체인 \(2\)/ })).toBeVisible();
  // drop 영역 스코프 — resolvedBy verbatim("흡수")
  await expect(
    page.getByRole("region", { name: /drop/ }).getByText(/흡수/),
  ).toBeVisible();

  // 테마 토글 → data-theme 변화
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  await page.getByRole("button", { name: /테마/ }).click();
  await expect(html).not.toHaveAttribute("data-theme", before ?? "");
});
