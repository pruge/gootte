#!/usr/bin/env bash
# scripts/tauri-setup.sh — pnpm setup:tauri 진입점. macOS 에서 Tauri 셸을 **빌드할 준비**를 끝낸다.
#
# gootte 데스크톱 셸은 Rust(cargo) + Xcode Command Line Tools + tauri CLI + rustup target 이
# 필요하다. 이미 설치돼 있으면 건너뛰고(멱등), 없으면 Homebrew 로 채운 뒤 npm 의존성과
# 러스트 의존성까지 내려받는다. 관리대상 문서에는 한 글자도 쓰지 않는다(INV-2).
# 🔴 이것은 **설치가 아니다** — `.app` 을 빌드해 컴퓨터에 넣는 것은 `pnpm install:tauri`
# (`scripts/tauri-install.sh`) 가 한다(2026-09-01 이름 정리).

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC_TAURI="$ROOT_DIR/code/web/src-tauri"

echo "▶ gootte Tauri (macOS) 환경 준비 — $ROOT_DIR"

# ── 1) Xcode Command Line Tools ──────────────────────────────────────────────
if ! xcode-select -p >/dev/null 2>&1; then
  echo "▶ Xcode Command Line Tools 설치 중… (관리자 암호 요구 가능)"
  xcode-select --install
  echo "⚠ 설치 후 다시 이 스크립트를 실행하세요 (도구가 아직 준비 안 됨)"
  exit 1
fi
echo "✓ Xcode Command Line Tools: $(xcode-select -p)"

# ── 2) Rust (cargo/rustc) ────────────────────────────────────────────────────
if ! command -v cargo >/dev/null 2>&1 || ! command -v rustc >/dev/null 2>&1; then
  if command -v brew >/dev/null 2>&1; then
    echo "▶ Homebrew 로 Rust 설치 중…"
    brew install rust
  else
    echo "▶ rustup 으로 Rust 설치 중…"
    curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain stable
    # shell 로그인 이후 PATH 에 잡히도록 다음 줄에서 바로 사용
    export PATH="$HOME/.cargo/bin:$PATH"
  fi
fi
echo "✓ Rust: cargo $(cargo --version 2>/dev/null | awk '{print $2}') / rustc $(rustc --version 2>/dev/null | awk '{print $2}')"

# ── 3) rustup target (aarch64-apple-darwin, Apple Silicon) ──────────────────
if command -v rustup >/dev/null 2>&1; then
  # macOS 의 uname -m 은 arm64 를 주지만 rustup target 은 aarch64-… 다 — 매핑한다.
  ARCH_MACH="$(uname -m)"
  case "$ARCH_MACH" in
    arm64) ARCH_TARGET="aarch64-apple-darwin" ;;
    *)     ARCH_TARGET="$ARCH_MACH-apple-darwin" ;;
  esac
  if ! rustup target list --installed 2>/dev/null | grep -q "^$ARCH_TARGET$"; then
    echo "▶ rustup target $ARCH_TARGET 추가 중…"
    rustup target add "$ARCH_TARGET"
  fi
  echo "✓ rustup target: $(rustup target list --installed | tr '\n' ' ')"
fi

# ── 4) npm 의존성 (tauri CLI 포함) ──────────────────────────────────────────
if [ ! -d "$ROOT_DIR/code/web/node_modules/@tauri-apps/cli" ]; then
  echo "▶ pnpm 의존성 설치 중…"
  pnpm -C "$ROOT_DIR/code/web" install
fi
echo "✓ tauri CLI: $(pnpm -C "$ROOT_DIR/code/web" exec tauri --version 2>/dev/null || echo '설치됨')"

# ── 5) 러스트 의존성 (cargo check 로 fetch + 컴파일 확인) ───────────────────
echo "▶ 러스트 의존성 내려받기 및 검증(cargo check)…"
(cd "$SRC_TAURI" && cargo check 2>&1 | tail -3)

echo ""
echo "✅ Tauri 환경 준비 완료."
echo "   실행: pnpm dev:tauri        (디버그 셸)"
echo "   번들+설치: pnpm install:tauri  (.app 빌드 후 이 컴퓨터에 설치)"
