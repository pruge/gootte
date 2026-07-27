import { useEffect, useId, useState } from "react";

/**
 * mermaid 다이어그램 1개 — mermaid 는 무겁다 → **dynamic import(lazy)** 로 뷰 모드에서만 로드(perf).
 * 렌더 실패(문법 오류 등)면 raw 코드로 fallback. 테마는 mount 시점의 data-theme 반영.
 */
export function MermaidBlock({ code }: { code: string }) {
  const id = "mmd" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        const dark = document.documentElement.getAttribute("data-theme") === "dark";
        mermaid.initialize({
          startOnLoad: false,
          theme: dark ? "dark" : "default",
          securityLevel: "strict", // 내장 sanitize — 아래 dangerouslySetInnerHTML 안전
        });
        const { svg } = await mermaid.render(id, code);
        if (alive) {
          setSvg(svg);
          setFailed(false);
        }
      } catch {
        if (alive) setFailed(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, id]);

  if (failed) {
    return (
      <pre className="mono my-3 overflow-x-auto rounded-lg bg-surface-2 p-3 text-sm text-fg">
        {code}
      </pre>
    );
  }
  if (svg === null) {
    return <div className="my-3 text-sm text-muted">다이어그램 렌더 중…</div>;
  }
  // mermaid strict 모드 산출 SVG(sanitize 내장) — 안전.
  return (
    <div className="doc-mermaid my-3 overflow-x-auto" dangerouslySetInnerHTML={{ __html: svg }} />
  );
}
