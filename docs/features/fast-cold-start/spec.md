# Specification — fast-cold-start

## Goal

- `/api/projects` 첫 호출 ~13초 → 두 번째 호출 15초 이내 <100ms (캐시 적중).
- 폴백 폴링 중에도 `projects` 스피너는 다시 돌지 않는다.
- 워밍 상태의 스피너는 한 번도 보이지 않는다.

## Scope

- `live.ts` 폴백 폴링: `projects` 쿼리 제외 + `FALLBACK_POLL_MS=15_000`.
- `projects` 무효화는 `kind === "projects"` ChangeEvent 만.

## 수용 조건

1. 폴백 폴링이 `projects` 쿼리 제외.
2. `projects` kind 의 ChangeEvent → `projects` 쿼리 무효화.
3. `pnpm -C code/web verify` green.
4. 스피너가 폴백 폴링으로 인해 다시 돌지 않음.
