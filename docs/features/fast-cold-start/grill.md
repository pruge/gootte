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
