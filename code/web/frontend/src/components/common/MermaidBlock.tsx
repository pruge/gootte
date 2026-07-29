import { useEffect, useId, useState } from "react";
import { IconAlertTriangle } from "@tabler/icons-react";

const isDarkNow = (): boolean =>
  typeof document !== "undefined" &&
  document.documentElement.getAttribute("data-theme") === "dark";

/**
 * mermaid 다이어그램 1개 — dynamic import(lazy, perf). **앱 테마(data-theme)를 감지**해
 * mermaid 순정 테마로 렌더(light=default / dark=dark, chirpy 방식)하고, 토글 시 재렌더한다.
 * 저작 다이어그램은 classDef 에 `color:` 를 병기해 두 테마 모두 가독(문법 안전 지침).
 * 문법 오류면 mermaid 에러 그림(bomb) 대신 안내 fallback.
 */
export function MermaidBlock({ code }: { code: string }) {
  const id = "mmd" + useId().replace(/[^a-zA-Z0-9]/g, "");
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dark, setDark] = useState(isDarkNow);

  // 앱 테마(data-theme) 변경 추적 → dark 갱신 → 아래 렌더 effect 재실행(자동 변환).
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.getAttribute("data-theme") === "dark");
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ["data-theme"] });
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict", // 내장 sanitize — 아래 dangerouslySetInnerHTML 안전
          suppressErrorRendering: true, // 문법 오류 시 mermaid 가 에러 다이어그램을 DOM 에 그리지 않게
          theme: dark ? "dark" : "default", // 순정 테마(chirpy 동형)
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
  }, [code, id, dark]);

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
  // mermaid strict 모드 산출 SVG(sanitize 내장) — 안전. 카드 배경 = 테마별(순정 렌더와 짝).
  return (
    <div
      className="doc-mermaid my-3 overflow-x-auto rounded-lg border border-border p-4"
      style={{ background: dark ? "#1b1e24" : "#ffffff" }}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
