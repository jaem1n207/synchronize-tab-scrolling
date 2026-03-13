# 도메인 제외 관리 가이드

이 문서는 동기화 제안 토스트의 도메인 제외 기능의 구조, 동작 방식, 코드 수정 시 주의사항을 설명합니다.

---

## 개요

동기화 제안 토스트는 같은 URL의 탭이 2개 이상 열릴 때 나타납니다. 그러나 GitHub처럼 여러 탭을 동시에 열어두는 사이트에서는 노이즈가 됩니다. 도메인 제외 기능은 이 문제를 두 가지 레벨로 해결합니다:

| 레벨              | 메커니즘                | 지속 시간 | 트리거                                                                     |
| ----------------- | ----------------------- | --------- | -------------------------------------------------------------------------- |
| **일시적 스누즈** | 인메모리 타임스탬프     | 2시간     | 토스트에서 "나중에" 또는 "✕" 클릭                                          |
| **영구 제외**     | `browser.storage.local` | 영구      | 토스트에서 "이 사이트에 대해 다시 표시하지 않기" 또는 팝업에서 도메인 추가 |

---

## 아키텍처

### 데이터 흐름

```
사용자 액션
    ↓
┌─────────────────────────────────────────────────┐
│ Content Script (토스트 UI)                        │
│                                                  │
│  "나중에" / "✕" 클릭                              │
│       → snooze-domain 메시지 전송                  │
│                                                  │
│  "이 사이트에 대해 다시 표시하지 않기" 클릭           │
│       → exclude-domain-permanent 메시지 전송       │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ Background Script                                │
│                                                  │
│  snooze-domain                                   │
│       → snoozedDomains Map에 도메인 + 타임스탬프    │
│       → 2시간 후 자동 만료                          │
│                                                  │
│  exclude-domain-permanent                        │
│       → browser.storage.local에 영구 저장           │
│       → auto-sync 그룹에서 즉시 제거                │
└──────────────────────┬──────────────────────────┘
                       ↓
┌─────────────────────────────────────────────────┐
│ 제안 가드 (showSyncSuggestion 진입점)              │
│                                                  │
│  1. syncState.isActive 확인                       │
│  2. isDomainSnoozed(domain) 확인 ← 인메모리        │
│  3. isExcludedDomain(domain) 확인 ← 스토리지       │
│  4. 모두 통과 시에만 토스트 표시                     │
└─────────────────────────────────────────────────┘
```

### 관련 모듈

| 모듈                                               | 역할                                         |
| -------------------------------------------------- | -------------------------------------------- |
| `src/background/lib/auto-sync-suggestions.ts`      | 스누즈 상태 관리, 제안 가드                  |
| `src/background/handlers/auto-sync-handlers.ts`    | 메시지 핸들러 등록                           |
| `src/shared/lib/storage.ts`                        | `loadExcludedDomains`, `saveExcludedDomains` |
| `src/shared/lib/url-utils.ts`                      | `normalizeDomain` — URL에서 도메인 추출      |
| `src/popup/hooks/use-domain-exclusions.ts`         | 팝업 UI 상태 관리 훅                         |
| `src/popup/components/excluded-domains-dialog.tsx` | 제외 도메인 관리 다이얼로그                  |

---

## 일시적 스누즈

### 동작 방식

1. 토스트에서 "나중에" 클릭 또는 "✕" 버튼 클릭
2. Content script → Background로 `snooze-domain` 메시지 전송
3. Background의 `snoozedDomains: Map<string, number>`에 `domain → Date.now()` 저장
4. 이후 제안 시 `isDomainSnoozed(domain)` 확인: `Date.now() - timestamp < SNOOZE_DURATION_MS`

### 핵심 상수

```typescript
const SNOOZE_DURATION_MS = 2 * 60 * 60 * 1000; // 2시간
```

### 주의사항

- **인메모리 전용**: Service worker 재시작 시 스누즈 상태가 초기화됩니다. 이는 의도된 동작입니다 — 스누즈는 일시적이므로 영속화가 불필요합니다.
- **도메인 레벨**: 스누즈는 정확한 URL이 아닌 도메인 단위로 적용됩니다. `github.com/repo-a`를 스누즈하면 `github.com/repo-b`에서도 토스트가 표시되지 않습니다.

---

## 영구 제외

### 저장 구조

```typescript
// browser.storage.local
{
  excludedDomains: string[]  // ["github.com", "stackoverflow.com"]
}
```

### 도메인 정규화

`normalizeDomain()` 함수가 다양한 입력 형식을 순수 도메인으로 변환합니다:

```
https://github.com/jaem1n207/repo → github.com
http://www.example.com:8080/path  → example.com
github.com                        → github.com
user@example.com                  → (유효하지 않음)
```

처리 순서:

1. 앞뒤 공백 제거
2. 프로토콜이 없으면 `https://` 추가
3. `new URL()`로 파싱
4. hostname 추출
5. `www.` 접두사 제거

---

## 팝업 UI — 제외 도메인 관리

### 컴포넌트 구조

```
ActionsMenu
  └→ "제외 도메인 관리" 버튼
       └→ ExcludedDomainsDialog (Radix Dialog)
            ├── 입력란 (role="combobox")
            │   ├── 실시간 도메인 프리뷰
            │   └── 중복 경고
            └── 도메인 목록 (role="listbox")
                └── 도메인 항목 (role="option")
                    ├── 글로브 아이콘 + 도메인 텍스트
                    └── ✕ 제거 버튼
```

### 키보드 내비게이션

입력란에 포커스를 유지하면서 `aria-activedescendant` 패턴으로 목록을 탐색합니다:

| 키            | 동작                                                                     |
| ------------- | ------------------------------------------------------------------------ |
| `↓`           | 목록의 다음 항목 선택 (없으면 첫 번째 항목)                              |
| `↑`           | 목록의 이전 항목 선택 (첫 번째에서 위로 가면 선택 해제)                  |
| `Enter`       | 선택된 항목 없음: 입력값으로 도메인 추가                                 |
| `Enter` (1회) | 선택된 항목 있음: 삭제 대기 상태로 전환 (destructive 스타일 + 확인 힌트) |
| `Enter` (2회) | 삭제 대기 상태: 실제 삭제 실행                                           |
| `Backspace`   | 입력이 비어있고 항목이 선택된 경우: 즉시 삭제                            |
| `Delete`      | 선택된 항목 즉시 삭제                                                    |
| `Escape`      | 삭제 대기 상태 해제 → 선택 해제 → 다이얼로그 닫기 (단계적)               |
| 문자 입력     | 선택 해제, 입력으로 복귀                                                 |

### 2단계 Enter 확인

실수로 도메인을 삭제하는 것을 방지하기 위해 Enter 키에 확인 단계가 있습니다:

```
상태 1: 항목 선택됨 (border-ring, bg-accent)
    ↓ Enter
상태 2: 삭제 대기 (border-destructive, bg-destructive/10, "Enter를 눌러 제거" 힌트)
    ↓ Enter
상태 3: 삭제 실행 → 인접 항목으로 선택 이동
```

취소 방법:

- `Escape`: 삭제 대기만 해제 (선택은 유지)
- `↑`/`↓`: 다른 항목으로 이동 (삭제 대기 해제)
- 문자 입력: 선택 해제 + 삭제 대기 해제

### 실시간 유효성 검사

입력 시 `previewDomain()` 함수가 즉시 피드백을 제공합니다:

| 입력                       | 프리뷰                                                       |
| -------------------------- | ------------------------------------------------------------ |
| `https://github.com/repo`  | `→ github.com` (추출된 도메인 표시)                          |
| `github.com` (이미 제외됨) | `→ github.com — 이미 제외된 도메인입니다` (destructive 색상) |
| 유효하지 않은 입력         | 프리뷰 없음, 추가 버튼 비활성화                              |

중복 도메인인 경우 "추가" 버튼이 자동으로 비활성화됩니다.

### 포커스 관리

- 다이얼로그 내: 입력란에 포커스 유지 (`tabIndex={-1}`로 버튼에서 탭 포커스 제외)
- 다이얼로그 닫힌 후: 검색 인풋(`TabCommandPalette`)에 자동 포커스 복원 (100ms 딜레이)
- ActionsMenu 닫힌 후: 동일한 검색 인풋 포커스 복원 패턴

---

## IME (CJK 입력) 지원

키보드 내비게이션은 한국어/일본어/중국어 입력 중에 간섭하지 않습니다:

```typescript
if (e.nativeEvent.isComposing || e.keyCode === 229) return;
```

- `isComposing`: 표준 IME 조합 상태 감지
- `keyCode === 229`: 일부 브라우저의 IME 조합 중 키코드 (레거시 호환)

이 가드가 없으면 한글 조합 중 `Enter`가 도메인 추가를 트리거하거나, 화살표 키가 목록 탐색으로 해석되는 문제가 발생합니다.

---

## 수정 시 주의사항

### 1. 도메인 정규화 일관성

`normalizeDomain()`은 토스트(Content Script)와 팝업(Popup) 양쪽에서 사용됩니다. 두 경로의 정규화 결과가 다르면 토스트에서 "이 사이트에 대해 다시 표시하지 않기"를 눌러도 팝업 목록에 표시되지 않는 불일치가 발생합니다.

### 2. 스토리지 동기화

영구 제외 도메인은 `browser.storage.local`에 저장됩니다. Background Script와 Popup이 동시에 읽기/쓰기할 수 있으므로:

- Popup: `sendMessage`로 Background에 추가/삭제 요청 → Background가 스토리지 갱신
- Background: 스토리지 변경 감지 → 인메모리 캐시 갱신

### 3. i18n 키 관리

도메인 제외 관련 i18n 키는 `extension/_locales/`와 `src/shared/i18n/_locales/` **양쪽에** 동기화해야 합니다:

- `extension/_locales/`: 런타임에 브라우저가 사용
- `src/shared/i18n/_locales/`: TypeScript `MessageKey` 타입 추론용

한쪽만 추가하면 런타임 오류(키 누락) 또는 타입 오류(`MessageKey`에 없음)가 발생합니다.

### 4. 삭제 확인 상태 초기화

`pendingRemoveDomain` 상태는 다음 상황에서 반드시 초기화해야 합니다:

- 다이얼로그 닫힘 (`open` 변경)
- 선택된 도메인이 외부에서 제거됨 (`excludedDomains` 변경)
- 방향키로 다른 항목으로 이동
- 문자 입력 시작
- 입력값 변경

초기화가 누락되면 이전 항목의 삭제 대기 상태가 남아 의도하지 않은 삭제가 발생할 수 있습니다.

### 5. UI 레이아웃 제약 조건

`ExcludedDomainsDialog`는 Radix `DialogContent` 내부에 렌더링됩니다. 두 가지 CSS 제약 조건을 반드시 유지해야 합니다:

#### CSS Grid `min-width: auto` 문제

`DialogContent`는 내부적으로 `display: grid`를 사용합니다. Grid 항목은 기본적으로 `min-width: auto`가 적용되어, 콘텐츠 너비 이하로 축소되지 않습니다. 긴 도메인 이름이 있으면 다이얼로그 경계를 넘어 오버플로우됩니다.

```tsx
❌ BAD: min-w-0 누락
<DialogContent>
  <div className="space-y-4">  ← Grid 항목이 콘텐츠 너비로 확장
    <span className="truncate">very-long-domain.vercel.app</span>
    → truncate가 동작하지 않음, 텍스트가 다이얼로그 밖으로 넘침
  </div>
</DialogContent>

✅ GOOD: min-w-0으로 Grid 항목 축소 허용
<DialogContent>
  <div className="space-y-4 min-w-0">  ← 콘텐츠 너비 이하로 축소 가능
    <span className="truncate">very-long-domain.vercel.app</span>
    → truncate 정상 동작, 말줄임표 표시
  </div>
</DialogContent>
```

`truncate` CSS 체인이 동작하려면 **모든 상위 요소**가 너비 제약을 가져야 합니다:

- `DialogContent` → 고정 너비 (`max-w-*` 제약, 현재 `max-w-md`)
- `space-y-4` wrapper → `min-w-0` (Grid 항목 축소 허용)
- 도메인 텍스트 컨테이너 → `min-w-0` (Flex 항목 축소 허용)
- 도메인 텍스트 → `truncate` (말줄임표)

#### Radix ScrollArea와 Dialog 스크롤 충돌

Radix `Dialog`는 내부적으로 `react-remove-scroll`을 사용하여 배경 스크롤을 차단합니다. 이 컴포넌트 내부에 Radix `ScrollArea`를 중첩하면 wheel 이벤트가 Dialog의 스크롤 잠금에 의해 차단되어 마우스 스크롤이 동작하지 않습니다.

```tsx
❌ BAD: Radix Dialog 내부에 Radix ScrollArea 중첩
<DialogContent>
  <ScrollArea className="max-h-[240px]">
    <ul>{domains}</ul>
  </ScrollArea>
</DialogContent>
→ react-remove-scroll이 wheel 이벤트를 가로챔 → 스크롤 불가

✅ GOOD: 네이티브 overflow 스크롤 사용
<DialogContent>
  <div className="max-h-[240px] overflow-y-auto overscroll-contain">
    <ul>{domains}</ul>
  </div>
</DialogContent>
→ 브라우저 네이티브 스크롤 → 정상 동작
```

`overscroll-contain`은 도메인 목록의 스크롤이 끝까지 도달했을 때 Dialog 자체가 스크롤되는 것(스크롤 체이닝)을 방지합니다.
