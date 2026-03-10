# Scroll Sync Pipeline Guide

이 문서는 스크롤 동기화의 전체 흐름과 타이밍을 설명합니다.
코드를 수정하기 전에 반드시 이 파이프라인을 이해하세요.

## 전체 흐름

```
┌─────────────────────────────────────────────────────────────────┐
│ Tab A (발신)                                                     │
│                                                                  │
│  User scrolls                                                    │
│       ↓                                                          │
│  scroll event                                                    │
│       ↓                                                          │
│  throttleAndDebounce (THROTTLE_DELAY = 50ms)                     │
│  ┌─ 첫 호출: 즉시 실행                                            │
│  └─ 이후: 50ms 간격으로 실행 + 마지막 호출 보장 (debounce)          │
│       ↓                                                          │
│  handleScrollCore()                                              │
│  ├─ grace period 확인 (< 200ms since 프로그래밍적 스크롤?)         │
│  │   └─ YES → return (피드백 루프 방지)                           │
│  ├─ cachedManualOffset 읽기 (동기, 메모리)                        │
│  ├─ 순수 비율 계산: (scrollTop / maxScroll) - offsetRatio          │
│  └─ sendMessage('scroll:sync', ...) → fire-and-forget             │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Background (Service Worker)                                      │
│                                                                  │
│  onMessage('scroll:sync')                                        │
│  ├─ target tab 필터링 (in-memory, 동기)                           │
│  ├─ auto-sync group 멤버 조회 (in-memory Map, 동기)              │
│  ├─ 병합 & 중복 제거 (동기)                                      │
│  └─ 각 target에 sendMessage (Promise.all)                        │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ Tab B (수신)                                                     │
│                                                                  │
│  onMessage('scroll:sync')                                        │
│  ├─ lastSuccessfulSync 갱신 (health check용)                     │
│  ├─ sourceRatio 계산                                             │
│  ├─ manual mode 확인 → YES면 무시                                │
│  ├─ cachedManualOffset 읽기 (동기, 메모리)                        │
│  ├─ targetRatio = sourceRatio + offsetRatio                      │
│  ├─ pixel 변환 & clamp                                           │
│  ├─ lastProgrammaticScrollTime = Date.now()                      │
│  └─ window.scrollTo({ top, behavior: 'auto' })                   │
│       ↓                                                          │
│  scroll event 발생                                               │
│       ↓                                                          │
│  handleScrollCore()                                              │
│  └─ grace period 확인: Date.now() - lastProgrammaticScrollTime   │
│     └─ < 200ms → return (역방향 브로드캐스트 차단) ✓               │
└─────────────────────────────────────────────────────────────────┘
```

## 핵심 타이밍 상수

| 상수                               | 값       | 위치                   | 역할                                    |
| ---------------------------------- | -------- | ---------------------- | --------------------------------------- |
| `THROTTLE_DELAY`                   | 50ms     | `scroll-sync-state.ts` | 스크롤 이벤트 발신 간격                 |
| `PROGRAMMATIC_SCROLL_GRACE_PERIOD` | 200ms    | `scroll-sync-state.ts` | 프로그래밍적 스크롤 후 이벤트 무시 기간 |
| `CONNECTION_CHECK_INTERVAL`        | 30,000ms | `scroll-sync-state.ts` | 연결 상태 확인 주기                     |
| `CONNECTION_TIMEOUT_THRESHOLD`     | 60,000ms | `scroll-sync-state.ts` | 연결 끊김 판정 임계값                   |
| `KEEP_ALIVE_INTERVAL_MS`           | 25,000ms | `keep-alive.ts`        | Background → Content 핑 주기            |

### 상수 간 관계 (반드시 유지해야 할 불변 조건)

```
THROTTLE_DELAY < PROGRAMMATIC_SCROLL_GRACE_PERIOD
  → grace period가 throttle보다 커야 피드백 루프 방지

KEEP_ALIVE_INTERVAL_MS < CONNECTION_TIMEOUT_THRESHOLD
  → 핑이 timeout보다 자주 와야 false disconnect 방지
  → 최소 2회 핑 실패 후에만 disconnect 판정되도록:
    KEEP_ALIVE_INTERVAL_MS * 2 < CONNECTION_TIMEOUT_THRESHOLD

PROGRAMMATIC_SCROLL_GRACE_PERIOD > 파이프라인 최대 지연
  → 파이프라인 지연 = throttle + relay + 브라우저 지터
  → 현재 최악 케이스: ~135ms → grace period 200ms로 안전
```

## 수동 오프셋 (Manual Scroll Offset)

사용자가 Alt/Option 키를 누르고 스크롤하면 개별 탭의 위치를 조정할 수 있습니다.

### 오프셋 생명주기

```
Alt keydown
  → syncState.isManualScrollEnabled = true (동기화 메시지 무시)
  → baseline ratio 스냅샷

Alt keyup
  → 현재 ratio - baseline = offsetRatio
  → storage에 저장 + cachedManualOffset 갱신
  → syncState.isManualScrollEnabled = false

이후 스크롤 동기화:
  발신: pureRatio = currentRatio - cachedManualOffset.ratio
  수신: targetRatio = sourceRatio + cachedManualOffset.ratio
```

### 캐시 동기화 지점

cachedManualOffset은 다음 시점에 갱신됩니다:

| 시점                 | 동작                               | 위치                                             |
| -------------------- | ---------------------------------- | ------------------------------------------------ |
| 동기화 시작          | 스토리지에서 로드                  | `scroll:start` handler                           |
| Alt+스크롤 종료      | 새 값으로 갱신                     | `keyboard-handler.ts` → `updateOffsetCache` 콜백 |
| Wheel 수동 모드 종료 | 새 값으로 갱신                     | `exitWheelManualMode()`                          |
| URL 변경 (발신)      | `{ratio: 0, pixels: 0}`으로 초기화 | `broadcastUrlChange()`                           |
| URL 변경 (수신)      | `{ratio: 0, pixels: 0}`으로 초기화 | `url:sync` handler                               |
| 동기화 중지          | `{ratio: 0, pixels: 0}`으로 초기화 | `scroll:stop` handler                            |

## 연결 상태 모니터링

```
┌──────────────────────────────────────────────────────┐
│ Background                                            │
│                                                       │
│  keep-alive (25초 간격)                                │
│  └─ sendMessage('scroll:ping') → Content Script       │
│     └─ 응답 없으면 → connectionStatuses[tabId] 갱신    │
└──────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────┐
│ Content Script                                        │
│                                                       │
│  Health check (30초 간격)                              │
│  └─ Date.now() - lastSuccessfulSync > 60초?           │
│     └─ YES → isHealthy = false → 주황색 뱃지           │
│     └─ NO  → isHealthy = true  → 파란색 뱃지           │
│                                                       │
│  lastSuccessfulSync 갱신 시점:                         │
│  ├─ scroll:sync 수신 시                                │
│  ├─ scroll:ping 수신 시   ← 유휴 상태 대응              │
│  ├─ 동기화 시작 시                                     │
│  ├─ 재연결 성공 시                                     │
│  └─ visibility change 핑 성공 시                       │
└──────────────────────────────────────────────────────┘
```
