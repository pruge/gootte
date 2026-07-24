# 이니셔티브 원장 (INDEX) — 얇은 색인 (v2)

> **SoT 규율 = `.cling/profile.md` `## Initiative ledger` (프레임워크 profile-template).**
> 이 파일은 **색인만** — 상세(할일·supersede·이력)는 각 `docs/roadmap/<feature>/ledger.md` 가 소유한다.
> 여기서 답하는 것 셋: ① **순서**(Now/Next) · ② **롤업 상태**(트랙표) · ③ **supersede 체인**(색인 → 소유 ledger).
>
> **왜 얇은가** — 옛 monolith INDEX(212줄)는 이니셔티브 상세를 다 담아 단조 증가하고 "이 이니셔티브 진척"을 한눈에 못 봤다. v2 = 상세를 폴더 조각(`ledger.md`)으로 내리고 INDEX 는 링크·순서·상태만. (2026-07-08 전환.)
>
> **갱신 규율** — `/cling:kickoff` 이 새 이니셔티브 시 `<feature>/ledger.md` 생성 + 여기 3파트에 한 줄씩. `/cling:todo` 는 todo 를 자동분류해 소속 ledger 체크리스트에 append(orphan 0). `/cling:worktree-end`·`todo ship` 은 done 시 소속 ledger 체크리스트 tick + 이력 append. `/cling:sprint` 는 아래 Now/Next 순서를 존중.
>
> **🔴 roadmap = 단일 추적면** — 모든 활성 todo 가 어떤 `<feature>/ledger.md` `## 할일` 에 나타난다. roadmap 만 보면 전 작업 추적. 완결 이니셔티브도 폴더에 `ledger.md`(이력) 잔류.

상태: ✅ shipped · 🔜 active(pending todo 有) · ⬜ planned(spec/todo 만) · ⚫ superseded · (legacy = 출하된 living-spec)

---

## 🎯 Now / Next — 활성 전선 (이 순서로)

> 의존 충족 + priority 정렬. `/cling:sprint` 이 여기서 추천. 상세·잔여 할일 = 각 ledger `## 할일`.
> **형식** = 전선당 헤더 줄 + `-` sub-bullet(설명 · 활성 todo · 의존) — 한 줄 나열 금지(가독성).

1. **[control-execution-role-separation](control-execution-role-separation/ledger.md)** 🔜 — **알고리즘 플랫폼 백지 재설계 (2026-07-10 · foundational · Track C)**
   - 북극성 = **알고리즘=데이터(앱·게이트웨이 재빌드 없이 즉시 적용).** 기존 제어/FSM 코드·계약(T1~T9 서브클래스-탑·구 라이브배선) **전량 배제**, 단일 `RealtimeStore` 위 처음부터. one form `AuthoredFsm`(config)+범용 인터프리터+**verb=state**+**FSM→FSM 합성(잎=BasicFSM)**+store 4 seam.
   - **활성 전선 = A `authored-fsm-contract` → B `universal-fsm-interpreter-core` → C `basicfsm-e2e-live`** (design §14). 티어 basic⊂master⊂측창(+calc). 빌더 UX·안전 override 전략 = 별 이니셔티브(빌더 kickoff·schedule-safety-fsm).
   - supersede = 구 design.md(D1~D28)·ADR 0001~0005(→ `adr/_superseded/`) · positional-control-blocks ADR-0005 · `positional-orchestration-refire`. 설계 SoT = [design-algorithm-platform.md](control-execution-role-separation/design-algorithm-platform.md)
   - 🔻 **operator FSM 제어(C 의 스페이스 부분, deferred)** = [space-realtime-store](space-realtime-store/ledger.md) ✅ **완결·archived 2026-07-12** (스페이스 농가단위→realtime store + operator `space`×`fsm_state` 조인 렌더/명령발신 실증). 실 코일 구동 갭은 [plc-terminal-coil-wire](plc-terminal-coil-wire/ledger.md) ✅ archived 로 해소.
   - 🔻 **범용 알고리즘-매핑 플랫폼** = [mapping-platform-restore](mapping-platform-restore/ledger.md) ✅ **완결·archived 2026-07-13** (T1계약·T2backend·T3admin UI·T4gateway) — 알고리즘 정본(측창)→하우스 매핑(전용/공유)→materialize→AuthoredFsm→gateway 인스턴스화 e2e. 상세 = [INDEX-archive](INDEX-archive.md). 하류 실 reuse-coil 구동 = ⓑ 아래.
   - 🔻 **E(측창 알고리즘)** = [sidewindow-authored-fsm](sidewindow-authored-fsm/ledger.md) ✅ **완결·archived 2026-07-14** (Model A 순수 범용 매핑 — 측창 = `sidewindow-core` 템플릿 1개, **3 state 시간-파생 + state 내부 TON/TOFF FB make/break**(어휘 ADR-0007 이 delayFsm 대체), 측창-전용 인프라 전량 은퇴 ADR-0004). T1·T-α0·T-α·T-β·T-γ·T-δ 전부 done. 상세 = 소유 [ledger.md](sidewindow-authored-fsm/ledger.md). SoT = [positional-drive-model.md](sidewindow-authored-fsm/positional-drive-model.md)·[form §7](control-execution-role-separation/form-capabilities-and-tooling.md).
   - 🔻 **E-Slice II(공유버스 조율)** = [shared-resource-coordination](shared-resource-coordination/ledger.md) ✅ **완결·archived 2026-07-16** (범용 조율 계층 T1~T13 — coordinator 티어·측창 공유버스=인스턴스 #1·데이터 규칙 범용화 ADR-0005·대기 UX·stagger). 상세 = [INDEX-archive](INDEX-archive.md).
   - 🔻 **D(빌더 UX) = [fsm-authoring-builder](fsm-authoring-builder/ledger.md) ✅ 완결 2026-07-19 (T1~T6 done — 엔진·저작 코어)** — design §14 "빌더 UX = 별 kickoff" realize. 저작 **UI** = D′(fsm-builder-canvas-ux) 로 계속. admin 이 AuthoredFsm 을 **슬롯 로직으로 UI 저작**(상태·출력·delay·전이·when) → D1 → 기존 매핑 재사용 e2e. 로직/바인딩 분리(ADR-0001)·저작 IR D1 SoT(0002)·출력 when(0003)·positional 커널 비저작(0005). Phase 1(저작 코어) spec ✅ TBD 제로. T1(출력 when 계약)·T3(D1 저장) ✅ done(`9577049f`). 구조 = [그림 M-0032](../mermaid/INDEX.md#M-0032). ESP32 정밀 executor = 별 이니셔티브 defer(0006).
   - 🔻 **D′(FSM 스튜디오 UI) = [fsm-builder-canvas-ux](fsm-builder-canvas-ux/ledger.md) 🔜 (PLC-IDE 확정 2026-07-18 · ADR-0008 · 단일 SoT 정리)** — fsm-authoring-builder 엔진(done) 위 **UI**. **PLC IDE 처럼 한 화면 저작→빌드→배포→모니터**: 폴더 트리(농가⊃프로젝트⊃사이트=GW⊃{콘트롤함→보드→제품[기존DB 무변경] + 프로그램→FSM[신규·사이트별]}) + 프로그램 무한 캔버스 + 통합 툴바. 배포=사이트 프로그램→그 게이트웨이 1:1. **done**: UX-1/2/3(셸·편집기·scope)·RX-1/2/3(트리·프로그램모델·**ReactFlow 캔버스·FB저작·자동저장·레이아웃**). RX-4 배포·RX-5 모니터 = 생존. 이전 area-탭·"블록"·프로젝트=농가 = 폐기(ADR-0004 superseded).
   - 🔻 **D″(loop-단일 모델 재설계) = [fsm-loop-authoring-model](fsm-loop-authoring-model/ledger.md) 🔜 (kickoff 2026-07-19 · 빅뱅)** — FSM 저작·실행 모델 **전면 재설계**(구 precompute/derive 완전 제거). 명령=state·값·**loop 엣지 단일** 전이, 상태 내부 = primitive(**CALC**·TON/TOFF, context=피연산자 자동), 조율 = 단일-state **범용 accept 게이트**(고정 tool 폐지), tick 순서 state→edge, verb/direction 제거, 위치소유 gateway→FSM. **감사 seam**(actorId passenger + 단일 실행확정점) 흡수. **Sub1**(모델·엔진·측창 재저작) ✅ **완결**(T1-T7, 2026-07-19 — 계약·엔진 빅뱅·backend). Sub2 저작 UI = 아래 · Sub3 operator UI = 후속. supersede = ADR-0005(positional 비저작)·3-메커니즘·RX-3 저작 모델(부분). 설계 SoT = [design-command-flow.md](fsm-builder-canvas-ux/design-command-flow.md) · 구조 [M-0033](../mermaid/INDEX.md#M-0033).
   - 🔻 **D‴(loop-단일 저작 UI) = [fsm-loop-authoring-ui](fsm-loop-authoring-ui/ledger.md) ✅ 완결·archived 2026-07-24 (Ⓐ state·Ⓑ edge·Ⓒ CALC linear·tFull·Ⓓ 검증 4/4)** — Sub1 위 **FSM 저작 UI**: state/edge 저작 · CALC linear·tFull 정제(계약+엔진+backend) + CALC positional 속성창(측창 저작) · 검증 피드백 인라인 + 자동저장 게이팅(INV-9). 부산물 = 저작 cascade·미리보기 충실도(입력포트·HOLD)·**coil when-실패=skip 정정**(ADR-0002 rule3). 조율 accept-gate 편집기 = 별 sub. 구조 [M-0034](../mermaid/INDEX.md#M-0034). 상세 = [INDEX-archive](INDEX-archive.md).
   - 🔻 **D⁗(가상 FSM 컴포지션) = [virtual-fsm-composition](virtual-fsm-composition/ledger.md) ✅ 완결 2026-07-20 (T1~T4 4/4)** — 닫힌 state 묶음을 marquee로 **실 sub-FSM 추출**(state 이동·`parentFsmId`) + **여러 FSM을 한 캔버스에 함께 인라인 렌더**(적재기 공정1~7 모니터링·관점의 집합). 삭제=부모로 원복. T3 멀티-FSM 캔버스(`74589b03`)로 완결. 구조 [M-0035](../mermaid/INDEX.md#M-0035).
   - 🔻 **D⁵(FSM-as-FB · 실행가능 저작) = [fsm-as-fb](fsm-as-fb/ledger.md) ✅ 완결·archived 2026-07-21 (T1~T5)** — 저작 device-direct 바인딩 + `fb:subfsm` embed → gateway invoke 런타임 + preview 드라이런. Phase A(T1 계약·T2 스튜디오·T3 preview `20b1d7f9`) · Phase B(T4 gateway invoke·T5 backend materialize+subFsmLibrary `8848cbe2`). golden 동치(gateway 엔진=TS preview 인터프리터). 앵커=BLINK. **downstream = fsm-builder-canvas-ux RX-4(배포)·RX-6(preview) 선행**(흡수 아님, 그 이니셔티브 ledger 가 추적). 구조 [M-0036](../mermaid/INDEX.md#M-0036). 상세 = [INDEX-archive](INDEX-archive.md).
   - 🔻 **D⁶(통합 제어 IDE) = [studio-unified-control-ide](studio-unified-control-ide/ledger.md) 🔜 (kickoff 2026-07-21 · 저작 IDE 수렴)** — 저작도구가 실배포·테스트까지 잡으며 node 생성·매핑·preset·space 가 스튜디오로 수렴. **web ⊥ 스튜디오**(web=admin+owner read/monitor · 스튜디오=제어 저작·배포·테스트) + 사이트 밑 **5-way 트리**(제어함/Node/프리셋/스페이스/스캔). 실측 = House=node-spine realization(범용 축=Node/space) · 코일 write 유일경로=OutputManager("직접 deviceId" 안전경로 부재→모든 조작=엔진 FSM). 6 sub-system 에픽, **Phase 1 = S0 트리+S1 제어함 CRUD+F4 경계**(3 todo, web-only). 부분 supersede = fsm-builder-canvas-ux ADR-0008 §1 2-way 트리. 수렴 = owner-space·timed-preset·algorithm-device-selection·schedule-safety-fsm. 구조 [M-0037](../mermaid/INDEX.md#M-0037).
   - 🔻 **D⁸(배포 인스턴스 왕복 + 온라인 정체성) = [studio-deploy-instance-confirm](studio-deploy-instance-confirm/ledger.md) ✅ 완결·archived 2026-07-21 (T1·T2·T3)** — 정체성 갭(authored id ≠ runtime fsmId) 해소 → 스튜디오 온라인이 실 게이트웨이와 실제 동작. T1 backend 정체성 resolver+device-direct authz(`e98a1c15`) · T3 온라인 read/command runtime fsmId 배선[+sub-FSM 상태·dead-reckoning progress·툴바 2버튼, T5 흡수](`19db8068`) · T2 배포 진행형 3단계 dialog(`267146dd`). 상세 = [INDEX-archive](INDEX-archive.md) · 구조 [M-0040](../mermaid/INDEX.md#M-0040).
   - 🔻 **D⁷(스튜디오 RealtimeStore) = [studio-realtime-store](studio-realtime-store/ledger.md) 🔜 (kickoff 2026-07-21 · Track F · 온라인 모니터 실현)** — 미리보기를 **소스 전환형**으로 확장 = 온라인 모니터(가상=로컬 인터프리터 / 온라인=실 게이트웨이 store). operator 처럼 웹에 **단일 RealtimeStore(WSS)** 신설 — 읽기(fsm_state·coil 델타)·명령(fire-once→엔진 INV-9) 통일. realtime-store-symmetric-sync 코어(INV-12)를 **웹 노드로 확장**(순수 코어 공유 패키지 승격 ADR-0001) + admin WSS 엔드포인트·query-token 인증(HttpOnly 우회 ADR-0002)·farm 라우팅(ADR-0003) + **데스크탑 분리 ConnectionProvider seam**(ADR-0004, 코어/facade 무변경·provider만 교체). **teardown-first(B)**: rx5 REST 폴링 읽기 삭제 후 store 구축. 6 todo(T0 teardown → T1 코어패키지 ∥ T2 admin WSS → T3 facade/provider → T4 읽기 → T5 명령). supersede = fsm-builder-canvas-ux RX-5 REST 읽기(부분·UI셸/배포수정 생존). 구조 [M-0038](../mermaid/INDEX.md#M-0038).
   - 🔻 **D⁹(FSM IO 인터페이스 + 입력 read 범용화) = [sensor-collect-fb](sensor-collect-fb/ledger.md) 🔜 (설계 캡처 2026-07-22 · Phase 1 분해 · studio-unified P3.5 실체화)** — 저작 FSM **IO 인터페이스 통일**(포트 in/out + parameter=내부 const, ADR-0001) + **입력 = `read` 통일**(coil의 대칭, 센서 FC04·접점 FC02, 관측 모델 ADR-0002) + **read-spec = 제품 catalog capability**(측정집합=transport-독립, 추출=binding: Modbus decode[]/ESP32 keymap, ADR-0003) + **소비 = `link` FB**(store→ctx) + **발행 `emit`**(ctx→store, 애니/sync)(storeResolver `{null}` 배선, ADR-0004). 실측: 출력만 catalog 범용화·센서는 `SensorAddresses`/`TempHumidReading` 하드코딩·`TransportDriver` seam은 이미 Modbus/Tuya 다형(센서만 우회). **컴파일 타깃-무관 IO(ADR-0005)**: port·decode=타깃무관 데이터 / driver=타깃별(gateway 버스·ESP32 로컬핀) / 크로스노드=store — 500ms 빠른입력 해방 = **ESP32 엣지 FSM = downstream 별 이니셔티브**(fsm-authoring-builder ADR-0006). 앵커=D코일(지연코일 FB). 승계 = studio-unified [ADR-0007](studio-unified-control-ide/adr/0007-sensor-read-fb-deferred.md)(예약). **통일 모델(2026-07-22 · ctx-only): FSM은 ctx만 읽음 — store 통로 3 FB(`read` device→store · `link` store→ctx · `emit` ctx→store 발행/애니·sync) + 명령(do.set)+calc가 ctx 채움 · 정보수집 FSM=1-state · SensorMonitor 자동폴 제거** — 가/나·DeviceReadout arm·store-link lazy 소멸. 재리뷰: InputManager는 OutputManager 역상(자율폴러→엔진-driven funnel 반전)이라 T2=T2a(엔진 라우팅+구동반전)/T2b(오케스트레이션 재-홈)로 분할. 착수 시 T1 계약 read kind→{T2a/T2b·T3 storeResolver·T4 studio·T5 materialize/operator} 분해. 구조 [M-0041](../mermaid/INDEX.md#M-0041). **+ Phase B(코일 출력 완전통합) 분해 2026-07-23([ADR-0008](sensor-collect-fb/adr/0008-coil-output-full-unify.md))** — 저작 두 갈래→단일 device 변수(concrete=변수 `bind`·live rename)+조건 타입-인지+materialize device 추출(3 todo T1→{T2,T3}). **P3(read 실행)=🔀 realized-by D¹⁰ 아래**.
   - 🔻 **D¹⁰(게이트웨이 버스 Manager 통합) = [gateway-bus-manager-unify](gateway-bus-manager-unify/ledger.md) ✅ 완결 2026-07-23 (TA~TE — 전 Modbus 접근 Manager 유일소유·adaptive fast-fail·입력 2-범주, sensor-collect P3 realize)** → [INDEX-archive](INDEX-archive.md) 하차. ※ read decode 대칭화는 D¹¹ read-fb-authoring.
   - 🔻 **D¹¹(센서 read 저작 = 출력 대칭) = [read-fb-authoring](read-fb-authoring/ledger.md) 🔜 (kickoff 2026-07-23 · Track C+F · sensor-collect P4 부분 realize)** — gbmu(P3 read 실행)를 실기 테스트하려면 read 저작 UI 필요. 설계 중 **read 가 출력과 비대칭** 실측(read=decode-in-FB / 출력=카탈로그 런타임 해소). → **read 를 출력 미러(카탈로그-해소)로 대칭화**(사용자 통찰): read FB 슬림(`device+주기`)·decode=카탈로그 `Command`(1파이프·ADR-0003)·게이트웨이 런타임 해소(`DeviceCommandInterpreter` read 확장)·🔴 gbmu `InputManager` 카탈로그 조회로 정정(ADR-0001). ctx 자동등록 `센서1.온도`(ADR-0002). **Ph1=Modbus**, **Ph2=Tuya WiFi(DPS) = 🔀 realized-by [protocol-read-decode](protocol-read-decode/ledger.md)**(decode transport-태그 union + ReadDriver). 6 todo(T1 계약→{T2 admin·T3 gateway·T4 studio·T5 materialize}→T6 e2e). 구조 [M-0041](../mermaid/INDEX.md#M-0041).
   - 🔻 **D¹²(read decode 프로토콜 추상화) = [protocol-read-decode](protocol-read-decode/ledger.md) 🔜 (kickoff 2026-07-24 · read-fb Ph2 realize)** — read decode(수집값 해석)를 **transport-태그 union + 프로토콜별 ReadDriver**로 추상화. 실측: send축(`TransportDriver`)은 이미 Modbus/Tuya 다형인데 **decode는 `CommandDecodeEntry{registerOffset}` = Modbus 형상이 공용 `Command`에 박힘** · store는 이미 단일 sink(INV-11). → **decode = `Command` 위 via-태그 discriminated union**(Modbus `registerOffset` / Tuya `dpsId` / future esp32 keymap, 측정집합 공통 `channel` — [ADR-0001](protocol-read-decode/adr/0001-transport-tagged-read-decode-union.md)) + **적용 = 프로토콜별 `ReadDriver`**(send축 TransportDriver 동형·레지스트리 dispatch, InputManager 무-분기 — [ADR-0002](protocol-read-decode/adr/0002-per-protocol-decode-applier-gateway.md)) → 명명 채널 → 단일 store sink. **새 제품 = union 항 + driver 1개**(InputManager/store 무변경, INV-0). **reconcile**: read-fb ADR-0003(Modbus decode-on-Command) *확장*(Modbus=union 한 항·`CommandDecodeEntry`→`ModbusDecodeEntry`) · sensor-collect ADR-0003 §"추출=binding transport별"(예약) *실현* · ADR-0005 target-agnostic 정합. 4 todo(T1 계약 union→{T2 gateway ReadDriver·T3 admin 저작}→T4 e2e). 구조 [M-0044](../mermaid/INDEX.md#M-0044). **T1~T3 merged 2026-07-24 `2d54e4e7`**(+ 통합갭 fix: catalog-source sensing 투영 = read 파이프 완결, 실기 e2e 센서3대 30s Modbus 수집→store) — e2e 열림(Tuya Ph2). ▶ read 통합 = D¹³.
   - 🔻 **D¹³(read 롤 통합 = 범용 read 타깃) = [read-generic-targets](read-generic-targets/ledger.md) ⬜ (kickoff 2026-07-24 · protocol-read-decode 위)** — read FB 를 모든 device(센서·냉동기·출력보드·조명)에 범용화. 발단: "read 는 센서만 아님" + 조명(on/off+조도조절+조도읽기=다중성격) 이 category→단일 read롤 모델을 깸. 실측: read FB 경로는 **이미 role 무차별**(항상 `Sensor(channels)`·타입은 decode `as`), 3 read 롤(sensor/status/state)=런타임 무차별 taxonomy. → **읽기 = 단일 `read`(category 직교)**, 제어만 category-스코프. device = 제어명령 + read명령(N개, decode 채널) · read FB → device read 명령 전부 폴·`device.<channel>` 병합 · catalog device-병합(조명=제어+read 한 엔트리) · **FC01 코일-read**(PLC 출력상태, 죽은 TransportStatePoller 대체). 5 todo(T1 계약 role 통합→{T2 gateway 다중폴+FC01·T3 backend catalog 병합·T4 studio/admin}→T5 e2e). supersede = ROLES_BY_CATEGORY read 부분(제어 롤 생존). 구조 [M-0045](../mermaid/INDEX.md#M-0045).
2. **owner-space** 🔜
   - [owner-space-self-service](owner-space-self-service/ledger.md) (SS1 ✅) — 다음 SS 전선 미착수(활성 todo 없음) · ⚠️ `space` 채널 → node-realtime-tree P4 가 generic node 채널로 흡수
   - ~~tuya SS2~~ → [tuya-transport-control-host](tuya-transport-control-host/ledger.md) **✅ 완결 2026-07-09** (Sub-A 제어코어 + Sub-B 온보딩 C1~C4 전부 done) → INDEX-archive 하차
3. **[timed-preset](timed-preset/ledger.md)** 🔜 — 프리셋 시간 축 (pathfinder)
   - ⚠️ **코드 정합(2026-07-15)**: v1 코어(T1~T3)·T4/T5 구현이 control-execution purge(`3599cc44`)로 삭제됨 — 계약 wire 타입만 잔존, **전량 재구현 대기**(`WssMessageRouter` "재구현 대기"). ledger 의 "✅ done" 은 코드 기준 stale.
   - 후속 = P-sequence(구 delay-sequence 재편)·P-branch (block-builder owner-tier 상속, 별 kickoff)
   - 🔻 downstream = [schedule-safety-fsm](schedule-safety-fsm/ledger.md) ⬜ (스케줄·안전규칙 rule 엔진 — runner·IR→FSM 컴파일·preset 재사용. **단 T0 teardown = 무의존, 지금 sprint 가능**)
   - 모(母) [batch-command-presets](batch-command-presets/ledger.md) = 즉시발화 ✅ (활성 전선 없음 — 타임드 이관 완결)
4. **[multi-user-concurrent-control](multi-user-concurrent-control/ledger.md)** 🔜
   - 다중 조작자 동시 제어 (귀속·중재·만인 중지)
   - 활성 = `muc-attribution-contract-backend` → `muc-operator-ui`
5. **[gateway-upgrade-position-persistence](gateway-upgrade-position-persistence/ledger.md)** 🔜
   - 위치 지속성 (P1 ✅) + 업그레이드 오케스트레이션 (P2 ✅ — 계약·오케·operator UX·boot-hold·도달성 SoT)
   - ⚫ 활성이던 `gup-downgrade-rollback-verify` = **dropped 2026-07-15**(setRequestDowngrade가 MIUI 원천 거부) → #6로 재설계
6. **[lan-direct-auth-token-lifecycle](lan-direct-auth-token-lifecycle/ledger.md)** 🔜 — **operator 토큰 수명 재편 + LAN 직결 오프라인 인증 재설계 (kickoff 2026-07-17 · Track G · 보안 크리티컬)**
   - 결정 = access(2h)/refresh(3d 회전 stateful) · offline=**gateway 로컬 권위**(PIN+deviceCode, 키 공유 0=위조 불가) · device-bound(login/refresh 실기기 전용, auth-hardening seam) · 멀티-게이트웨이 per-site 로컬 권위 · **teardown-first**(오염방지 INV-0). never-expiring `LocalLinkToken` 폐기 = LAN 직결 401 회귀 근본해결.
   - 활성 전선 = ~~P0~~(`cdf5f1e3`) → ~~P1~~(`af187b12`) → ~~P2~~(`a50f0d6e`) → ~~P3 gateway 로컬 권위~~(✅ `23339c1b`) → ~~P3.5 seamless-lan-failover-ux~~(✅ 완결 2026-07-19 `cfbe94f9` — [INDEX-archive](INDEX-archive.md); 자동전환·복구·dual-token·조용한 스위칭·토큰수명 UX 전부 delivered) → **P4 멀티-게이트웨이**. 다음 = P4.
   - supersede = [2026-07-17-lan-direct-offline-regression](../todo/2026-07-17-lan-direct-offline-regression.md)(최소-복구 미채택→P3 근본해결) · lan-direct-offline-usability LAN auth 부분(P0 teardown). 의존 = auth-hardening(deviceCode 발급 seam). 설계 SoT = [spec.md](lan-direct-auth-token-lifecycle/spec.md)·[M-0028](../mermaid/INDEX.md#M-0028)
7. **[operator-action-audit-log](operator-action-audit-log/ledger.md)** 🔜 — **조작 감사 이력 무손실 기록·동기화 (kickoff 2026-07-17 · Track G · 데이터 무결성)**
   - 실측 발견: 조작 이력 dead-writer(Command/HistEvent 미기록, RealtimeStore 재작성 회귀) + LAN 직결 조작 유실. 사용자 "필요하다" → 복원.
   - 결정 = **게이트웨이 진실원**(실행자=기록자, 온·오프 동일) + **outbox → 재연결 idempotent 업링크**(무손실, INV-2·10). ~~P1 audit-contract-backend~~·~~P2 gateway-audit-outbox~~ ✅. 활성 = **P3 coordinated-audit-sidewindow**(측창 조율 감사, INV-9 집중세션) + **P4 source-agnostic-provenance**(3소스[사용자·스케줄·안전] 통합 스파인 + boardId ingest freeze, ADR-0004, 2026-07-19). P3·P4 상보·대체로 독립(recordAudit 시그니처만 겹침). schedule/safety 실행 producer=schedule-safety-fsm(by construction 합류, INV-0). 설계 SoT = [spec.md](operator-action-audit-log/spec.md)·[ADR-0004](operator-action-audit-log/adr/0004-source-agnostic-provenance.md)·[M-0030](../mermaid/INDEX.md#M-0030)


> **kickoff 대기(등록만)**: `owner-exposed-legacy-teardown`(algorithm-device-selection ✅ 후속 — `ownerExposed`→`Device.access`, cross-initiative kickoff 필요). · `field-device-hardening`(최종 납품 단말 잠금[DISALLOW_INSTALL_APPS·kiosk] + 통신 사용량·타 앱 네트워크 차단 + dev/field 분리 — [todo](../todo/2026-07-15-field-device-hardening.md), DPC device-owner 정책 설계).
> **release-end 지연**: [auth-hardening](auth-hardening/ledger.md) (sprint pending) — 🔗 lan-direct-auth-token-lifecycle P2/P3 의 deviceCode 발급 seam 소유(상보, 막바지 통합).

---

## 📚 이니셔티브 표 (도메인 트랙별) — 이름 = ledger 링크

> 행 = 롤업 상태 + 활성 todo 수. supersede·의존·상세는 각 ledger 소유(여기 미러 X).

### Track A — 저장 spine
| 이니셔티브 | 상태 | 활성 todo |
|---|---|---|
| [node-spine](node-spine/ledger.md) | ✅ | — |

### Track B — device 모델
| 이니셔티브 | 상태 | 활성 todo |
|---|---|---|
| [device-catalog](device-catalog/ledger.md) | ✅ | — |
| [device-catalog-v3](device-catalog-v3/ledger.md) | 🔜 | — |
| [device-catalog-gateway-runtime](device-catalog-gateway-runtime/ledger.md) | ✅ | 1 |
| [gateway-heartbeat-watchdog-runtime](gateway-heartbeat-watchdog-runtime/ledger.md) | ✅ | — |
| [device-control-end-to-end](device-control-end-to-end/ledger.md) | ✅ | — |
| [web-admin-product-form-redesign](web-admin-product-form-redesign/ledger.md) | ✅ | 1 |
| [제품 관리 부활](physical-topology-rebuild/ledger.md) <sub>(slug=physical-topology-rebuild)</sub> | ✅ 완결·archived 2026-07-11 (보는+작성 화면 부활) | — (잔여 2건 → control-execution #1) |

### Track C — 제어 알고리즘 🔴 (가장 얽힌 supersede — 각 ledger `## supersede` 참조)
| 이니셔티브 | 상태 | 활성 todo |
|---|---|---|
| [control-execution-role-separation](control-execution-role-separation/ledger.md) | 🔜 (A·B ✅ · C 재개 2026-07-12 실 디바이스 FSM 배선) | 1 |
| [mapping-platform-restore](mapping-platform-restore/ledger.md) | ✅ archived 2026-07-13 → [INDEX-archive](INDEX-archive.md) | — |
| [sidewindow-authored-fsm](sidewindow-authored-fsm/ledger.md) | ✅ 완결·archived 2026-07-14 (범용 매핑 위 측창 알고리즘 · T1·T-α0/α/β/γ/δ 전부 done) | — (전부 done) |
| [node-realtime-tree](node-realtime-tree/ledger.md) | ✅ P1~P5 완결 2026-07-14 (제어 node-spine·generic node 채널·측창 버그 fix; P6→physical-node-spine) | — |
| [physical-node-spine](physical-node-spine/ledger.md) | ✅ 완결·archived 2026-07-14 (이주 T1~T8 + 0121 board-cascade fix) → [INDEX-archive](INDEX-archive.md) | — |
| [control-algorithm-layer](control-algorithm-layer/ledger.md) | 🔜 | 0 (refire dropped→control-exec 흡수) |
| [positional-control-blocks](positional-control-blocks/ledger.md) | ✅ (ADR-0005 superseded→control-exec) | — |
| [control-algorithm-group](control-algorithm-group/ledger.md) | ✅ | — |
| [control-fsm-algorithm](control-fsm-algorithm/ledger.md) | ✅ | — |
| [control-model-foundation](control-model-foundation/ledger.md) | ✅ | — |
| [algorithm-device-selection](algorithm-device-selection/ledger.md) | ✅ | 1 |
| [sidewindow-positional-generic-unification](sidewindow-positional-generic-unification/ledger.md) | ⚫ | — |
| [sidewindow-fsm-migration](sidewindow-fsm-migration/ledger.md) | ✅ | — |
| [fsm-authoring-builder](fsm-authoring-builder/ledger.md) | ✅ 완결 2026-07-19 (T1~T6 done · 엔진/저작 코어 · 저작 UI = fsm-builder-canvas-ux) | — |
| [fsm-builder-canvas-ux](fsm-builder-canvas-ux/ledger.md) | 🔜 (PLC-IDE · ADR-0008 · UX-1/2/3·RX-1/2/3 done · RX-4~8) | 5 |
| [fsm-loop-authoring-model](fsm-loop-authoring-model/ledger.md) | 🔜 (loop-단일 재설계 · Sub1 ✅ 완결 T1-T7 2026-07-19 · Sub2/3 후속) | — |
| [fsm-loop-authoring-ui](fsm-loop-authoring-ui/ledger.md) | ✅ 완결·archived 2026-07-24 (Sub2 저작 UI · Ⓐ·Ⓑ·Ⓒ·Ⓓ 4/4 · [archive](INDEX-archive.md)) | — |
| [fsm-state-execution-model](fsm-state-execution-model/ledger.md) | ✅ 완결·archived 2026-07-23 (image-table 순서 스캔 · 3 Phase[계약·게이트웨이·저작 UI] done · [archive](INDEX-archive.md)) | — |
| [read-fb-authoring](read-fb-authoring/ledger.md) | 🔜 (kickoff 2026-07-23 · Track C+F · read 저작=출력 대칭·카탈로그-해소 · sensor-collect P4 부분 realize · Ph1 Modbus · Ph2 Tuya=realized-by protocol-read-decode) | 6 |
| [protocol-read-decode](protocol-read-decode/ledger.md) | 🔜 (T1~T3 merged 2026-07-24 `2d54e4e7` · read decode union+ReadDriver+catalog sensing 투영 · Modbus 실기 e2e 통과 · e2e 열림=Tuya Ph2) | 1 |
| [read-generic-targets](read-generic-targets/ledger.md) | ⬜ (kickoff 2026-07-24 · read 롤 통합=단일 read·category 직교 · device 다중 read 폴·병합 · FC01 코일-read · protocol-read-decode 위) | 5 |
| [fsem-legacy-drop](fsem-legacy-drop/ledger.md) | ✅ 완결·archived 2026-07-23 (FSEM 형상 정리 · {fbs,outputs}→ops · shim 제거=단일 SoT · registry 유지 · T1+T2 done · [archive](INDEX-archive.md)) | — |
| [virtual-fsm-composition](virtual-fsm-composition/ledger.md) | ✅ 완결 2026-07-20 (닫힌 묶음 추출=실 sub-FSM · 멀티-FSM 인라인 캔버스 · T1~T4 done) | — |
| [fsm-as-fb](fsm-as-fb/ledger.md) | ✅ 완결·archived 2026-07-21 (device-direct + subfsm embed/invoke + preview · T1~T5 · RX-4/6 선행) | — |
| [studio-unified-control-ide](studio-unified-control-ide/ledger.md) | 🔜 (통합 제어 IDE · web⊥스튜디오 · 5-way 트리 · kickoff 2026-07-21 · P1=S0+S1+F4) | 3 |

### Track D — 출력 / 상태
| 이니셔티브 | 상태 | 활성 todo |
|---|---|---|
| [output-model-convergence](output-model-convergence/ledger.md) | ✅ | — |
| [fsm-state-readback](fsm-state-readback/ledger.md) | ✅ | — |
| [plc-relay-coil-unification](plc-relay-coil-unification/ledger.md) | ✅ | — |

### Track E — owner / 스페이스 / 프리셋
| 이니셔티브 | 상태 | 활성 todo |
|---|---|---|
| [owner-space-self-service](owner-space-self-service/ledger.md) | 🔜 (SS1 ✅) | — |
| [tuya-transport-control-host](tuya-transport-control-host/ledger.md) (SS2) | ✅ 완결 2026-07-09 → INDEX-archive | — |
| [batch-command-presets](batch-command-presets/ledger.md) | ✅ (타임드=timed-preset 이관) | — |
| [timed-preset](timed-preset/ledger.md) | 🔜 (v1 spec ✅) | 5 |

### Track F — 실시간 / 게이트웨이 오케스트레이션
| 이니셔티브 | 상태 | 활성 todo |
|---|---|---|
| [gateway-reuse-manager](gateway-reuse-manager/ledger.md) | ✅ | 1 |
| [realtime-domain-state](realtime-domain-state/ledger.md) | ✅ (전송 이관 → realtime-delta-transport) | — |
| [realtime-store-symmetric-sync](realtime-store-symmetric-sync/ledger.md) | ✅ shipped 2026-07-10 → archive | — (소비자→#1) |
| [studio-realtime-store](studio-realtime-store/ledger.md) | 🔜 (웹 노드 store 확장 · 온라인 모니터 읽기+명령 · 데스크탑 seam · T0~T5+하드닝 done · T5 online-command→sdic 흡수) | 0 |
| [realtime-delta-transport](realtime-delta-transport/ledger.md) | ✅ shipped 2026-07-10 → archive | — (runtime→#1 · preset deferred) |
| [realtime-motion-events](realtime-motion-events/ledger.md) | ✅ | — |
| [sidewindow-position-confidence](sidewindow-position-confidence/ledger.md) | ✅ | — |
| [lan-direct-offline-control](lan-direct-offline-control/ledger.md) | ✅ | — |
| [lan-direct-offline-usability](lan-direct-offline-usability/ledger.md) | ✅ (LAN auth 회귀 → lan-direct-auth-token-lifecycle 이관) | — |
| [multi-user-concurrent-control](multi-user-concurrent-control/ledger.md) | 🔜 | 2 |
| [transport-driver-capability-contract](transport-driver-capability-contract/ledger.md) | ✅ | — |
| [board-driven-diagnostics](board-driven-diagnostics/ledger.md) | ✅ | — |
| [gateway-upgrade-position-persistence](gateway-upgrade-position-persistence/ledger.md) | 🔜 (P1·P2 ✅ · downgrade dropped→release-managed-ota) | 0 |
| [release-managed-ota](release-managed-ota/ledger.md) | ✅ shipped 2026-07-16 → archive | — |
| [android-app-crash-hardening](android-app-crash-hardening/ledger.md) | ✅ | — |
| [mcs-unit-divisor-authoring](mcs-unit-divisor-authoring/ledger.md) | ✅ | — |
| [board-heartbeat-ownership](board-heartbeat-ownership/ledger.md) | ✅ | — |
| [diagnosis-realtime-unification](diagnosis-realtime-unification/ledger.md) | ✅ 완결·archived 2026-07-12 (진단 화면 gateway/operator 구동) | — (ping-echo 파킹) |
| [schedule-safety-fsm](schedule-safety-fsm/ledger.md) | ⬜ (spec ✅ · T0 teardown 즉시가능 · T1~5 timed-preset 후) | 6 |
| [space-realtime-store](space-realtime-store/ledger.md) | ✅ 완결·archived 2026-07-12 (T1~T4 머지 · C operator 이관 · 스페이스 농가단위→store) | 4/4 |
| [plc-terminal-coil-wire](plc-terminal-coil-wire/ledger.md) | ✅ 완결·archived 2026-07-12 (T1~T3 머지 = 코일 파생·materialize·relink, 실 릴레이 구동 · T4 표시스킴 스핀아웃) | 3/4 |

### Track E/F UI — operator 렌더러 / 화면
| 이니셔티브 | 상태 | 활성 todo |
|---|---|---|
| [operator-ui-renderer-plugin](operator-ui-renderer-plugin/ledger.md) | ✅ | — |
| [operator-node-tree-ui-frame](operator-node-tree-ui-frame/ledger.md) | ✅ | — |
| [operator-home-brief-plugin](operator-home-brief-plugin/ledger.md) | ✅ | — |

### Track G — 프로비저닝 / 인증 / 기타
| 이니셔티브 | 상태 | 활성 todo |
|---|---|---|
| [field-provisioning](field-provisioning/ledger.md) | ✅ (v1) | 1 |
| [auth-hardening](auth-hardening/ledger.md) | 🔜 (지연 · lan-direct-auth-token-lifecycle P2/P3 deviceCode seam) | 3 |
| [lan-direct-auth-token-lifecycle](lan-direct-auth-token-lifecycle/ledger.md) | 🔜 (P0·P1·P2·P3 ✅ · P3.5[별] ✅ 2026-07-19 · P4 대기) | 1 (P4) |
| ~~seamless-lan-failover-ux~~ | ✅ 완결·archived 2026-07-19 → [INDEX-archive](INDEX-archive.md) | — |
| [operator-action-audit-log](operator-action-audit-log/ledger.md) | 🔜 (P1·P2 ✅ · P3 측창감사 · P4 3소스통합 스파인 ADR-0004) | 2 (P3·P4) |
| [weather-report-per-site](weather-report-per-site/ledger.md) | ⬜ | 1 |
| [app-dark-theme](app-dark-theme/ledger.md) | ⬜ | 1 |
| [inspector-reconnect-healthcheck](inspector-reconnect-healthcheck/ledger.md) | ⬜ | 1 |
| [misc-web](misc-web/ledger.md) (catch-all) | ⬜ standing | 1 |
| [misc-gateway](misc-gateway/ledger.md) (catch-all) | ⬜ standing | 1 |
| [misc-inspector](misc-inspector/ledger.md) (catch-all) | ⬜ standing | 1 |
| [misc-operator](misc-operator/ledger.md) (catch-all) | ⬜ standing | 1 |
| [sidewindow-roster-axis-teardown](sidewindow-roster-axis-teardown/ledger.md) | ⬜ 미착수 | 0 (최종검토용 tech-debt) |

### Track H — legacy living-spec (출하됨 — 코드 `// spec:` 주석 참조, 2026-06-23 fork 초기)
> 루트 loose 파일을 폴더화(2026-07-08). 각 폴더 = `spec.md`(본문) + `ledger.md`(이력·git mv 이력 보존).

| 폴더 | 원본 |
|---|---|
| [operator-sensor-stream](operator-sensor-stream/ledger.md) | operator 실시간 sensor stream (+ v3) |
| [operator-connection-header](operator-connection-header/ledger.md) | operator 연결 상태 헤더 종 |
| [sidewindow-calibration](sidewindow-calibration/ledger.md) | 측창 캘리브레이션 |
| [sidewindow-history-screen](sidewindow-history-screen/ledger.md) | 측창 조절 이력 화면 |
| [alarm-ux-operator-tab](alarm-ux-operator-tab/ledger.md) | 알람 UX — operator 탭 재배치 |
| [alarm-model-owner-based](alarm-model-owner-based/ledger.md) | 알람 모델 재설계 - owner 기반 |
| [weather-report](weather-report/ledger.md) | 날씨 리포트 (+ FCM 푸시) |
| [service-status-admin](service-status-admin/ledger.md) | 서비스 상태 가시화 - admin |
| [service-status-owner](service-status-owner/ledger.md) | 서비스 상태 가시화 - owner |
| [owner-web-page](owner-web-page/ledger.md) | 농장주 web 페이지 |
| [owner-web-diet](owner-web-diet/ledger.md) | owner-web-diet |
| [admin-web-finalize](admin-web-finalize/ledger.md) | admin-web-마무리 |
| [realtime-contract](realtime-contract/ledger.md) | 실시간-계약 |
| [schedule-auto-execute](schedule-auto-execute/ledger.md) | 스케줄 자동 실행 |
| [safety-guard-sensor-polling](safety-guard-sensor-polling/ledger.md) | 안전 가드 + 센서 polling |

---

## 🔗 Supersession 색인 — "무엇이 무엇을 왜" (상세 = 소유 ledger `## supersede`)

> 체인당 한 줄. 근거·유지/폐기 상세는 링크된 ledger 가 소유. (양쪽 다 완결이어도 색인은 유지 — 발견성.)

1. ghost-house → **space** — [owner-space-self-service](owner-space-self-service/ledger.md) (ADR-0005, feature 은퇴)
2. cag flat-picker → **control-fsm JSON 템플릿** — [control-fsm-algorithm](control-fsm-algorithm/ledger.md) (ADR-0003)
3. device-catalog kind/commandSpec → **device-catalog-v3** category/command-set — [device-catalog-v3](device-catalog-v3/ledger.md)
4. register 위치제어 → **plc-relay-coil-unification** — [plc-relay-coil-unification](plc-relay-coil-unification/ledger.md) (ADR-0001·0004)
5. predictive startDelayMs → **realtime-motion-events** event-driven — [realtime-motion-events](realtime-motion-events/ledger.md)
6. aerator(테스트) → **generic OnOff** — [output-model-convergence](output-model-convergence/ledger.md)
7. HouseAlgorithmSlot 미러/uniform 바인딩 → **저작-시 전용/공유 mode** — [algorithm-device-selection](algorithm-device-selection/ledger.md) (ADR-0001·0002)
8. 측창 reuse actor(직접 코일) → **범용 Positional executor(FSM 안전레일)** — [sidewindow-positional-generic-unification](sidewindow-positional-generic-unification/ledger.md) (control-algorithm-layer phase 2)
9. 측창-하드코딩 heartbeat/watchdog → **명령셋 catalog-구동** — [gateway-heartbeat-watchdog-runtime](gateway-heartbeat-watchdog-runtime/ledger.md)
10. 구 tuya D11/D12 제어호스트 todo → **tuya-transport-control-host SS2** — [tuya-transport-control-host](tuya-transport-control-host/ledger.md) (ADR-0001~0006)
11. inspector App SDK 페어링 → **게이트웨이 DIY EZ** — [tuya-transport-control-host](tuya-transport-control-host/ledger.md) (ADR-0007)
12. 게이트웨이 DIY EZ → **BYO 자가추출** (EZ 死 발견) — [tuya-transport-control-host](tuya-transport-control-host/ledger.md) (ADR-0008)
17. BYO 자가추출 → **회사 단일 프로젝트 + Smart Life 페어링** (ToS 실조사: $5k=App SDK 전용·IoT Core=종량제 푼돈) — [tuya-transport-control-host](tuya-transport-control-host/ledger.md) (ADR-0009) · **앱-플로우 정련(ADR-0010): inspector 직접 register → pool 수집 + admin 등록**
13. omc gateway-authoritative(FC01 특정) → **transport-generic readback 계약** — [transport-driver-capability-contract](transport-driver-capability-contract/ledger.md) (ADR-0001~0005, INV-10)
14. device-control-e2e state=렌더러소유 → **렌더러 공유-store 바인딩** — [operator-ui-renderer-plugin](operator-ui-renderer-plugin/ledger.md) (ADR-0002)
16. 측창-하드코딩 진단 spine → **board-driven 범용 진단** — [board-driven-diagnostics](board-driven-diagnostics/ledger.md) (ADR-0001~0005)
17. 측창 reuse per-motor 슬라이스 → **positional-control-blocks 4블록 강제조합** — [positional-control-blocks](positional-control-blocks/ledger.md) (ADR-0001~0004)
18. fsm-builder-canvas-ux ADR-0008 §1 2-way 트리(하드웨어+프로그램) → **5-way 통합 제어 IDE 트리**(제어함/Node/프리셋/스페이스/스캔, 부분) — [studio-unified-control-ide](studio-unified-control-ide/ledger.md) (ADR-0002)
18. heartbeat/watchdog leaf 소유 → **board 소유** (+데이터-주도 명령셋 pivot) — [board-heartbeat-ownership](board-heartbeat-ownership/ledger.md) (ADR-0001·0002)
20. tdc T8 localNow 앵커 → **측창 애니 실측 catch-up(commandSentAt/SyncedClock)** — [positional-control-blocks](positional-control-blocks/ledger.md) (ADR-0007)
21. lan-direct T5 badge → **usability P3 진단 통합** — [lan-direct-offline-usability](lan-direct-offline-usability/ledger.md) (ADR-0004)
22. 프리셋 타임드 발화(deferred-start 웨지 + delay-sequence Phase 2) → **[timed-preset](timed-preset/ledger.md)** — gateway sibling FSM runner(실행 클래스) + 저작 IR→FSM 컴파일로 재편(ADR-0001~0005). deferred-start=v1 흡수(dropped), delay-sequence=P-sequence 재지정. 코어 = [제어-FSM-엔진.md](../spec/제어-FSM-엔진.md).
24. per-type 실시간 wire(gateway emit·backend relay·operator/inspector decode) + timed-preset T4/T5 per-type emit → **[realtime-delta-transport](realtime-delta-transport/ledger.md)** — 노드 사이 전송을 단일 `realtime_delta` 봉투로 수렴(ADR-0001), delete-first 초토화(ADR-0002), channel 레지스트리 SoT(ADR-0003). timed-preset 코어(runner/compiler)는 이후 control-execution purge(`3599cc44`)로 삭제·재구현 대기(코드 기준, 2026-07-15 정정). realtime-domain-state 미완 "소비처 이관" 완결.
23. schedule-auto-execute + safety-guard-sensor-polling(Track H legacy) → **[schedule-safety-fsm](schedule-safety-fsm/ledger.md)** — 스케줄(시각)·안전규칙(센서)을 단일 rule 엔진(edge-triggered standing FSM + guard 플러그)으로 fresh 재설계(구 코드 완전 배제, ADR-0002). 사이클 스케줄=생육실 알고리즘 분리(ADR-0006, 생육실 문서 §5 정정). 센서 폴링 인프라만 유지.
25. positional 측창 `BehaviorEngine` 우회(positional ADR-0005 "버스 오너 전 코일 총괄") + `positional-orchestration-refire` → **[control-execution-role-separation](control-execution-role-separation/ledger.md)** — FSM 유일 실행 권위 + 역할 4분리(self-select ⊥ orche ⊥ FSM ⊥ 단일 OutputManager)로 처음부터 재설계(ADR-0001~0005). tick 루프·BaseFSM 상속·일반화 4추상. 전용/공유 축·interlock seam은 `SharedResource`로 계승, "엔진 미경유" 실행 구조 폐기. 근거 = `docs/research/behavior-engine-positional-ownership/`.

---

26. rdt v2 store/transport 축(command-channel·state-emit·gateway-alarm-eval, per-type/옛-substrate 접근) → **[realtime-store-symmetric-sync](realtime-store-symmetric-sync/ledger.md)** — 실시간 계층 3번째(=최종) 재설계로 command/state/alarm 을 단일 `RealtimeStore` **store kind** 로 흡수(ADR-0001 단일 form + 8 port·ADR-0002 언어 이중성). rdt v1 은 노드 사이 *wire* 만 수렴했고 *store 자체*는 노드별 파편으로 남음 → 4노드 단일 form 초토화. 새 **INV-12**(코어 무-위치분기) 도입. 살아남음 = `rdt-gateway-control-runtime`(소비자)·`rdt-timed-preset-rider`(deferred). 상세 = 소유 [ledger.md#supersede](realtime-store-symmetric-sync/ledger.md#supersede).

27. 게이트웨이 inbound 레거시 `*_for_gateway`(board_registry 별 `BoardRegistryForGateway` 메시지 · catalog 별 `catalog_snapshot_for_gateway` emitter[purged]) → **[diagnosis-realtime-unification](diagnosis-realtime-unification/ledger.md)** — 게이트웨이 board/catalog 수신을 **단일 realtime(RealtimeDelta) 전송**으로 수렴(별 메시지 은퇴, admin/owner D1 변경 실시간). catalog emitter 부활은 **physical-topology-rebuild 잔여 "watchdog config-push(→#1)" 를 흡수**(catalog=substrate·#1 소비대상) + control-execution #1 unblock. 흡수: `lan-direct-board-registry-missing`(→A1). 부분·파킹: `gateway_reach` lastSeenAt→ping-echo 왕복(ADR-0001, 파킹 front). 상세 = 소유 [ledger.md#supersede](diagnosis-realtime-unification/ledger.md#supersede).

28. operator 스페이스 REST device-load(`SpaceViewModel.loadModel` · `space_changed`→reload) → **[space-realtime-store](space-realtime-store/ledger.md)** ✅ **실현 2026-07-12(T4 `ddd95fa8` — REST 스택 전량 제거)** — 스페이스(**농가 단위**)를 realtime store 로(backend `spaceInputSource`→`space` 채널, farm-do) + operator 가 `space`×`fsm_state`(deviceId) 조인해 on/off device 를 BasicFSM 제어. `basicfsm-real-device-wire` 의 operator FSM 제어(deferred) 이관처 — 그 sprint 는 gateway 파생 foundation(`64d67178`)만 머지. 알고리즘 write REST 는 유지(부분). 명령 전송 메커니즘 재사용(완성). 상세 = 소유 [ledger.md#supersede](space-realtime-store/ledger.md#supersede).
30. 구 `control-fsm-algorithm`(BehaviorFsm/BehaviorEngine 매핑, ✅done) 의 **실행 form** → **[mapping-platform-restore](mapping-platform-restore/ledger.md)** — materialize 산출 form 을 `AuthoredFsm`(현 인터프리터)로 적응(ADR-0001). HouseAlgorithm/Slot 스키마·매핑 개념·admin UI 패턴 계승, BehaviorFsm 실행 form 폐기. + 측창 per-device 파생 프레임(sidewindow T2/T3/T4 dropped) → 범용 매핑 위 알고리즘으로 재분해. 상세 = 소유 [ledger.md#supersede](mapping-platform-restore/ledger.md#supersede).
29. 측창 상태 발신(`rdt-state-emit`, dropped)·`positional_state` 채널·PositionalState payload·backend producer → **[sidewindow-authored-fsm](sidewindow-authored-fsm/ledger.md)** — 측창을 `AuthoredFsm(Positional)` 데이터로 실현(gateway 자동 파생·calc·direction) + **fsm_state 통일 발신**(위치=gateway 소유, ADR-0001). legacy per-type positional_state 은퇴, operator UI ~70% 무변경. bus-orche(`positional-orchestration-refire` dropped)는 Slice II 계승. 영향: muc activeOperator(positional_state→fsm_state 이관). 상세 = 소유 [ledger.md#supersede](sidewindow-authored-fsm/ledger.md#supersede).
31. legacy House/Site flat 테이블 + house-specific HouseAlgorithm/Slot + 버려진 0093 ControlDetail(site-group) + operator 죽은 REST(`output-devices`) + `space` 전용 채널 → **[node-realtime-tree](node-realtime-tree/ledger.md)** — 제어 모델을 **node-spine domain='control'** 로 통일(House=NodeGroup·algorithm/device=Node·Site=siteId 스코프·ControlDetail 1:1, ADR-0001) + 단일 **generic `node` 채널**(전 도메인·space 흡수, ADR-0002) + operator store-소싱. id 보존(ADR-0003)으로 시계열 무손실. 0093 은 재조정 재사용(ADR-0004), node-spine·tree-ui-frame·control-model-foundation 은 하류 realization(재사용). 상세 = 소유 [ledger.md#supersede](node-realtime-tree/ledger.md#supersede).
33. positional-orchestration-refire(bus-orche, dropped) + sidewindow-authored-fsm `Slice II(별 kickoff)` 승계 → **[shared-resource-coordination](shared-resource-coordination/ledger.md)** — 측창 공유버스를 **범용 조율 계층**(coordinator 티어: 공유자원 경합 알고리즘 스케줄·게이팅)의 인스턴스 #1로 실현(ADR-0001~0003). 조율=의도만·코일 안 만짐(폐기된 "버스=코일writer" 2세대 재현 금지, INV-9/0). name-keyed 소속·QueryModule·mutex/capacity tool·belongsTo interposition. M-0008=인스턴스(supersede 아님). 상세 = 소유 [ledger.md#supersede](shared-resource-coordination/ledger.md#supersede).

32. node-realtime-tree P6 `legacy-house-site-drop`(dropped) + legacy House/Site 테이블·HouseAlgorithm/Slot dead·House*/Site* 계약타입 → **[physical-node-spine](physical-node-spine/ledger.md)** — House/Site 를 node-spine 새 **'physical' 도메인**으로 이주(Site=NodeGroup+SiteDetail·House=Node+PhysicalDetail, id 보존, ADR-0001) → 40+ 소비처·20+ FK 참조 재지정 후 House/Site 테이블 drop. node-realtime-tree P6 실측서 "청소" 아닌 플랫폼 전역 이주로 판명 → 분리. HouseElement=역할분리 유지·physical-topology 직교. 상세 = 소유 [ledger.md#supersede](physical-node-spine/ledger.md#supersede).

35. `2026-07-14-plc-liveness-unification`(misc-gateway 파킹, dropped) → **[plc-liveness](plc-liveness/ledger.md)** — kickoff 승격(2026-07-17). PLC watchdog↔앱 끊김 두-신호 갈림·USB정상+PLC죽음 "connected" 위장(INV-10) 설계를 이니셔티브로. 근본원인 분석은 spec/ADR-0001 로 이관(보존), 실행=T1. 상세 = 소유 [ledger.md#supersede](plc-liveness/ledger.md#supersede).
37. 조작 이력 dead writer(`insertCommandIdempotent`/`insertHistEvent` 미호출·`Command`/`HistEvent` 미기록 — RealtimeStore 재작성 2026-07-10 회귀로 명령이 fire-once/TTL~1s 화되며 옛 이력 저장 경로 dead) → **[operator-action-audit-log](operator-action-audit-log/ledger.md)** — 조작 감사를 **게이트웨이 진실원**(실행자=기록자, 온·오프 동일)으로 복원 + **outbox 재연결 idempotent 업링크**(무손실, INV-2·10). 폐기 아니라 재구성 — read 화면(sidewindow-history/​house history)은 소스만 신 경로로 교체. 상세 = 소유 [ledger.md#supersede](operator-action-audit-log/ledger.md#supersede).

36. `2026-07-17-lan-direct-offline-regression`(최소-복구=never-expiring `LocalLinkToken` rotate+emit, dropped) + lan-direct-offline-usability/control LAN auth 부분(공유 시크릿·`local_endpoint` token 필드) + operator 30d 고정 단일 JWT → **[lan-direct-auth-token-lifecycle](lan-direct-auth-token-lifecycle/ledger.md)** — operator 토큰을 **access(2h)+refresh(3d 회전 stateful)** device-bound 로 재편 + LAN 직결 오프라인 인증을 **gateway 로컬 권위**(자체 키 발급/회전, PIN+deviceCode 부트스트랩, 키 공유 0=위조 불가, ADR-0002)로 재설계. never-expiring 공유 시크릿 폐기 = 401 회귀 근본해결(최소-복구는 보안 후퇴라 미채택→P3). teardown-first(ADR-0005, INV-0) 오염방지. 멀티-게이트웨이 per-site 로컬 권위(ADR-0004). 살아남음 = usability broadcast/오프라인PIN/endpoint 발견 인프라(재사용). 의존 = auth-hardening(deviceCode 발급 seam, supersede 아님·상보). 상세 = 소유 [ledger.md#supersede](lan-direct-auth-token-lifecycle/ledger.md#supersede).

34. `gup-downgrade-rollback-verify`(dropped) + ADR-0007(manual-downgrade, 낮은-code + setRequestDowngrade) → **[release-managed-ota](release-managed-ota/ledger.md)** — OTA 배포/롤백을 Android versionCode에서 분리(**versionCode 고정 + backend `releaseSeq`**, ADR-0001). 옛 버전을 **같은-code 재설치**(OS 허용·데이터 보존)로 per-owner 롤백을 모든 ROM(MIUI 포함) 실현 + rejected 억제(ADR-0002). MIUI가 device-owner+setRequestDowngrade를 원천 거부(실기기 확정)해 in-place 다운그레이드 폐기. preserve-prev·owner-현장 의도는 계승, 설치 방식만 대체. M-0019 다운그레이드 서브→M-0023. 상세 = 소유 [ledger.md#supersede](release-managed-ota/ledger.md#supersede).

---

38. control-execution design §14 "빌더 UX = 별 kickoff(하류)" (예고) + `algorithm-template-registry.ts` 코드 하드코딩 저작 + `admin.algorithms` "구조 편집 후속" 잠금 → **[fsm-authoring-builder](fsm-authoring-builder/ledger.md)** — AuthoredFsm 을 admin 이 **슬롯 로직으로 UI 저작**(상태·출력·delay·전이·when) → D1 SoT → 기존 materialize/바인딩 재사용 e2e. **realize/reuse (supersede 아님)** — control-exec=엔진, mapping-platform=배치 그대로, 이 이니셔티브=저작 UI. 로직/바인딩 분리(ADR-0001)로 FSM=공유·재사용/바인딩=농가별. 코드 registry→D1 저작 승격(ADR-0002). positional 커널 비저작(0005). ESP32 정밀 executor=별 이니셔티브 defer(0006). 상세 = 소유 [ledger.md#supersede](fsm-authoring-builder/ledger.md#supersede).

39. fsm-authoring-builder **T4(맨 3패널 캔버스 저작 UI · admin.algorithms)** → **[fsm-builder-canvas-ux](fsm-builder-canvas-ux/ledger.md)** — 저작 UI 를 **자기완결 워크스페이스 앱(FSM 스튜디오)**으로 재프레이밍(reframe/부분 supersede). **살아남음(재사용)**: T1(출력 when 계약)·T3(D1 저장)·`lib/fsm-builder`(model·검증·layout·guard)·`admin-fsm-library.ts`·라우트. **죽음**: admin.algorithms 맨 편집기 IA(자기 셸로 재배치). 결정 = 워크스페이스 셸(ADR-0001)·저작⊥배포 축(0002)·승격 버전Type+accept 게이트(0003·INV-9)·프로젝트=농가(0004). 근거 = 사용자 "빌더는 화면이 아니라 애플리케이션" + 기성 제품 IA 조사(TIA Portal·Figma·Node-RED). 상세 = 소유 [ledger.md#supersede](fsm-builder-canvas-ux/ledger.md#supersede).
40. **precompute/derive/loop 3-메커니즘 모델 · fsm-authoring-builder ADR-0005(positional 커널 비저작)** → **[fsm-loop-authoring-model](fsm-loop-authoring-model/ledger.md)** — loop-단일 재설계(빅뱅, 구 모델 완전 제거). 명령=state·값·loop 엣지 단일·CALC primitive·조율 범용 accept 게이트·verb/direction 제거·위치소유 FSM. **측창도 저작 대상**(ADR-0005 반전). **살아남음**: loop(TickRule)·Guard·FB(TON/TOFF)·`Calc`·조율 게이트 골격·RX-3 캔버스/레이아웃. **죽음**: DeriveRule·CommandRule·State.verb·StateOutput.direction·고정 CoordinatorTool·측창 derive 정본. 부분: RX-3 저작 모델 → Sub2 저작 UI. 근거 = 사용자 "완전 제거 후 재설계"(혼용 방지, INV-0). 상세 = 소유 [ledger.md#supersede](fsm-loop-authoring-model/ledger.md#supersede).
41. **CALC `in:{cur,target,table}`·`calc:<mode>` (fsm-loop-authoring-model ADR-0002) · T7 studio 저작 UI 스텁** → **부분 [fsm-loop-authoring-ui](fsm-loop-authoring-ui/ledger.md)** (Sub2) — CALC를 **linear·`in.tFull` 직접 입력**으로 정제(table·mode enum·msPerPercent 3중홉·미사용 B 제거 = 단일 SoT T_full). cur/target/out role·null-coalescing·context 자동파생 **생존**. T7 저작 UI 스텁(PropertyPanel/FbLineEditor/StateFlowNode) → 실 저작 대체. 근거 = 측창 positional 실측 linear(사용자 확정). 상세 = 소유 [ledger.md#supersede](fsm-loop-authoring-ui/ledger.md#supersede).
42. **fsm-authoring-builder ADR-0007(`State.{fbs,outputs}` 2-리스트) · fsm-loop-authoring ADR-0005(coil-`when` 시맨틱)** → **부분 [fsm-state-execution-model](fsm-state-execution-model/ledger.md)** — state 실행을 단일 순서 `ops` 스캔(image-table)으로. **살아남음**: FB primitive(TON/TOFF·명명비트·FB=state소유)·StateOutput·Expr·Guard·loop 전이·OutputManager 안전레일. **죽음**: `{fbs,outputs}` 2-리스트(→ops)·coil terminal(→same-tick 이미지 비트). **정제(미supersede)**: coil-`when` 시맨틱(when-실패 HOLD→off) — ADR-0005 direction 모델 유지. 근거 = 실 ladder 같은-scan 코일 되읽기(basket-stacker IL 입병장적재기). 상세 = 소유 [ledger.md#supersede](fsm-state-execution-model/ledger.md#supersede).
43. **studio-realtime-store T5 (srs-online-command-send) 의 온라인 명령 target=authored id 접근** → **부분 [studio-deploy-instance-confirm](studio-deploy-instance-confirm/ledger.md)** — 온라인 명령 target·읽기 매칭 정체성을 **runtime fsmId**(직결=afsm-id/algorithm=node.id)로 교체(실측: authored id ≠ runtime fsmId → 명령 거부·읽기 불명). **생존(재사용)** = 명령 메커니즘(`buildFsmCommandEntry` 봉투·확인 게이트·`farm-do.ts` admin dispatch). **교체** = target 소스(authored id → runtime fsmId, backend 도출 resolver ADR-0002 + device-direct authz ADR-0003). T5 worktree(미머지)=sdic T3 이 흡수·완결. 근거 = 사용자 "배포=인스턴스 왕복 확인 + 그 fsmid로 명령". 상세 = 소유 [ledger.md#supersede](studio-deploy-instance-confirm/ledger.md#supersede).
42. **fsm-builder-canvas-ux RX-5 monitor 의 REST 폴링 읽기 메커니즘**(`site-monitor.ts`·`useMonitor`·`admin-monitor`·`admin.api.monitor`·`MonitorPanel` 목록·`/read-realtime-snapshot` RPC) → **부분 [studio-realtime-store](studio-realtime-store/ledger.md)** — 온라인 모니터 *요구* 를 operator 동형 **단일 RealtimeStore(WSS)** 로 실현(읽기 델타+명령 fire-once 통일, INV-0/11). REST 읽기 죽음, **생존(재사용)** = 배포 수정(stripUnusedSlots·notify·배포시각)·스튜디오 UI 셸(툴바·소스토글·PreviewPanel body·PropertyPanel 배포시각). teardown-first(B). RX-5 todo → dropped/resolvedBy. 근거 = 사용자 "operator 처럼 store 로 통일 + 데스크탑 분리". 상세 = 소유 [ledger.md#supersede](studio-realtime-store/ledger.md#supersede).
43. **algorithm-device-selection admin-web 매핑 UI**(purge됨 `82040b5e`) → **부분 [studio-unified-control-ide](studio-unified-control-ide/ledger.md)** P3(ADR-0005) — 노드 생성·device 매핑 저작을 **스튜디오 Node branch**로 부활(node=이름+FSM 유닛). **생존(재사용)** = 전용/공유 mode lattice·control-node-repo·materialize·배포 정적검증. 바뀌는 것 = 매핑 저작 표면(admin-web→스튜디오). 상세 = 소유 [ledger.md#supersede](studio-unified-control-ide/ledger.md#supersede).
44. **ROLES_BY_CATEGORY read 부분**(read-sensor/read-status/read-state 를 category 결합) → **부분 [read-generic-targets](read-generic-targets/ledger.md)** (ADR-0001) — 읽기를 **단일 `read`(category 직교)**로 통합. read FB 경로가 이미 role 무차별(항상 Sensor 채널·타입은 decode `as`)이라 3롤=런타임 무차별 taxonomy. **생존** = 제어 롤(control-on/off·start/stop, category 유지)·레거시 read enum 값(데이터 보존·isReadRole 동일취급). 상세 = 소유 [ledger.md#supersede](read-generic-targets/ledger.md#supersede).

## 🧹 정리 대기

- 완결 이니셔티브 색인 행 sweep(→ `INDEX-archive.md`)은 `/cling:archive roadmap`(opt-in). ledger.md 는 폴더 잔류(이력).
