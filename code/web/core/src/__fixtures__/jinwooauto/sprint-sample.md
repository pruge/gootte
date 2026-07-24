---
created: 2026-06-26
status: pending           # pending | in_progress | done
priority: normal          # 묶인 todo max
kind: bundle              # single | bundle
todos: [2026-06-25-auth-throttle-per-account, 2026-06-25-auth-device-bound-token, 2026-06-25-auth-phone-possession-verify]
worktree: null            # /cling:worktree 가 박음
related_sprints: []
---

# auth-hardening — 로그인 자격 도용·무차별 대입 방어 3종 (throttle / device-bound / phone-possession)

> 🕒 **사용자 지정: 개발 막바지 진행 (2026-06-26)** — 지금 착수 X, 계획만 확정. 사유 = phone-possession 실 SMS·실번호 검증이 dev 불가(출시 전 실번호로만), device-bound 도 사용자가 "막바지" 지정. 다른 기능 개발이 거의 끝난 뒤 이 sprint 로 `/cling:worktree auth-hardening`. (3 todo 는 in_sprint 로 묶여 다음 `/cling:sprint` 추천에서 제외됨.)

> 묶음. 1 worktree = 1 sprint. "휴대폰번호+4자리 PIN 만 알면 어느 단말서든 로그인" 경로를 세 축으로 막는다 — ① 분산 무차별 대입(계정 단위 throttle), ② 단말 결속(device secret), ③ 번호 소유 증명(OTP). 같은 auth 코드 경로(`handlers/auth.ts`·`lib/rate-limit.ts`·`lib/crypto.ts`).

## scope
- `2026-06-25-auth-throttle-per-account` (normal) — login throttle bucketKey 가 IP-only → **계정(phoneIdx) 단위 병행**. IP 회전 + 단일 계정 타깃 분산 공격 차단. **지금 완전 구현·테스트 가능**.
- `2026-06-25-auth-device-bound-token` (low) — 가입(activate) 시 단말별 unique secret 발급(DB 해시 + 단말 secure storage), 로그인에 동봉·검증. 번호+PIN 만으론 로그인 불가. **backend 구현·테스트 가능 / app 양쪽(operator·inspector) secure storage 저장**.
- `2026-06-25-auth-phone-possession-verify` (low) — 가입·신규단말 시 휴대폰 실번호 소유 증명(SMS OTP). **🔴 실 SMS 공급자·실번호 검증은 dev 에서 불가(사용자 명시 "출시 막바지") → 이 sprint 는 OTP 챌린지 인프라·플로우 scaffold + device-bound 결합 설계까지. 실 발송 연동은 배포 막바지로 분리.**

## 🔴 Invariant 점검 (프로파일 Invariants 중 이 sprint 에 걸리는 것 — 없으면 "없음")
- **없음** — 세 todo 전부 REST 엔드포인트(`handlers/auth.ts`·`activate.ts`). 실시간 Wss codegen 계약(INV-5/6)·gateway/PLC(INV-1~4)·측창 상태(INV-7/8) 무관. (각 todo 본문 "INV 무관(REST)" 명시.) 단 보안 변경이라 verify gate 의 `:backend typecheck` + backend 단위테스트로 회귀 보증.

## 묶음 근거 (bundle)
- **dependency / 통합 설계**: device-bound-token ↔ phone-possession-verify 가 서로 `related:` 로 결합 — "신규 단말 = OTP 로 소유 증명 → device secret 재발급, 기존 단말 = device secret 검증". 따로 설계하면 신규단말 재등록 flow 가 두 번 갈라짐. 한 sprint 통합이 UX·구현 효율적.
- **shared-area**: 셋 다 `handlers/auth.ts`(farmerLogin/engineerLogin)·`lib/rate-limit.ts`(throttle 재사용 — OTP 발송/검증에도)·`lib/crypto.ts`(hashPin 패턴 = deviceCode/OTP 해시 저장 재사용) 동일 파일군 수정. 병렬 worktree 면 머지 충돌.
- **related 삼각**: 세 todo frontmatter 가 서로 `related:` 명시(throttle ↔ device ↔ phone).

## 작업 path (예상 phase)
> 순서 = **지금 완전 검증 가능한 것 먼저**. Phase 1 단독으로도 보안 ROI 최대(PIN 무차별 방어).

### Phase 1 — 계정 단위 throttle (완전 구현·테스트)
- `lib/rate-limit.ts` — IP scope 외 **account scope 병행**(bucketKey=phoneIdx). 정책 = **`IP+phoneIdx` 복합 키 또는 계정 단위 점증 지연(soft throttle)** — 하드 잠금은 lockout DoS(타인이 피해자 계정 잠금) 위험이라 회피. (→ §다음 단계 결정 필요)
- `handlers/auth.ts` — `farmerLogin`/`engineerLogin` throttle 호출부에 account scope 추가. 적용 범위(login/engineer-login + activate/admin-login 여부) 결정.
- `:backend` 단위테스트 — account-scope 누적/리셋/한도(IP 고정·phoneIdx 회전 / 반대) + lockout DoS 미발생 검증.

### Phase 2 — device-bound secret (backend + app secure storage)
- `handlers/activate.ts` — 활성화 시 server random secret 생성 → 응답으로 단말 전달 + **DB 해시 저장**(평문 X, hashPin 패턴). 신규 테이블 vs `DeviceToken`(FCM용) 확장 결정.
- `handlers/auth.ts` — 로그인 요청에 deviceCode 동봉 → phoneIdx+PIN+deviceCode 3중 검증(새 JWT 발급 게이트). 이후 요청은 JWT(전 요청 deviceCode 헤더는 YAGNI).
- migration(신규 테이블/컬럼) + `:backend` 테스트.
- `app/operator`·`app/inspector` — 활성화 응답 secret → Android Keystore/EncryptedPrefs 저장, 로그인 동봉. (양쪽 동형, `:domain` 순수로직 추출 가능분만 테스트.)

### Phase 3 — phone-possession OTP scaffold (실 발송 분리)
- OTP 챌린지 D1 테이블(코드 해시·TTL·시도수) + 발송/검증 엔드포인트 **scaffold**. throttle(`rate-limit.ts`) 재사용(재발송·검증 한도).
- **신규단말 결합 설계**: 등록된 device secret 있으면 OTP 생략, 없으면(새 단말) OTP → device secret 재발급. Phase 2 와 한 flow 로.
- **🔴 실 SMS 공급자 연동(알리고/Toast/Twilio)·실번호 대조 검증·발송비·실 OTP E2E 는 이 sprint 밖** — dev 에서 실번호 불가(사용자 명시). 공급자 인터페이스는 stub/mock 으로 두고 막바지 todo 로 분리.

## 다음 단계 결정 필요
- **throttle 정책 (Phase 1)** — 계정 단위를 (a) `IP+phoneIdx` 복합 bucketKey, (b) 계정 단위 점증 지연(잠금 X), (c) 계정 잠금 + 바인딩된 deviceId 예외 중? **권장 = (a) 또는 (b)** (lockout DoS 회피). 적용 범위 = login/engineer-login 만 vs activate/admin-login 포함?
- **device secret 저장소 (Phase 2)** — 신규 테이블 vs `DeviceToken`(FCM 전용) 확장? **권장 = 신규 테이블**(목적 분리, FCM ≠ auth secret).
- **신규 단말 재등록 (Phase 2↔3 결합)** — 단말 교체/재설치 시 device secret 부재 → 농가코드 재입력 vs OTP 소유 증명 후 재발급? **권장 = OTP 재발급**(Phase 3 결합) — 단 실 OTP 가 막바지라 이 sprint 는 "OTP 통과 가정" 스텁으로 flow 만 닫음.
- **phone-possession 실 구현 분리 확정** — 위 §scope/Phase 3 대로 scaffold 까지만, 실 SMS 연동은 별 todo(배포 막바지)로 떼는 것 OK 인지(머지 시점 재확인).

## 완료 기준
- `auth-throttle-per-account` 완료: `pnpm --filter @jinwoofarmcare/backend typecheck` green + 계정-scope throttle 단위테스트 green(누적/리셋/한도/ lockout-DoS 미발생). **이 sprint 의 핵심 deliverable.**
- `auth-device-bound-token` 완료: backend typecheck green + device secret 발급·해시저장·로그인 검증 단위테스트 green + migration 적용; operator·inspector `verify:android:*`(`:domain:test` + `:app:hiltJavaCompileDebug`) green(secure storage 저장·로그인 동봉 배선).
- `auth-phone-possession-verify` 완료(이 sprint 한정): OTP 챌린지 테이블 migration + 발송/검증 엔드포인트 scaffold + 신규단말 결합 flow 가 stub 공급자로 typecheck·테스트 green. **실 SMS 연동·실번호 E2E 는 완료 범위 밖(막바지 todo 로 분리)** — 머지 보고에 명시.
- 전체 회귀: 정상 로그인(operator 농가주·inspector 엔지니어) 회귀 무손상 — 휴대폰+PIN(+신규 device secret) 로그인 성공, throttle 한도 도달 시 차단/지연, 기존 단말 재로그인 정상. `pnpm run verify` (backend typecheck + 변경 app verify) green.

## 사용자 테스트
> 생성 시 비움. `/cling:worktree` 가 개발 완료 보고(verify green, `worktree-end` 호출 *전*) 때 `/cling:notify --all` 출력(실행 명령 + ✅ 가시 확인)을 worktree 안에서 이 섹션에 기록한다.

## 관련 todo / spec
- [auth-throttle-per-account](../todo/2026-06-25-auth-throttle-per-account.md) — IP-only → 계정 단위 throttle 병행
- [auth-device-bound-token](../todo/2026-06-25-auth-device-bound-token.md) — 단말 결속 secret 발급·검증
- [auth-phone-possession-verify](../todo/2026-06-25-auth-phone-possession-verify.md) — 휴대폰 실번호 소유 증명(OTP, 실연동 막바지 분리)
- 보안 SoT: `handlers/auth.ts`(generic 401 oracle 차단)·`lib/crypto.ts`(PBKDF2 100k) 와 동류 auth hardening
