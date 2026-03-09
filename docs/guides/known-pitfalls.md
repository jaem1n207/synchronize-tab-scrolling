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

## Code Review Checklist

스크롤 동기화 관련 PR을 리뷰할 때 확인해야 할 항목:

- [ ] `handleScrollCore()` 또는 `scroll:sync` handler에 새로운 `await`가 추가되지 않았는가?
- [ ] `cachedManualOffset`이 모든 save/clear 경로에서 동기화되는가?
- [ ] 타이밍 상수 변경 시 불변 조건이 유지되는가?
- [ ] 새 메시지 핸들러가 `lastSuccessfulSync`를 적절히 갱신하는가?
- [ ] `PROGRAMMATIC_SCROLL_GRACE_PERIOD`가 파이프라인 최대 지연보다 큰가?
