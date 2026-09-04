import { useEffect, useRef, useState } from "react";
import { IconFileText } from "@tabler/icons-react";
import type { Feature } from "@gootte/contract";
import { featureDocList } from "../plan/planDoc";

interface FeatureDocsButtonProps {
  feature: Feature;
  /** 고른 문서를 연다 — 여는 일은 각 탭이 이미 갖고 있는 `DocDrawer` 가 그대로 한다. */
  onOpen: (path: string) => void;
}

/**
 * 기능의 문서를 여는 아이콘 — `plan` 과 `steps` 가 **같은 것을 쓴다**(캡틴 지시 2026-09-04).
 *
 * 예전에는 아이콘이 `spec.md` **한 장만** 열었다. 그래서 `adr/`·`decisions-*.md` 같은 나머지
 * 문서는 `features` 탭에서 카드를 펼쳐야만 읽을 수 있었다. 이제 목록을 띄운다.
 *
 * - 문서 **0개** → 아이콘을 아예 안 그린다. 🔴 눌러도 아무 일 없는 버튼을 두지 않는다
 *   (조용한 무동작보다 없는 게 정직하다).
 * - 문서 **1개** → 목록 없이 곧장 연다(클릭 수가 늘지 않는다).
 * - 문서 **여러 개** → 목록을 띄우고, 고르면 그 자리에서 드로어가 열린다.
 *
 * 🔴 **새 문서 뷰어를 짓지 않는다** — 이 컴포넌트가 하는 일은 "어느 문서인가" 를 고르는 것까지고,
 * 읽고 그리는 일은 `DocDrawer` 하나가 계속 맡는다(탭도 옮기지 않는다).
 */
export function FeatureDocsButton({ feature, onOpen }: FeatureDocsButtonProps) {
  const docs = featureDocList(feature);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  // 바깥을 누르거나 ESC 를 누르면 닫는다 — 목록이 화면에 남아 다른 카드를 가리지 않게.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.stopPropagation(); // 🔴 드로어·대화상자의 ESC 보다 목록 닫기가 먼저다
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  if (docs.length === 0) return null;

  const only = docs.length === 1 ? docs[0]! : null;

  return (
    <div ref={boxRef} className="relative">
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (only) onOpen(only.path);
          else setOpen((v) => !v);
        }}
        aria-label={`${feature.slug} 문서 열기`}
        aria-haspopup={only ? undefined : "menu"}
        aria-expanded={only ? undefined : open}
        title={only ? `${only.name} 열기` : `문서 ${docs.length}개`}
        className="rounded p-1.5 text-muted hover:bg-surface-2 hover:text-fg focus-visible:outline-2 focus-visible:outline-accent"
      >
        <IconFileText size={17} stroke={1.6} />
      </button>

      {open && !only && (
        <div
          role="menu"
          aria-label={`${feature.slug} 문서`}
          className="absolute right-0 z-30 mt-1 max-h-72 w-64 overflow-y-auto rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          {docs.map((d) => (
            <button
              key={d.path}
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                onOpen(d.path);
              }}
              className="flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm text-fg hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span className="truncate">{d.name}</span>
              {/* 어느 폴더 것인지 — 같은 이름의 파일이 폴더마다 있을 수 있다. */}
              {d.dir && <span className="mono ml-auto shrink-0 text-xs text-muted">{d.dir}/</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
