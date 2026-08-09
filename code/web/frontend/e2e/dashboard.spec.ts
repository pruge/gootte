import { test, expect } from "@playwright/test";

// 여정: 로드 → 사이드바 → 프로젝트 선택 → features 탭 → 테마 토글.
// 데이터 = backend 픽스처 alpha(docs/features/auth-login — 티켓 3장).
test("대시보드 여정 — 목록→선택→할일→테마", async ({ page }) => {
  await page.goto("/");

  // 사이드바 자동발견 목록
  const alpha = page.getByRole("button", { name: /alpha/ });
  await expect(alpha).toBeVisible();

  // 선택 → URL ?p= + 헤더
  await alpha.click();
  await expect(page).toHaveURL(/[?&]p=alpha/);
  await expect(page.getByRole("heading", { level: 1, name: "alpha" })).toBeVisible();

  // features 탭(기본) — 기능별 티켓 목록
  await expect(page).toHaveURL(/[?&]tab=features/);
  await expect(page.getByText(/auth-login/).first()).toBeVisible();

  // 테마 토글 → data-theme 변화
  const html = page.locator("html");
  const before = await html.getAttribute("data-theme");
  await page.getByRole("button", { name: /테마/ }).click();
  await expect(html).not.toHaveAttribute("data-theme", before ?? "");
});
