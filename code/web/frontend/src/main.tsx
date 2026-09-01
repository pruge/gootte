import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { ThemeProvider } from "./theme/ThemeProvider";
import { makeQueryClient } from "./lib/query";
import { useLiveSync } from "./lib/live";
import { ToastProvider } from "./lib/toast";
import { App } from "./App";
import "./styles/global.css";

/** WS 실시간 구독을 켠 뒤 자식 렌더 (2b) — 파일 변경 → 자동 invalidate. */
function LiveSync({ children }: { children: ReactNode }) {
  useLiveSync(useQueryClient());
  return <>{children}</>;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root 없음");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={makeQueryClient()}>
      <ThemeProvider>
        <ToastProvider>
          <LiveSync>
            <App />
          </LiveSync>
        </ToastProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
