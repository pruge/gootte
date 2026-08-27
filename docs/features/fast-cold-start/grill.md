# fast-cold-start

## 실측

- 캡틴의 첫 화면이 `projects` 목록을 받기까지 12-15초가 걸렸습니다(콜드/워밍 첫 호출). 사용자는 스피너만 보게 됩니다.
- 5초 주기 폴백 폴링이 `projects` 까지 invalidate 하니 13초짜리 요청이 또 큐에 쌓여 forever spinning 으로 이어졌습니다.

## 결정

- 폴백 폴링에서 `projects` 쿼리 제외.
- `FALLBACK_POLL_MS` 5000 → 15000.
- `projects` 는 doc change event 로만 무효화.

## 출처

- T02: [#88](https://github.com/pruge/gootte/pull/88)
- T01: 캐시 도입 (실측 동일, 같은 슬라이스에서 종속)

## Comments

- 2026-08-27 — 캡틴 지시로 방향이 확장됐다: TTL 폐기(값을 버리고 재계산)가 아니라 **영구
  스냅샷 + git 위치 스탬프 검증 + 감시 중 증분 반영**. 결정 기록은
  [adr/0001](adr/0001-git-stamped-persistent-snapshot.md), 다시 쓰인 명세는 [spec.md](spec.md).
  위 결정 중 "TTL 폴백 폴링과의 정합" 은 유지되고, 나머지는 T03~T07 로 갈아 엎였다.
