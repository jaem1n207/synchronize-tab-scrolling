# Known Pitfalls & Bug Prevention

이 문서는 이미 수정된 버그의 재발을 방지하기 위한 가이드입니다.
스크롤 동기화 관련 코드를 수정할 때 반드시 확인하세요.

---

## Pitfall 1: Hot Path에서 비동기 I/O 사용 금지

### 규칙

> 스크롤 이벤트 핸들러(`handleScrollCore`, `scroll:sync` handler)에서 `await`를 사용하지 마세요.

### 배경

스크롤 이벤트는 초당 20회(50ms throttle) 발생합니다.
`browser.storage.local.get()`은 비동기이며 1-10ms의 **가변** 지연을 가집니다.

```
❌ BAD: 매 스크롤마다 비동기 I/O
async function handleScrollCore() {
  const offset = await getManualScrollOffset(tabId);  // 1-10ms 가변 지연
  // ... 이 시점에서 스크롤 위치가 이미 바뀌었을 수 있음
}

✅ GOOD: 인메모리 캐시 사용
async function handleScrollCore() {
  const offset = cachedManualOffset;  // 0ms, 결정적
  // ... 즉시 계산 가능
}
```

### 왜 문제인가?

1. **가변 지연**: 1ms일 때도 있고 10ms일 때도 있어서 타이밍이 불확정적
2. **파이프라인 지연 누적**: 발신(1-10ms) + 수신(1-10ms) = 2-20ms가 grace period 예산을 소모
3. **피드백 루프 유발**: 가변 지연이 grace period(200ms)를 초과하면 수신 탭이 역방향 브로드캐스트

### 적용 원칙

- 값이 **드물게 변경**되는 데이터 → 인메모리 캐시 + 변경 시 갱신
- 값이 **자주 변경**되는 데이터 → 메모리에 유지, 필요 시에만 스토리지에 영속화
- `handleScrollCore`와 `scroll:sync` handler 내부에는 `await` 금지

---

## Pitfall 2: "이벤트 없음"과 "연결 끊김" 혼동 금지

### 규칙

> Health check는 **실제 연결 테스트**(핑/퐁)로 판단하세요.
> 비즈니스 이벤트(스크롤)의 부재로 연결 상태를 추론하지 마세요.

### 배경

```
❌ BAD: 스크롤 이벤트 기반 판정
lastSuccessfulSync는 scroll:sync 수신 시에만 갱신
→ 스크롤 안 하면 → 60초 후 "연결 끊김" → 실제로는 정상

✅ GOOD: 핑 기반 판정
lastSuccessfulSync는 scroll:sync + scroll:ping 수신 시 갱신
→ Background 핑(25초)이 도착하면 타임스탬프 갱신
→ 스크롤 안 해도 연결이 살아있으면 "연결됨" 유지
```

### 새 메시지 핸들러 추가 시 체크리스트

새로운 Background → Content 메시지를 추가할 때:

- [ ] 해당 메시지가 **연결이 살아있다는 증거**인가?
- [ ] 그렇다면 `connectionState.lastSuccessfulSync = Date.now()` 갱신 필요한지 검토

---

## Pitfall 3: Grace Period와 파이프라인 지연의 관계

### 규칙

> `PROGRAMMATIC_SCROLL_GRACE_PERIOD`는 항상 파이프라인 최대 지연보다 커야 합니다.

### 배경

수신 탭에서 `window.scrollTo()` 호출 후 발생하는 scroll event가 grace period 내에 차단되어야 합니다. 그렇지 않으면 수신 탭이 발신 탭으로 다시 스크롤 위치를 보내는 **피드백 루프**가 발생합니다.

```
파이프라인 지연 구성:
  THROTTLE_DELAY (50ms)
  + 스토리지 읽기 (현재 0ms, 캐시 사용)
  + 메시지 중계 (2-15ms)
  + 브라우저 지터 (0-50ms, GC/렌더링)
  = 52-115ms

PROGRAMMATIC_SCROLL_GRACE_PERIOD = 200ms → 85-148ms 여유
```

### 상수 변경 시 체크리스트

- [ ] `THROTTLE_DELAY` 변경 시: grace period가 여전히 최대 지연보다 큰지 확인
- [ ] `PROGRAMMATIC_SCROLL_GRACE_PERIOD` 변경 시: 파이프라인 최대 지연 재계산
- [ ] 새로운 비동기 작업을 파이프라인에 추가 시: grace period 재검토

---

## Pitfall 4: 캐시 동기화 누락

### 규칙

> `cachedManualOffset`을 갱신하는 코드 경로를 빠뜨리면 발신/수신 탭이 다른 오프셋을 사용합니다.

### 체크리스트

`saveManualScrollOffset()`을 호출하는 곳을 추가할 때:

- [ ] 호출 직후 `cachedManualOffset = { ratio, pixels }` 갱신
- [ ] 다른 모듈(예: keyboard-handler)에서 호출한다면, 콜백으로 캐시 갱신

`clearManualScrollOffset()`을 호출하는 곳을 추가할 때:

- [ ] 호출 직후 `cachedManualOffset = { ratio: 0, pixels: 0 }` 초기화

현재 갱신 지점 (scroll-sync.ts):

- `scroll:start` handler — 스토리지에서 로드
- `exitWheelManualMode()` — 새 값 갱신
- `broadcastUrlChange()` — 초기화
- `scroll:stop` handler — 초기화
- `url:sync` handler — 초기화
- keyboard-handler.ts → `updateOffsetCache` 콜백 — 새 값 갱신

---

## Pitfall 5: 타이밍 상수 간 불변 조건

### 규칙

> 아래 불변 조건을 위반하면 즉시 버그가 발생합니다.

```
KEEP_ALIVE_INTERVAL_MS × 2 < CONNECTION_TIMEOUT_THRESHOLD
  현재: 25,000 × 2 = 50,000 < 60,000 ✓
  위반 시: 핑 1회 실패만으로 false disconnect

THROTTLE_DELAY < PROGRAMMATIC_SCROLL_GRACE_PERIOD
  현재: 50 < 200 ✓
  위반 시: throttle된 스크롤 이벤트가 grace period를 벗어남

파이프라인 최대 지연 < PROGRAMMATIC_SCROLL_GRACE_PERIOD
  현재: ~115ms < 200ms ✓
  위반 시: 피드백 루프 발생
```

---

## Pitfall 6: 전역 저장소에 탭별 데이터 저장 금지

### 규칙

> 탭별로 독립적이어야 하는 데이터는 `browser.storage.local`에 저장하지 마세요. `sessionStorage`를 사용하세요.

### 배경

```
❌ BAD: browser.storage.local (전역)
browser.storage.local.set({ panelPosition: { x: 200, y: 300 } })
→ 모든 탭이 같은 키를 공유
→ 탭1이 저장한 값을 탭2가 재마운트 시 로드 → 위치 오염

✅ GOOD: sessionStorage (탭별 격리)
sessionStorage.setItem('__sync_tab_scroll_panel_pos', '{"x":200,"y":300}')
→ 각 탭이 독립적인 sessionStorage를 가짐
→ 크로스탭 오염 원천 차단
```

### 언제 어떤 저장소를 사용하는가?

| 저장소                  | 범위                | 사용 시점                                  |
| ----------------------- | ------------------- | ------------------------------------------ |
| `browser.storage.local` | 전역 (모든 탭 공유) | 사용자 설정, 동기화 모드, URL sync 토글 등 |
| `sessionStorage`        | 탭별 독립           | UI 위치, 탭별 임시 상태 등                 |

### 체크리스트

새 상태를 저장할 때:

- [ ] 이 상태가 **모든 탭에서 동일해야** 하는가? → `browser.storage.local`
- [ ] 이 상태가 **탭별로 독립적**이어야 하는가? → `sessionStorage`
- [ ] 동기화 인프라(`sendMessage`)를 통해 **공유할 필요가 있는가?** → 공유가 불필요하면 브로드캐스트하지 마라

---

## Pitfall 7: 서비스 워커 재시작 후 인메모리 상태 소실

### 규칙

> 서비스 워커가 재시작될 수 있는 MV3 환경에서, 인메모리 `Set`/`Map` 상태는 반드시 영속 저장소에서 복원해야 한다.

### 배경

`manualSyncOverriddenTabs`는 `Set<number>`로, 수동 동기화로 오버라이드된 탭을 추적한다. 서비스 워커 재시작 시 이 Set이 빈 상태로 초기화되면 `isTabManuallyOverridden()`이 `false`를 반환하여 동기화 중인 탭이 auto-sync 그룹에 다시 추가된다.

### 왜 문제인가?

1. **서비스 워커 종료**: Chrome은 비활성 서비스 워커를 30초 후 종료할 수 있음
2. **상태 소실**: `new Set()`으로 선언된 모듈 레벨 변수는 재시작 시 빈 상태
3. **연쇄 버그**: 빈 Set → 가드 통과 → 잘못된 그룹 추가 → 불필요한 토스트 표시

### 적용 원칙

- 인메모리 전용 가드 상태(`Set`, `Map`)는 `restoreSyncState()` 시 영속 데이터에서 재구성
- `initializeAutoSync()`는 반드시 `restoreSyncState()` 완료 후 실행
- 새로운 인메모리 상태 추가 시, 서비스 워커 재시작 시나리오를 반드시 고려

---

## Pitfall 8: content script ping 대신 background 상태 우선 확인

### 규칙

> 백그라운드 스크립트에서 이미 알고 있는 정보(`syncState.isActive`, `syncState.linkedTabs`)는 content script ping 대신 직접 확인해야 한다.

### 배경

`showSyncSuggestion()`은 각 탭에 `scroll:ping`을 보내 동기화 상태를 확인했다. 그러나 Chrome은 백그라운드 탭의 네트워크를 throttle하여 500ms 타임아웃 내에 응답하지 못하는 경우가 빈번하다.

### 왜 문제인가?

1. **탭 throttling**: Chrome이 비활성 탭의 타이머와 네트워크를 제한
2. **false negative**: 동기화 중인 탭이 ping에 응답하지 못하면 "동기화 안 함"으로 판단
3. **불필요한 토스트**: 이미 동기화 중인데 suggestion toast가 다시 표시

### 적용 원칙

- 백그라운드 스크립트가 보유한 상태 정보로 먼저 판단
- content script ping은 백그라운드에서 알 수 없는 정보만 확인하는 용도로 사용
- ping 기반 로직에는 항상 백그라운드 상태 체크를 앞단에 배치

---

## Pitfall 9: CSS Grid의 min-width: auto와 Radix Dialog 내 ScrollArea

### 규칙

> Radix `DialogContent`(display: grid) 내부에서 텍스트 말줄임(truncate)을 사용할 때, Grid 항목에 `min-w-0`을 반드시 추가하세요. Dialog 내부에서 스크롤이 필요하면 Radix `ScrollArea` 대신 네이티브 `overflow-y-auto`를 사용하세요.

### 배경

`ExcludedDomainsDialog`에서 두 가지 UI 버그가 동시에 발생했습니다:

1. **긴 URL 오버플로우**: 긴 도메인 이름이 다이얼로그 경계를 넘어 화면 밖으로 넘침
2. **마우스 스크롤 불가**: 7개 이상의 도메인이 있을 때 마우스 휠로 스크롤할 수 없음

### 왜 문제인가?

**문제 1 — CSS Grid `min-width: auto`:**

CSS Grid 명세에 의해, Grid 항목의 기본 `min-width`는 `auto`입니다. 이는 항목이 콘텐츠 너비 이하로 축소되지 않음을 의미합니다. `DialogContent`가 `display: grid`를 사용하므로, 긴 텍스트가 있는 자식 요소는 Grid 항목으로서 콘텐츠 너비만큼 확장되어 `truncate`(text-overflow: ellipsis)가 동작하지 않습니다.

```text
DialogContent (display: grid, max-w-md)
  └── div.space-y-4 (Grid 항목, min-width: auto ← 문제)
       └── span.truncate → 부모가 축소 불가이므로 말줄임 무시됨
```

**문제 2 — Radix ScrollArea + Dialog 스크롤 잠금:**

Radix `Dialog`는 `react-remove-scroll` 라이브러리로 배경 스크롤을 차단합니다. Radix `ScrollArea`를 Dialog 내부에 중첩하면, Dialog의 스크롤 잠금이 ScrollArea의 wheel 이벤트까지 가로채서 마우스 스크롤이 완전히 차단됩니다.

### 적용 원칙

- `DialogContent` 내부의 콘텐츠 wrapper에 **항상** `min-w-0` 추가
- `truncate` 체인: 모든 상위 Flex/Grid 항목에 `min-w-0`이 있어야 동작
- Dialog 내부에서 스크롤이 필요하면 **네이티브** `overflow-y-auto` + `overscroll-contain` 사용
- Radix `ScrollArea`는 Dialog 외부에서만 사용

---

## Code Review Checklist

스크롤 동기화 관련 PR을 리뷰할 때 확인해야 할 항목:

- [ ] `handleScrollCore()` 또는 `scroll:sync` handler에 새로운 `await`가 추가되지 않았는가?
- [ ] `cachedManualOffset`이 모든 save/clear 경로에서 동기화되는가?
- [ ] 타이밍 상수 변경 시 불변 조건이 유지되는가?
- [ ] 새 메시지 핸들러가 `lastSuccessfulSync`를 적절히 갱신하는가?
- [ ] `PROGRAMMATIC_SCROLL_GRACE_PERIOD`가 파이프라인 최대 지연보다 큰가?
- [ ] 새 상태를 저장할 때, 탭별 독립 데이터가 `browser.storage.local`에 저장되고 있지 않은가?
- [ ] 새로운 인메모리 `Set`/`Map`이 서비스 워커 재시작 후 복원되는가?
- [ ] content script ping 전에 `syncState` 기반 사전 체크가 있는가?
- [ ] `DialogContent` 내부의 Grid 항목에 `min-w-0`이 있는가? (`truncate` 사용 시 필수)
- [ ] Dialog 내부에서 Radix `ScrollArea`를 사용하고 있지 않은가? (네이티브 `overflow-y-auto` 사용)
