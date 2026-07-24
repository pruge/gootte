const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳";

/** 1..20 → 원문자, 그 외 = `N.`. plan 순서 표시(서버 order 값 그대로). */
export function circled(n: number): string {
  return n >= 1 && n <= 20 ? CIRCLED[n - 1]! : `${n}.`;
}
