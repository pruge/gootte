/**
 * 드로어에 연 문서를 URL `view` 파라미터에 싣는다 — `<featureSlug>/<기능 폴더 기준 경로>`(F8).
 * 새로고침하거나 링크를 넘겨도 같은 문서가 열린다(티켓 01 §설계 4).
 */

export interface DocView {
  featureSlug: string;
  path: string;
}

/** featureSlug 는 `/` 를 담지 않는 폴더명이라 첫 `/` 로 나눈다. */
export function encodeDocView(featureSlug: string, path: string): string {
  return `${featureSlug}/${path}`;
}

export function decodeDocView(view: string | null): DocView | null {
  if (!view) return null;
  const i = view.indexOf("/");
  if (i <= 0 || i === view.length - 1) return null;
  return { featureSlug: view.slice(0, i), path: view.slice(i + 1) };
}
