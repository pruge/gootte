import { useEffect, useId, useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";

/**
 * mermaid 다이어그램 1개 — mermaid 는 무겁다 → **dynamic import(lazy)** 로 뷰 모드에서만 로드(perf).
 * 문법 오류면 mermaid 내장 에러 그림(bomb) 대신 우리 안내 fallback. 테마는 mount 시점의 data-theme 반영.
 */
export function MermaidBlock({ code }: { code: string }) {
  const id = "mmd" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        // 저작 다이어그램은 밝은 classDef fill(#fde 등) + 어두운 글자 전제 → 앱 테마와 무관하게
        // 항상 light 렌더 + 흰 배경 카드(아래)로 고정해 가독성 보장(dark 테마의 밝은 글자 충돌 회피).
        mermaid.initialize({
          startOnLoad: false,
          theme: "default",
          securityLevel: "strict", // 내장 sanitize — 아래 dangerouslySetInnerHTML 안전
          suppressErrorRendering: true, // 문법 오류 시 mermaid 가 에러 다이어그램을 DOM 에 그리지 않게
        });
        // 선검증 — 실패면 render(에러 그림) 안 하고 우리 fallback. throw = 상세 메시지 확보.
        await mermaid.parse(code);
        const { svg } = await mermaid.render(id, code);
        if (alive) {
          setSvg(svg);
          setError(null);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "다이어그램 문법 오류");
      }
    })();
    return () => {
      alive = false;
    };
  }, [code, id]);

  if (error !== null) {
    return (
      <div className="doc-mermaid my-3 rounded-lg border border-border bg-surface-2 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-sm text-muted">
          <IconAlertTriangle size={15} className="shrink-0 text-accent" />
          다이어그램 문법 오류 — 원본 <span className="mono">docs/mermaid/</span> 파일 수정 필요
        </p>
        <details>
          <summary className="mono cursor-pointer text-xs text-muted">오류·원본 보기</summary>
          <pre className="mono mt-2 overflow-x-auto whitespace-pre-wrap text-xs text-muted">{error}</pre>
          <pre className="mono mt-2 overflow-x-auto rounded bg-surface p-2 text-xs text-fg">{code}</pre>
        </details>
      </div>
    );
  }
  if (svg === null) {
    return <div className="my-3 text-sm text-muted">다이어그램 렌더 중…</div>;
  }
  // mermaid strict 모드 산출 SVG(sanitize 내장) — 안전. 흰 배경 카드 = light 렌더 고정과 짝(가독).
  return (
    <div
      className="doc-mermaid my-3 overflow-x-auto rounded-lg border border-border bg-white p-4"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
