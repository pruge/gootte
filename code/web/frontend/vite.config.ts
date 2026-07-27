import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** frontend dev = vite(:5304), backend(:8804) 프록시. prod = backend가 정적 서빙(same-origin). */
// 포트 = cling 글로벌 레지스트리 배정(main 밴드). worktree 는 /cling:worktree 가 매니페스트로 밴드 격리 주입.
const BACKEND = process.env.VITE_BACKEND_URL ?? "http://localhost:8804";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5304,
    proxy: {
      "/api": { target: BACKEND, changeOrigin: true, ws: true }, // ws:true = WS /api/live 업그레이드 프록시(2b)
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    css: false,
    exclude: [...configDefaults.exclude, "e2e/**"], // e2e = Playwright, vitest 제외
  },
});
