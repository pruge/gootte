import { defineConfig, configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

/** frontend dev = vite(:5304), backend(:8804) 프록시. prod = backend가 정적 서빙(same-origin). */
// 🔴 dev 포트의 SoT 는 code/web/.ports.* + scripts/ports.sh 다 — scripts/dev-frontend.sh 가
// CLI --port 와 VITE_BACKEND_URL 로 아래 값을 덮어쓴다. 여기 리터럴은 그 파일이 담은 main 값의
// 사본일 뿐이니, 포트를 바꿀 때는 code/web/.ports.main 을 고친다.
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
