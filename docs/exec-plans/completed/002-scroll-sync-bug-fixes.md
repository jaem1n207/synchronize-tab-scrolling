# 002: Scroll Sync Bug Fixes

- **Status**: Completed
- **Branch**: `release/2.9.0`
- **Commits**: `c3386a0`, `757de90`, `c9a96ec`

## Background

리팩토링 전부터 존재하던 2개의 버그를 수정. 리팩토링으로 모듈이 분리된 후 원인 파악이 용이해짐.

---

## Bug 1: 유휴 상태에서 연결 끊김 오표시

### 증상

동기화가 정상 작동 중임에도, 몇 분간 스크롤이 없으면 뱃지가 파란색(연결됨)에서 주황색(연결 끊김)으로 변경됨.

### 원인 분석

```
connectionState.lastSuccessfulSync 갱신 시점:
  ✅ scroll:sync 수신 시 (line 762)     ← 스크롤할 때만
  ✅ scroll:start 시 (line 693)          ← 동기화 시작 시 1회
  ✅ 재연결 성공 시 (line 516)
  ✅ visibility change 핑 성공 시 (line 565)
  ❌ scroll:ping 수신 시                  ← 빠져있었음!

Health check (30초 간격):
  if (Date.now() - lastSuccessfulSync > 60000) → "연결 끊김"

Background keep-alive ping: 25초 간격
  → 핑은 정상 도달하지만 lastSuccessfulSync를 갱신하지 않음
  → 60초 이상 스크롤 없으면 false positive 발생
```

핵심: **"스크롤 이벤트 없음"과 "연결 끊김"은 다른 것**인데, 동일하게 취급하고 있었음.

### 수정

`scroll:ping` 핸들러에 `connectionState.lastSuccessfulSync = Date.now()` 추가.

```
수정 후 타이밍:
  T=0s:  동기화 시작 → lastSuccessfulSync = 0
  T=25s: 핑 도착 → lastSuccessfulSync = 25s ← NEW
  T=30s: Health check: 5s < 60s → 정상 ✓
  T=50s: 핑 도착 → lastSuccessfulSync = 50s ← NEW
  T=60s: Health check: 10s < 60s → 정상 ✓
  → 유휴 상태에서도 뱃지가 파란색 유지
```

### 파일 변경

- `src/contentScripts/scroll-sync.ts` (+4줄)

---

## Bug 2: 스크롤 동기화 점진적 드리프트/지연

### 증상

"scroll is far from synchronized, from the very beginning the synchronization is lost / one page is delayed with another, the more scroll the more delay"

### 원인 분석

두 가지 원인이 복합적으로 작용:

#### 원인 A: 매 스크롤마다 비동기 스토리지 읽기

```
발신 탭 (handleScrollCore):
  scroll event → await getManualScrollOffset(tabId)  ← browser.storage.local.get()
                                                        1-10ms 가변 지연

수신 탭 (scroll:sync handler):
  메시지 수신 → await getManualScrollOffset(tabId)    ← 또 browser.storage.local.get()
                                                        1-10ms 가변 지연

→ 스크롤 주기당 2회의 비동기 I/O = 2-20ms 가변 지연 추가
→ 이 오프셋은 Alt+스크롤 시에만 변경되므로 매번 읽을 필요 없음
```

#### 원인 B: Grace Period 경계 레이스

```
PROGRAMMATIC_SCROLL_GRACE_PERIOD = 100ms (수정 전)

스크롤 동기화 파이프라인 총 지연:
  throttle(50ms) + 스토리지(10ms) + 중계(15ms) + 스토리지(10ms) + 브라우저 지터
  = 85-135ms

100ms를 초과하면:
  Tab B의 프로그래밍적 스크롤 이벤트가 grace period를 벗어남
  → Tab B가 Tab A로 역방향 브로드캐스트
  → 피드백 루프 발생
  → 위치 에코가 누적되어 점진적 드리프트
```

### 수정 A: 인메모리 오프셋 캐시 (commit `757de90`)

```typescript
// Before: 매 스크롤마다 비동기 I/O
const offsetData = await getManualScrollOffset(syncState.tabId);

// After: 동기 캐시 읽기
const offsetData = cachedManualOffset;
```

캐시 생명주기:

- **초기화**: 동기화 시작 시 스토리지에서 로드
- **갱신**: `saveManualScrollOffset()` 호출 시 (Alt+스크롤 종료)
- **초기화**: `clearManualScrollOffset()` 호출 시 (URL 변경, 동기화 중지)

keyboard-handler.ts의 콜백 인터페이스에 `updateOffsetCache` 추가하여 순환 의존성 없이 캐시 갱신.

### 수정 B: Grace Period 확대 (commit `c9a96ec`)

```
PROGRAMMATIC_SCROLL_GRACE_PERIOD: 100ms → 200ms

최악 케이스 파이프라인 지연(135ms)에도 안전한 여유 확보.
200ms 지연은 사용자가 거의 인지할 수 없는 수준.
```

### 파일 변경

- `src/contentScripts/scroll-sync.ts` — 캐시 변수 추가, async 읽기 제거
- `src/contentScripts/keyboard-handler.ts` — 콜백에 updateOffsetCache 추가
- `src/contentScripts/keyboard-handler.test.ts` — 모든 테스트 mock에 updateOffsetCache 추가
- `src/contentScripts/lib/scroll-sync-state.ts` — 상수 변경
- `src/contentScripts/lib/scroll-sync-state.test.ts` — assertion 갱신

---

## Results

- 635 tests, 0 type errors, lint clean, build clean
- 동작 검증: typecheck + build + test 모두 통과

## Key Takeaway

> **Hot path에서 비동기 I/O를 하지 마라.** 스크롤 이벤트처럼 초당 수십 회 발생하는 핸들러에서 `await storage.get()`은 가변 지연의 원인이 된다. 값이 드물게 변경된다면 인메모리 캐시를 사용하라.

> **"이벤트 없음"과 "연결 끊김"을 혼동하지 마라.** Health check는 실제 연결 상태를 확인해야 하며, 비즈니스 이벤트(스크롤)의 부재로 판단하면 안 된다.
