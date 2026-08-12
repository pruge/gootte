/**
 * 카드 머리의 둘째 줄에 쓸 **설명문구** — spec 표제에서 앞에 겹쳐 붙은 기능 이름을 뗀다.
 *
 * 카드는 기능 이름과 설명을 두 줄로 나눠 보여주는데(캡틴 결정), 관리대상 표제가
 * `<기능 이름> — <설명>` 꼴인 경우가 많아 그대로 두면 같은 이름이 한 카드에 두 번 뜬다.
 *
 * 🔴 **떼는 것은 이름과 글자 그대로 같은 앞부분뿐이다.** 요약하지 않고 줄이지 않는다(INV-4).
 * 그래서 다음 규칙을 다 만족할 때만 뗀다:
 *
 * - 표제가 이름으로 시작하고,
 * - 그 뒤가 **공백 + 구분기호 + 공백** 이거나(`— – - :`) 표제가 이름으로 끝난다.
 *
 * 공백을 요구하는 것이 핵심이다 — `plan-board-extra` 는 `plan-board` 로 시작하지만
 * 그 뒤가 공백이 아니므로 손대지 않는다. 요구하지 않으면 다른 기능의 이름을 잘라
 * `extra — …` 라는 **없는 제목**을 지어내게 된다.
 *
 * 뗄 것이 없으면 표제를 **그대로** 돌려준다. 표제가 이름과 똑같으면 설명이 없다는 뜻이라
 * 빈 문자열이다 — 그때는 화면이 이름 한 줄만 그린다.
 */
export function featureDescription(title: string, slug: string): string {
  if (title === slug) return "";
  if (!title.startsWith(slug)) return title;
  const rest = title.slice(slug.length);
  const stripped = rest.replace(/^\s+[—–\-:]\s+/, "");
  return stripped === rest ? title : stripped;
}
