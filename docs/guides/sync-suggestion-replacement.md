# 동기화 제안 토스트의 기존 동기화 교체 가이드

이 문서는 동기화 제안 토스트가 기존 활성 동기화를 교체할 때의 동작 방식, 아키텍처, 코드 수정 시 주의사항을 설명합니다.

---

## 개요

동기화 제안 토스트는 사용자가 팝업의 **같은 페이지 탭 자동 제안**을 켠 경우에만 표시됩니다. `autoSyncEnabled`의 기본값은 `false`이며, storage 값이 없거나 boolean이 아니거나 읽기에 실패하면 비활성 상태로 취급합니다. 최초 제안과 Add 제안은 표시 직전에도 `autoSyncState.enabled === true`를 확인합니다.

Tab1+Tab2가 동기화 중인 상태에서 Tab3+Tab4가 다른 URL로 열리고 자동 제안이 켜져 있으면 동기화 제안 토스트가 표시됩니다. 사용자가 이 토스트를 수락하면 기존 동기화가 **조용히 교체**됩니다.

표시되는 모든 제안은 그 시점의 committed manual `revision`을 `expectedRevision`으로
보관합니다. 수락 응답은 transition gate 안에서 현재 revision과 다시 비교합니다. stale
응답은 manual/auto 상태와 pending suggestion을 바꾸지 않고 거부합니다.

accepted Add/Replace와 Quick Sync는 같은 `syncTransitionGate`를 사용합니다. Add는 shared
`sync-session-orchestrator.ts`로 새 탭 하나만 초기화하고, Replace는 durable manual Stop 뒤
`legacy-auto-sync-adapter.ts`로 accepted auto group을 시작합니다. Quick Sync 후보/command
계약과 transaction 순서는
[`quick-sync-shortcut.md`](./quick-sync-shortcut.md)를 참고하세요.

이 과정에서 두 가지 문제가 발생할 수 있습니다:

| 문제              | 증상                                             | 원인                              |
| ----------------- | ------------------------------------------------ | --------------------------------- |
| **고아 DOM 요소** | Tab1, Tab2에 `scroll-sync-panel-root`가 남아있음 | `scroll:stop` 없이 새 동기화 시작 |
| **사용자 혼란**   | 기존 동기화가 사라진 이유를 알 수 없음           | 교체 전 경고 없음                 |

해결책은 두 가지입니다. 교체 전 기존 탭에 `scroll:stop`을 전송하여 정리하고, 토스트 UI에 경고 배너를 표시하여 사용자에게 교체 사실을 알립니다.

---

## 번역 페이지 매칭

동기화 제안은 이제 같은 페이지의 번역판도 감지합니다. Background Service Worker는 각 URL에서 로케일만 나타내는 부분을 제거하고, 페이지 정체성을 나타내는 부분은 보존하여 번역 페이지 키를 만듭니다.

높은 신뢰도로 같은 번역 페이지로 판단하는 로케일 전달 방식은 다음과 같습니다:

- 경로 세그먼트: `/en/docs/install`과 `/tr/docs/install`
- 쿼리 로케일 키: `/docs/install?lang=en`과 `/docs/install?lang=tr`
- 서브도메인: `https://en.example.com/docs/install`과 `https://tr.example.com/docs/install`

쿼리 파라미터는 그룹화 전에 역할별로 분류합니다:

- 로케일 쿼리 키는 값이 실제 로케일일 때만 번역 페이지 키에서 제거합니다: `lang`, `locale`, `hl`, `language`, `lng`, `ui`, `culture`
- 추적 쿼리 키는 번역 페이지 키에서 제거합니다: `utm_*`, `ref`, `source`, `fbclid`, `gclid`
- 페이지 정체성 쿼리 키는 번역 페이지 키에 남깁니다. 예: `id`, `page`, `doc`, `article`, `slug`
- 로케일처럼 보이는 키라도 값이 로케일이 아니면 페이지 정체성으로 보존합니다. 예: `language=typescript`, `language=python`

번역된 슬러그는 중간 신뢰도로만 처리합니다. 예를 들어 `/en/getting-started`와 `/tr/baslangic`처럼 경로 자체가 달라지는 경우에는 `link rel="alternate" hreflang` 또는 canonical 관계처럼 결정적인 페이지 메타데이터가 있어야 합니다. 메타데이터를 가져올 수 없거나, 응답 URL이 요청한 탭 URL과 맞지 않거나, 두 페이지를 연결하는 관계가 확인되지 않으면 번역 페이지 제안을 표시하지 않습니다.

활성 동기화 중 새 탭을 추가할 때도 같은 번역 페이지 키와 메타데이터 관계를 사용합니다. 따라서 이미 동기화 중인 탭의 로케일 전달 방식이 다르더라도, 새 탭이 같은 번역 페이지 키를 만들거나 결정적인 메타데이터로 연결될 때만 추가 탭 제안이 표시됩니다.

---

## 아키텍처

### 메시지 흐름

```
autoSyncEnabled 명시적 true 확인 + expectedRevision 캡처
    ↓
사용자가 동기화 제안 수락
    ↓
Background (sync-suggestion:response handler)
    ├─ transition gate에서 expectedRevision 재검증
    ├─ 기존 manual 동기화 활성 확인
    │
    ├─ [기존 동기화가 활성인 경우]
    │   ├─ inactive revision+1 상태를 먼저 영속화
    │   ├─ committed memory를 inactive로 갱신
    │   └─ 기존 탭 cleanup과 manual override/keep-alive 정리
    │
    ├─ LegacyAutoSyncAdapter로 수락한 auto group 시작
    └─ inactive manual revision+1을 영속화한 뒤 memory commit
```

auto group 시작 성공 뒤 manual-state 영속화가 실패하면 adapter가 시작한 auto group을
rollback합니다. 이때 manual truth는 검증되지 않은 이전 세션으로 복구하지 않고, 이미
durable하게 완료된 post-Stop inactive 상태에 남습니다. auto start 자체가 실패해도 같은
inactive truth를 유지합니다. auto 전환에서는 manual Start를 호출하거나 `sessionEpoch`를
증가시키지 않습니다.

accepted auto group은 require-all로 시작합니다. content runtime은 ACK보다 먼저 활성화될 수
있으므로 timeout, invalid ACK, 전송 실패, group snapshot 충돌이 발생하면 ACK 성공 여부와
무관하게 Start를 시도한 모든 탭에 1000ms 제한의 `scroll:stop`을 보냅니다. Stop은 요청한
tab ID의 정확한 성공 ACK만 cleanup 완료로 인정합니다. 실패하거나 ACK가 일치하지 않으면
Task 10의 transition-gated retry scheduler가 1초, 3초, 10초 간격으로 재시도하며, 더 최신
manual session epoch 또는 해당 탭을 포함한 active manual session을 발견하면 취소합니다.
cleanup이 완전하지 않은 acceptance/rollback은 `auto-sync-degraded` warning을 반환합니다.

Add 제안 수락은 `addTabToManualSession()`으로 전달됩니다. 새 탭 하나에만 `scroll:start`를
보내고 기존 linked tab을 다시 초기화하지 않으며, 성공한 topology commit만 revision을
증가시킵니다.

### 관련 모듈

| 모듈                                                                           | 역할                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `auto-sync-handlers.ts`                                                        | revision 검증 후 accepted Replace/Add를 transition gate로 전달            |
| `legacy-auto-sync-adapter.ts`                                                  | accepted auto group Start/rollback과 inactive manual revision commit      |
| `sync-session-orchestrator.ts`                                                 | durable manual Stop과 새 탭 하나만 초기화하는 Add                         |
| `auto-sync-suggestions.ts` (`showSyncSuggestion`, `sendSuggestionToSingleTab`) | explicit opt-in gate, `expectedRevision`, `hasExistingSync` 컨텍스트 포함 |
| `sync-suggestion-toast.tsx`                                                    | 경고 UI 표시 (amber 배너 + "교체 후 동기화" 버튼)                         |
| `messages.ts` + `shim.d.ts`                                                    | initial/Add 표시와 모든 응답에 필수 `expectedRevision`                    |

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

### 1. 기존 동기화 정리와 commit 순서

> 기존 manual Stop은 accepted auto `scroll:start` 전에 durable하게 commit되어야 합니다.

정리 순서가 잘못되면 기존 탭이 새 동기화 그룹의 스크롤 이벤트를 수신하거나, `scroll-sync-panel-root`가 고아 상태로 남습니다.

```typescript
// ❌ BAD: stale 응답을 합치거나 manual Start로 auto 전환
await startManualSession(context, acceptedTabs);

// ✅ GOOD: revision 검증 → durable Stop → accepted auto Start
await replaceManualWithAcceptedAutoSync(context, {
  normalizedUrl,
  tabIds: acceptedTabs,
  expectedRevision,
});
```

manual Stop은 inactive state를 먼저 영속화하므로 일부 content cleanup이 실패해도 세션을
되살리지 않습니다. cleanup은 탭별 1000ms 제한과 retry scheduler를 사용합니다.

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

다음을 직접 검증합니다.

- stale `expectedRevision`은 manual/auto/pending state를 바꾸지 않는지
- replacement가 durable manual Stop 후 accepted auto group을 시작하는지
- auto start 실패 시 post-Stop inactive truth를 유지하는지
- Add 수락이 새 탭 하나만 초기화하고 기존 탭을 재시작하지 않는지

### `legacy-auto-sync-adapter.test.ts`

- accepted auto group의 `isAutoSync: true` require-all Start
- timeout/invalid ACK/partial success에서 attempted tab 전체 cleanup
- group snapshot 변경 시 attempted runtime 전체 cleanup
- Stop ACK 불일치/throw 시 gated retry와 `auto-sync-degraded` 결과
- manual revision persistence 실패 시 auto group rollback과 cleanup degradation 전파
- 성공 시 inactive revision 증가와 `sessionEpoch` 보존

### `auto-sync-suggestions.test.ts`

**"includes hasExistingSync context when sync is active but URL does not match"**

동기화가 활성 상태이고 새 탭의 URL이 기존 동기화 탭과 다를 때, `sendSuggestionToSingleTab`이 전송하는 페이로드에 `hasExistingSync: true`와 `existingSyncTabCount`가 포함되는지 검증합니다.

검증 항목:

- `syncState.isActive && syncState.linkedTabs.length > 0`일 때 `hasExistingSync: true`
- `existingSyncTabCount`가 `syncState.linkedTabs.length`와 일치하는지
- 동기화가 비활성일 때 `hasExistingSync: false`

### toast transport tests

- standalone initial/Add accept, decline, snooze, permanent 응답이 표시 payload의
  `expectedRevision`을 그대로 echo하는지
- panel-mounted initial/Add accept/decline도 같은 revision을 echo하는지
- auto-sync가 false 또는 malformed일 때 최초/Add 토스트가 표시되지 않는지
