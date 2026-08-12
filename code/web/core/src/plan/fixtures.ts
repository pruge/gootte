import type { Feature, Placement } from "@gootte/contract";

/**
 * 판 테스트가 함께 쓰는 픽스처 — `board.test.ts`(02)와 `move.test.ts`(03)가 **같은 모양의 기능**을
 * 본다. 판정 자리가 하나뿐이므로(spec §판정 자리는 하나뿐) 그것을 재는 픽스처도 하나면 된다.
 *
 * 🔴 테스트 전용이다 — 패키지 barrel(`plan/index.ts`)에 싣지 않는다.
 */
export function feature(slug: string, tickets: string[] = []): Feature {
  return {
    slug,
    title: `${slug} — 제목`,
    status: "pending",
    sourceStatus: "draft",
    statusKnown: true,
    docs: [],
    tickets: tickets.map((num) => ({
      num,
      slug: `${num}-x`,
      title: `티켓 ${num}`,
      status: "pending",
      sourceStatus: "draft",
      statusKnown: true,
      blockedBy: [],
      unreadableBlockedBy: [],
      waitingOn: [],
      startable: true,
      workedBy: [],
      needsCaptainEye: false,
    })),
  };
}

export const row = (
  featureSlug: string,
  area: Placement["area"],
  seq = 0,
  closedAt: string | null = null,
): Placement => ({ feature: featureSlug, area, seq, closedAt });
