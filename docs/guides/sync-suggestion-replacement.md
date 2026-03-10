# 동기화 제안 토스트의 기존 동기화 교체 가이드

이 문서는 동기화 제안 토스트가 기존 활성 동기화를 교체할 때의 동작 방식, 아키텍처, 코드 수정 시 주의사항을 설명합니다.

---

## 개요

Tab1+Tab2가 동기화 중인 상태에서 Tab3+Tab4가 다른 URL로 열리면 동기화 제안 토스트가 표시됩니다. 사용자가 이 토스트를 수락하면 기존 동기화가 **조용히 교체**됩니다.

이 과정에서 두 가지 문제가 발생할 수 있습니다:

| 문제              | 증상                                             | 원인                              |
| ----------------- | ------------------------------------------------ | --------------------------------- |
| **고아 DOM 요소** | Tab1, Tab2에 `scroll-sync-panel-root`가 남아있음 | `scroll:stop` 없이 새 동기화 시작 |
| **사용자 혼란**   | 기존 동기화가 사라진 이유를 알 수 없음           | 교체 전 경고 없음                 |

해결책은 두 가지입니다. 교체 전 기존 탭에 `scroll:stop`을 전송하여 정리하고, 토스트 UI에 경고 배너를 표시하여 사용자에게 교체 사실을 알립니다.

---

## 아키텍처

### 메시지 흐름

```
사용자가 동기화 제안 수락
    ↓
Background (sync-suggestion:response handler)
    ├─ 기존 동기화 활성 확인 (syncState.isActive)
    │
    ├─ [기존 동기화가 활성인 경우]
    │   ├─ 기존 탭에 scroll:stop 전송 (Promise.allSettled, 1000ms 타임아웃)
    │   ├─ manualSyncOverriddenTabs에서 기존 탭 제거
    │   ├─ stopKeepAlive() 호출
    │   ├─ addTabSuggestedTabs 초기화
    │   └─ syncState 리셋
    │
    └─ 새 동기화 시작 (scroll:start to new tabs)
```

### 관련 모듈

| 모듈                                                                           | 역할                                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `auto-sync-handlers.ts` (line 146-176)                                         | 기존 동기화 정리 후 새 동기화 시작                                       |
| `auto-sync-suggestions.ts` (`showSyncSuggestion`, `sendSuggestionToSingleTab`) | `hasExistingSync` 컨텍스트 포함                                          |
| `sync-suggestion-toast.tsx`                                                    | 경고 UI 표시 (amber 배너 + "교체 후 동기화" 버튼)                        |
| `messages.ts`                                                                  | `SyncSuggestionMessage`에 `hasExistingSync`, `existingSyncTabCount` 추가 |

---

## 토스트 UI 동작

토스트는 `hasExistingSync` 값에 따라 두 가지 모드로 동작합니다.

### 기존 동기화 없음 (`hasExistingSync: false`)

일반적인 동기화 제안 흐름입니다. 기존과 동일하게 "동기화 시작" 버튼이 표시됩니다.

```
┌─────────────────────────────────────────┐
│  같은 URL의 탭이 감지되었습니다.          │
│                                         │
│  [나중에]          [동기화 시작]          │
└─────────────────────────────────────────┘
```

### 기존 동기화 있음 (`hasExistingSync: true`)

amber 색상의 경고 배너가 추가되고, 버튼 레이블이 변경됩니다.

```
┌─────────────────────────────────────────┐
│  같은 URL의 탭이 감지되었습니다.          │
│                                         │
│  ⚠ 현재 N개 탭이 동기화 중입니다.        │  ← amber 배너
│    수락하면 기존 동기화가 종료됩니다.     │
│                                         │
│  [나중에]        [교체 후 동기화]         │  ← 버튼 레이블 변경
└─────────────────────────────────────────┘
```

`existingSyncTabCount`는 경고 메시지에서 기존 동기화 탭 수를 표시하는 데 사용됩니다. 사용자가 얼마나 많은 탭의 동기화가 중단되는지 파악할 수 있습니다.

---

## 코드 수정 시 주의사항

### 1. 기존 동기화 정리 순서

> `scroll:stop`은 반드시 새 `scroll:start` 전에 완료되어야 합니다.

정리 순서가 잘못되면 기존 탭이 새 동기화 그룹의 스크롤 이벤트를 수신하거나, `scroll-sync-panel-root`가 고아 상태로 남습니다.

```typescript
// ❌ BAD: 정리 없이 새 동기화 시작
await startNewSync(newTabs);

// ✅ GOOD: 정리 후 새 동기화 시작
await Promise.allSettled(
  existingTabs.map((tabId) =>
    withTimeout(sendMessage('scroll:stop', {}, `content-script@${tabId}`), 1000),
  ),
);
await startNewSync(newTabs);
```

`Promise.allSettled`를 사용하는 이유는 일부 탭이 이미 닫혔거나 응답하지 않아도 나머지 정리 작업이 계속 진행되어야 하기 때문입니다. `Promise.all`을 사용하면 하나의 탭이 실패할 때 전체 정리가 중단됩니다.

타임아웃을 1000ms로 제한하는 이유는 비활성 탭이 응답하지 않을 때 무한 대기를 방지하기 위해서입니다.

### 2. `hasExistingSync` 조건

> `syncState.isActive && syncState.linkedTabs.length > 0` 두 조건을 모두 확인해야 합니다.

```typescript
// ❌ BAD: isActive만 확인
const hasExistingSync = syncState.isActive;

// ✅ GOOD: linkedTabs도 함께 확인
const hasExistingSync = syncState.isActive && syncState.linkedTabs.length > 0;
```

`syncState.isActive`가 `true`여도 `linkedTabs`가 빈 배열인 경우가 있습니다. 이 상태에서 정리 로직을 실행하면 불필요한 `scroll:stop` 브로드캐스트가 발생하고, `stopKeepAlive()`가 의도치 않게 호출됩니다.

### 3. i18n 키 동기화

> `existingSyncWarning`, `replaceSyncButton` 키는 9개 로케일 모두에 존재해야 합니다.

토스트 UI는 Content Script에서 렌더링됩니다. 따라서 `extension/_locales/`가 아닌 `src/shared/i18n/_locales/`에 키를 추가해야 합니다.

| 위치                        | 용도                                                |
| --------------------------- | --------------------------------------------------- |
| `extension/_locales/`       | 런타임에 브라우저가 사용 (팝업, 백그라운드)         |
| `src/shared/i18n/_locales/` | Content Script용, TypeScript `MessageKey` 타입 추론 |

한쪽만 추가하면 런타임 오류(키 누락) 또는 타입 오류(`MessageKey`에 없음)가 발생합니다. 지원 로케일은 `en`, `ko`, `ja`, `fr`, `es`, `de`, `zh_CN`, `zh_TW`, `hi` 9개입니다.

---

## 테스트 커버리지

### `auto-sync-handlers.test.ts`

**"accepted response stops existing sync before starting new one"**

기존 동기화가 활성인 상태에서 제안을 수락했을 때, `scroll:stop`이 기존 탭에 전송된 후 `scroll:start`가 새 탭에 전송되는 순서를 검증합니다.

검증 항목:

- `scroll:stop` 호출 횟수가 기존 탭 수와 일치하는지
- `scroll:stop` 완료 후 `scroll:start`가 호출되는지
- `syncState`가 새 탭 정보로 갱신되는지

### `auto-sync-suggestions.test.ts`

**"includes hasExistingSync context when sync is active but URL does not match"**

동기화가 활성 상태이고 새 탭의 URL이 기존 동기화 탭과 다를 때, `sendSuggestionToSingleTab`이 전송하는 페이로드에 `hasExistingSync: true`와 `existingSyncTabCount`가 포함되는지 검증합니다.

검증 항목:

- `syncState.isActive && syncState.linkedTabs.length > 0`일 때 `hasExistingSync: true`
- `existingSyncTabCount`가 `syncState.linkedTabs.length`와 일치하는지
- 동기화가 비활성일 때 `hasExistingSync: false`
