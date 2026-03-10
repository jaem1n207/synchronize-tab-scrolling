# 004: Sync Suggestion Toast During Active Sync

- **Status**: Completed
- **Branch**: `fix/suggestion-toast-during-sync` → merged into `release/2.9.0`
- **PR**: #338
- **Commits**: `7c32a5b`, `6b4af95`, `d915b82`, `e8cbc49`, `604f6ec`, `9034d23`

## Background

동기화가 활성 상태일 때 sync suggestion toast가 잘못 표시되는 버그. 토스트는 동일 URL을 가진 탭이 2개 이상 있고 동기화가 **비활성**일 때만 나타나야 하며, 동기화 시작 시 사라지고 새로운 동일 URL 탭 생성 또는 동기화 중지 시에만 다시 나타나야 한다.

---

## 근본 원인 (3가지 상호작용)

### 원인 1: `main.ts` 레이스 컨디션

`initializeAutoSync()`가 `restoreSyncState()` 완료를 기다리지 않고 독립 호출. 서비스 워커 재시작 시 `syncState.isActive`가 `false`(기본값)인 상태에서 auto-sync 그룹 스캔이 실행되어, 이미 동기화 중인 탭이 auto-sync 그룹에 다시 추가됨.

### 원인 2: `manualSyncOverriddenTabs` 메모리 전용

MV3 서비스 워커 재시작 시 `Set<number>`가 소실. `syncState.linkedTabs`에서 복원하지 않으면 `isTabManuallyOverridden()`이 동기화 중인 탭에 대해 `false` 반환 → auto-sync 그룹 추가 → 그룹 ≥ 2 → `showSyncSuggestion()` 호출.

### 원인 3: content script ping 의존성

`showSyncSuggestion`이 500ms 타임아웃 ping에만 의존. Chrome이 백그라운드 탭을 throttle하여 ping 불안정. 배경 스크립트에서 `syncState.isActive`와 `syncState.linkedTabs`에 직접 접근 가능하지만 미사용.

### 추가 이슈: BLOCK A 중복 호출

`onUpdated` 핸들러의 BLOCK A가 매 `onUpdated` 이벤트마다 중복 없이 `showAddTabSuggestion`을 호출.

---

## 수정

| 커밋      | 파일                                          | 내용                                                                                                                |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `7c32a5b` | `main.ts`                                     | `initializeAutoSync()`가 `restoreSyncState()` 완료 대기. `syncState.linkedTabs`에서 `manualSyncOverriddenTabs` 복원 |
| `6b4af95` | `auto-sync-suggestions.ts`                    | `showSyncSuggestion()`에 `syncState.isActive` + `hasSyncedTabMatchingUrl()` 체크 추가 (ping 이전)                   |
| `d915b82` | `tab-event-handlers.ts`                       | `onUpdated` BLOCK B에 `!(syncState.isActive && syncState.linkedTabs.includes(tabId))` 가드                          |
| `e8cbc49` | `auto-sync-state.ts`, `tab-event-handlers.ts` | `addTabSuggestedTabs` Set으로 BLOCK A 중복 방지                                                                     |
| `604f6ec` | `scroll-sync-handlers.ts`                     | sync start 시 임계값 미만 `pendingSuggestions` 정리, sync stop 시 `addTabSuggestedTabs` 초기화                      |

---

## 테스트 (`9034d23`)

7개 테스트 케이스 추가:

- `auto-sync-suggestions.test.ts` — syncState 활성 + URL 매칭 시 생략, URL 불일치 시 정상 표시, 백그라운드 체크 조기 반환, 비활성 시 정상 동작
- `tab-event-handlers.test.ts` — addTabSuggestedTabs 중복 방지, BLOCK B 가드 검증
- `scroll-sync-handlers.test.ts` — pendingSuggestions 정리, addTabSuggestedTabs 초기화, auto-sync 시 미정리 확인

---

## 검증

- `pnpm typecheck` — 통과
- `pnpm lint:fix` — 통과
- `pnpm test` — 667/667 통과
- `pnpm build` — 성공
