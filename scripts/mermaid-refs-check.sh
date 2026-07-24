#!/usr/bin/env bash
# mermaid-refs-check.sh — docs/mermaid SoT drift-guard (cling 표준)
#
# 규칙(docs/mermaid/INDEX.md 규약):
#   ① 한 M-ID = docs/mermaid/ 에 정확히 1개 파일 (중복 금지)
#   ② 문서가 참조하는 모든 M-NNNN 이 정확히 1개 파일로 해소돼야 함 (깨진 링크 0)
# 참조는 승인 링크형 `…INDEX.md#M-NNNN` 만 카운트 → 맨 토큰(모터·도면 번호 등)과 충돌 안 함.
# Verify gate / `/cling:check` 에 배선. 위반 시 exit 1.
set -euo pipefail
cd "$(dirname "$0")/.."

MERMAID_DIR="docs/mermaid"
[ -d "$MERMAID_DIR" ] || { echo "ℹ️  $MERMAID_DIR 없음 — mermaid SoT 미사용, skip"; exit 0; }
fail=0

# ① ID 중복 (한 ID = 한 파일)
dupes=$(ls "$MERMAID_DIR" 2>/dev/null | grep -oE '^M-[0-9]{4}' | sort | uniq -d || true)
if [ -n "$dupes" ]; then
  echo "❌ 중복 M-ID 파일:"; echo "$dupes" | sed 's/^/   /'; fail=1
fi

# ② 참조 해소 — 승인된 링크 형식 `…INDEX.md#M-NNNN` 만
refs=$(grep -rhoE 'INDEX\.md#M-[0-9]{4}' docs --include='*.md' 2>/dev/null | grep -oE 'M-[0-9]{4}' | sort -u || true)
for id in $refs; do
  files=( "$MERMAID_DIR/${id}"-*.md )
  if [ -e "${files[0]}" ]; then n=${#files[@]}; else n=0; fi
  if [ "$n" -ne 1 ]; then
    echo "❌ $id → ${n} 파일 (정확히 1개여야 — rename/삭제 금지, INDEX 규약 참조)"; fail=1
  fi
done

if [ "$fail" -ne 0 ]; then
  echo "→ mermaid-refs-check 실패 (docs/mermaid/INDEX.md 규약)"
  exit 1
fi
echo "✅ mermaid-refs-check: 참조 무결 ($(echo "$refs" | grep -c . || echo 0) ID 참조)"
