# 문제 해결 문서 (Troubleshooting Guide)

이 문서는 Synchronize Tab Scrolling 브라우저 확장 프로그램 개발 과정에서 해결한 기술적 문제들을 정리한 것입니다.

## 개요

### 대상 독자

- 프로젝트 유지보수 개발자
- 브라우저 확장 프로그램 개발 시 유사 문제를 겪는 개발자

### 기술 스택

- React 19, TypeScript, Vite
- UnoCSS + Tailwind + Shadcn UI
- webextension-polyfill, webext-bridge
- Manifest V3 (Chrome/Edge/Brave), Manifest V2 (Firefox)

### 문서 구성

- **카테고리 A**: Shadow DOM 스타일링 문제
- **카테고리 B**: 탭 간 상태 동기화 문제
- **카테고리 C**: 스크롤 이벤트 처리 문제
- **카테고리 D**: 크로스 브라우저 호환성 문제 _(레거시)_
- **카테고리 E**: 빌드 및 배포 자동화 _(레거시)_
- **부록 B**: 코드 작성 철학 _(레거시)_

---

## 문제 요약 테이블

| ID  | 카테고리             | 문제                       | 핵심 원인                  | 해결 키                           |
| --- | -------------------- | -------------------------- | -------------------------- | --------------------------------- |
| A1  | Shadow DOM           | UnoCSS 불투명도 변수 상속  | `@property inherits:false` | 명시적 변수 선언                  |
| A2  | Shadow DOM           | 다크 모드 텍스트 가시성    | `body` 스타일 미적용       | `.light/.dark`에 `color` 추가     |
| B1  | 상태 동기화          | 크로스도메인 URL 동기화    | Content Script 파괴        | `tabs.onUpdated` 활용             |
| B2  | 상태 동기화          | urlSyncEnabled 상태        | 탭 간 통신 부재            | Background 브로드캐스트           |
| B3  | 상태 동기화          | Tab ID 유효성              | Stale state                | 팝업 초기화 시 필터링             |
| C1  | 스크롤 이벤트        | 최종 위치 누락             | Throttle만 사용            | Throttle+Debounce 하이브리드      |
| C2  | 스크롤 이벤트        | 포커스 없는 탭 수동 스크롤 | 키보드 이벤트 제약         | WheelEvent + mousemove 하이브리드 |
| D1  | 크로스 브라우저*(L)* | WebExtension API 호환성    | 콜백/Promise 패턴 차이     | Promise 래퍼 함수                 |
| D2  | 크로스 브라우저*(L)* | CSS 선택자 특수문자        | 큰따옴표 미이스케이프      | `escapeCSSSelector` 유틸리티      |
| E1  | 빌드/배포*(L)*       | 브라우저별 Manifest        | 수동 설정 반복             | 롤업 자동화 파이프라인            |

---

## A. Shadow DOM 스타일링 문제

### A1. UnoCSS 불투명도 변수 상속 문제

**커밋:** `53ce1ad` | **파일:** `src/contentScripts/panel.tsx`

#### 검색 키워드

`Shadow DOM`, `UnoCSS`, `@property`, `CSS 변수`, `inherits:false`, `--un-text-opacity`, `불투명도`, `CSS 상속`

#### 배경

- Content Script에서 Shadow DOM을 사용하여 웹 페이지 스타일로부터 UI 격리
- UnoCSS + Tailwind로 스타일링 적용
- `text-foreground/80` 같은 불투명도 유틸리티 사용

#### 문제 상황

- Shadow DOM 내부에서 불투명도 유틸리티(`/80`, `/50` 등)가 동작하지 않음
- 텍스트, 배경, 테두리 색상이 예상과 다르게 표시됨

#### 원인 분석

UnoCSS가 `@property`로 불투명도 변수를 정의할 때 `inherits: false` 설정:

```css
/* UnoCSS가 생성하는 규칙 */
@property --un-text-opacity {
  syntax: '<percentage>';
  inherits: false; /* 문제의 원인 */
  initial-value: 100%;
}
```

Shadow DOM은 스타일 격리 경계이므로 light DOM의 `:root` 변수가 shadow tree로 상속되지 않음:

```
Document (Light DOM)
├── :root { --un-text-opacity: 100% }  ← 여기서 정의됨
└── Shadow Host
    └── #shadow-root
        └── 컴포넌트  ← 변수 상속 안됨!
```

#### 해결 과정

Shadow DOM의 base styles에 불투명도 변수를 명시적으로 선언:

```typescript
// panel.tsx - Shadow DOM base styles
const baseStyle = document.createElement('style');
baseStyle.textContent = `
  *, *::before, *::after, ::backdrop {
    box-sizing: border-box;

    /* UnoCSS 불투명도 변수 명시적 선언 */
    --un-text-opacity: 100%;
    --un-bg-opacity: 100%;
    --un-border-opacity: 100%;
    --un-ring-opacity: 100%;
    --un-ring-offset-opacity: 100%;
  }
`;
```

#### 선택 이유

- **UnoCSS 설정 수정 vs 명시적 선언**: UnoCSS의 `@property` 규칙은 브라우저 호환성을 위해 의도적으로 설계된 것이므로 수정하면 다른 문제 발생 가능
- **간결함**: 5줄의 CSS 추가로 문제 해결, 유지보수 부담 최소화
- **명확성**: Shadow DOM 스타일 파일에 모든 관련 설정이 모여 있어 추적 용이

#### 결과

- 모든 UnoCSS 불투명도 유틸리티가 Shadow DOM 내에서 정상 동작
- `text-muted-foreground/80`, `bg-background/95` 등 정상 표시

#### 참고

- UnoCSS `@property` 규칙은 CSS Houdini API 기반
- Shadow DOM 사용 시 CSS 변수 상속 범위를 항상 확인 필요

---

### A2. 다크 모드 텍스트 가시성 문제

**커밋:** (최근) | **파일:** `src/contentScripts/panel.tsx`

#### 검색 키워드

`Shadow DOM`, `dark mode`, `다크 모드`, `텍스트 색상`, `color`, `foreground`, `UnoCSS`, `body color`, `prefers-color-scheme`

#### 배경

- 시스템 테마 감지하여 `.light` / `.dark` 클래스를 theme wrapper에 적용
- UnoCSS preflight가 기본 텍스트 색상 규칙 생성

#### 문제 상황

- 라이트 모드: 텍스트 정상 표시
- 다크 모드: 일부 텍스트가 검정색으로 표시되어 배경과 구분 불가
- Switch 컴포넌트 등 일부 UI 요소 불가시

#### 원인 분석

UnoCSS preflight가 `body` 선택자에 기본 텍스트 색상을 적용:

```css
/* UnoCSS preflight 규칙 */
body {
  color: hsl(var(--foreground));
}
```

Shadow DOM은 `body` 요소가 없으므로 이 규칙이 적용되지 않음:

```
Document
├── <body>  ← body 스타일 적용됨
│   └── Shadow Host
│       └── #shadow-root
│           └── <div class="dark">  ← body 스타일 미적용!
│               └── 컴포넌트
```

#### 해결 과정

`.light`와 `.dark` 클래스에 기본 텍스트 색상을 명시적으로 추가:

```typescript
// panel.tsx - 테마 CSS 변수 정의
const baseStyle = document.createElement('style');
baseStyle.textContent = `
  .light {
    --foreground: 0 0% 3.9%;
    /* ... 기타 HSL 변수 ... */

    /* body { color: ... } 대체 */
    color: hsl(var(--foreground));
  }

  .dark {
    --foreground: 0 0% 98%;
    /* ... 기타 HSL 변수 ... */

    /* body { color: ... } 대체 */
    color: hsl(var(--foreground));
  }
`;
```

#### 선택 이유

- **UnoCSS preflight 커스터마이징 vs 직접 추가**: preflight 설정 변경은 빌드 설정 복잡도를 높이고 다른 페이지에 영향 가능
- **최소 변경**: 기존 테마 CSS 변수 블록에 한 줄씩 추가하는 것이 가장 간단
- **A1 문제와 일관성**: Shadow DOM 스타일 파일에서 모든 오버라이드를 관리하는 패턴 유지

#### 결과

- 라이트 모드: 텍스트 검정색 (`--foreground: 0 0% 3.9%`)
- 다크 모드: 텍스트 흰색 (`--foreground: 0 0% 98%`)
- 모든 자식 요소가 올바른 기본 텍스트 색상 상속

#### 참고

- Shadow DOM 사용 시 `body` 기반 스타일은 항상 대체 필요
- 테마 클래스에 `color` 속성 직접 지정이 가장 확실한 해결책

---

## B. 탭 간 상태 동기화 문제

### B1. URL 동기화 크로스도메인 네비게이션 문제

**커밋:** `707b617` | **파일:** `src/background/main.ts`

#### 검색 키워드

`URL sync`, `cross-domain`, `크로스도메인`, `hard navigation`, `MutationObserver`, `tabs.onUpdated`, `Content Script 파괴`

#### 배경

- URL Sync 기능: 탭 A에서 링크 클릭 시 동기화된 탭 B도 같은 URL로 이동
- Content Script의 MutationObserver로 SPA 네비게이션 감지 구현

#### 문제 상황

- SPA 네비게이션 (같은 도메인 내 pushState): 정상 동작
- 하드 네비게이션 (크로스도메인 이동): URL 동기화 실패
- 예: `example.com` → `another.com` 이동 시 다른 탭 동기화 안됨

#### 원인 분석

하드 네비게이션 시 Content Script가 URL 변경을 감지하기 전에 파괴됨:

```
하드 네비게이션 시퀀스:
1. 사용자가 외부 링크 클릭
2. 브라우저가 새 페이지 로드 시작
3. 기존 Content Script 파괴됨 (MutationObserver 포함)
4. 새 페이지 로드 완료
5. 새 Content Script 로드

→ 3번에서 URL 감지 주체가 사라짐
```

#### 해결 과정

Background Script의 `tabs.onUpdated` API로 URL 변경 감지:

```typescript
// background/main.ts
browser.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // URL 변경 감지 (하드 네비게이션 포함)
  if (changeInfo.url && syncState.isActive && syncState.linkedTabs.includes(tabId)) {
    const urlSyncEnabled = await loadUrlSyncEnabled();

    if (urlSyncEnabled) {
      // 소스 탭 제외, 동기화된 탭들에 URL 브로드캐스트
      const targetTabIds = syncState.linkedTabs.filter((id) => id !== tabId);

      await Promise.all(
        targetTabIds.map((targetTabId) =>
          sendMessage(
            'url:sync',
            { url: changeInfo.url },
            { context: 'content-script', tabId: targetTabId },
          ),
        ),
      );
    }
  }
});
```

```
해결 후 시퀀스:
1. 사용자가 외부 링크 클릭
2. tabs.onUpdated 이벤트 발생 (changeInfo.url 포함)
3. Background Script가 URL 변경 감지
4. 동기화된 다른 탭들에 url:sync 메시지 전송
5. 수신 탭들이 해당 URL로 이동
```

#### 선택 이유

- **beforeunload 이벤트 vs tabs.onUpdated**: beforeunload는 페이지 종료 직전에 발생하지만 비동기 작업 보장이 어렵고, 일부 브라우저에서 제한됨
- **Native Messaging vs tabs.onUpdated**: Native Messaging은 별도 호스트 앱 필요, 설치 복잡도 증가
- **단순성**: `tabs.onUpdated`는 브라우저 API에서 이미 제공하는 기능이므로 추가 의존성 없이 해결 가능
- **신뢰성**: Background Script는 Content Script 생명주기와 무관하게 항상 실행됨

#### 결과

- SPA 및 하드 네비게이션 모두에서 URL 동기화 정상 동작
- Background Script는 Content Script 생명주기와 무관하게 동작

#### 참고

- Content Script는 페이지 생명주기에 종속됨
- 크로스 페이지 기능은 Background Script에서 처리 권장

---

### B2. urlSyncEnabled 상태 탭 간 동기화 문제

**커밋:** `18526be` | **파일:** `src/background/main.ts`, `src/contentScripts/panel.tsx`, `src/shared/types/messages.ts`

#### 검색 키워드

`urlSyncEnabled`, `state sync`, `상태 동기화`, `Switch 토글`, `webext-bridge`, `background script`, `메시지 패싱`

#### 배경

- URL Sync Switch: 각 탭의 Control Panel에서 URL 동기화 on/off 가능
- 설정값은 `browser.storage.local`에 저장

#### 문제 상황

- Tab A에서 URL Sync Switch OFF → Tab B 패널은 여전히 ON 표시
- 사용자가 한 탭에서 설정 변경해도 다른 탭에 반영 안됨

#### 원인 분석

- 설정 변경이 스토리지에만 저장되고 다른 탭에 알림이 없음
- Content Script 간 직접 통신 불가 (동일 출처 정책)

```
문제 상황:
Tab A: Switch OFF → storage.local 저장
Tab B: 여전히 이전 상태 표시 (storage 변경 인지 못함)
```

#### 해결 과정

**1. 메시지 타입 정의:**

```typescript
// messages.ts
export interface UrlSyncEnabledChangedMessage {
  enabled: boolean;
}

// ProtocolMap에 추가
'sync:url-enabled-changed': UrlSyncEnabledChangedMessage;
```

**2. Background Script 브로드캐스트 핸들러:**

```typescript
// background/main.ts
onMessage('sync:url-enabled-changed', async ({ data, sender }) => {
  const { enabled } = data;
  const sourceTabId = sender.tabId;

  // 소스 탭 제외, 모든 동기화된 탭에 브로드캐스트
  const targetTabIds = syncState.linkedTabs.filter((id) => id !== sourceTabId);

  await Promise.all(
    targetTabIds.map((tabId) =>
      sendMessage('sync:url-enabled-changed', { enabled }, { context: 'content-script', tabId }),
    ),
  );
});
```

**3. Content Script 수신 처리:**

```typescript
// panel.tsx
useEffect(() => {
  // 초기 로드
  loadUrlSyncEnabled().then(setUrlSyncEnabled);

  // 다른 탭의 상태 변경 리스닝
  const unsubscribe = onMessage('sync:url-enabled-changed', ({ data }) => {
    setUrlSyncEnabled(data.enabled);
    saveUrlSyncEnabled(data.enabled); // 로컬 스토리지도 업데이트
  });

  return () => unsubscribe();
}, []);

// 토글 시 브로드캐스트
const handleToggle = async () => {
  const newValue = !urlSyncEnabled;
  setUrlSyncEnabled(newValue);
  saveUrlSyncEnabled(newValue);
  await sendMessage('sync:url-enabled-changed', { enabled: newValue }, 'background');
};
```

#### 선택 이유

- **storage.onChanged 이벤트 vs 메시지 브로드캐스트**: storage.onChanged는 모든 탭에 전파되지만 동기화된 탭만 선별적으로 알릴 수 없음
- **일관성**: 프로젝트의 다른 기능들이 이미 메시지 기반 통신을 사용하므로 동일한 패턴 유지
- **확장성**: 향후 다른 설정 동기화가 필요할 때 동일한 패턴 재사용 가능

#### 결과

- 한 탭에서 설정 변경 시 모든 동기화된 탭에서 즉시 반영
- 스토리지와 UI 상태가 항상 일관성 유지

#### 참고

- Content Script 간 통신은 항상 Background Script 경유 필요
- 스토리지 변경과 메시지 브로드캐스트 병행으로 신뢰성 확보

---

### B3. Tab ID 검증 문제

**커밋:** `d0e5be8` | **파일:** `src/popup/components/ScrollSyncPopup.tsx`

#### 검색 키워드

`Tab ID`, `탭 검증`, `긴급 폐기`, `tab discarded`, `유효성 검사`, `UI 불일치`, `stale state`

#### 배경

- Chrome "긴급 폐기" (Tab Discarding): 메모리 절약을 위해 비활성 탭 자동 언로드
- Extension의 동기화 상태에 Tab ID 목록 저장

#### 문제 상황

- 팝업 열기 시 이미 닫힌/폐기된 탭이 선택된 탭 목록에 표시
- UI 불일치: "Stop Sync" 버튼 + "Select 2 or more tabs" 텍스트 동시 표시
- 존재하지 않는 탭에 메시지 전송 시도 시 오류 발생

#### 원인 분석

- 동기화 시작 후 탭이 닫히거나 폐기되어도 상태 자동 정리 안됨
- 팝업이 저장된 상태를 유효성 검증 없이 UI에 표시

```
문제 시나리오:
1. Tab A, B, C로 동기화 시작
2. Tab B 닫힘 (또는 Chrome이 폐기)
3. 팝업 열기 → 여전히 A, B, C 표시
4. B에 메시지 전송 시도 → 실패
```

#### 해결 과정

팝업 초기화 시 실제 존재하는 탭만 필터링:

```typescript
// ScrollSyncPopup.tsx
useEffect(() => {
  const initialize = async () => {
    // 현재 윈도우의 실제 탭 목록 조회
    const browserTabs = await browser.tabs.query({ currentWindow: true });
    const availableTabIds = new Set(
      browserTabs.filter((tab) => tab.id !== undefined).map((tab) => tab.id!),
    );

    if (hasActiveSync) {
      // 저장된 동기화 탭 ID 중 실제 존재하는 것만 필터링
      const validSelectedIds = syncedTabIds.filter((id) => availableTabIds.has(id));

      if (validSelectedIds.length !== syncedTabIds.length) {
        console.warn('Some synced tabs no longer available');
        setSelectedTabIds(validSelectedIds);

        // 유효한 탭이 2개 미만이면 동기화 상태 초기화
        if (validSelectedIds.length < 2) {
          resetSyncStatus();
          sendMessage('scroll:stop', { tabIds: syncedTabIds }, 'background');
        }
      }
    }
  };

  initialize();
}, []);
```

#### 선택 이유

- **tabs.onRemoved 실시간 감지 vs 팝업 열기 시 검증**: 실시간 감지는 Background Script에서 추가 리스너와 상태 관리 필요, 복잡도 증가
- **지연 검증의 장점**: 팝업은 자주 열리지 않으므로 열릴 때만 검증해도 충분
- **구현 단순성**: 팝업 컴포넌트 내에서 자체적으로 처리하므로 다른 파일 수정 불필요

#### 결과

- 팝업 열기 시 항상 유효한 탭만 표시
- 무효한 탭이 감지되면 자동으로 상태 정리
- 동기화 불가능 상태(2개 미만)면 자동 중지

#### 참고

- 확장 프로그램 팝업은 열릴 때마다 새로 초기화됨
- 탭 상태는 언제든 변할 수 있으므로 항상 유효성 검증 필요

---

## C. 스크롤 이벤트 처리 문제

### C1. 최종 스크롤 위치 동기화 문제

**커밋:** `c217b29` | **파일:** `src/shared/lib/performance-utils.ts`, `src/contentScripts/scrollSync.ts`

#### 검색 키워드

`throttle`, `debounce`, `스크롤 동기화`, `마지막 위치`, `final position`, `scroll event`, `성능 최적화`, `이벤트 핸들링`

#### 배경

- 스크롤 이벤트는 초당 수십~수백 회 발생
- 성능을 위해 이벤트 처리 제한(Throttling) 필수
- 요구사항: 100ms 미만의 동기화 지연, 정확한 최종 위치 동기화

#### 문제 상황

- 빠르게 스크롤 후 갑자기 멈출 때 최종 위치가 동기화 안됨
- Tab A 스크롤 멈춤 → Tab B는 중간 위치에서 멈춤
- 최종 스크롤 위치 불일치

#### 원인 분석

순수 Throttling만 사용 시 마지막 이벤트가 throttle window에 걸리면 무시됨:

```
Throttle Only (50ms 간격):
───┬───────┬───────┬───────┬───────────────
   │  ✓    │   ✗   │   ✗   │
   0ms    20ms   40ms   50ms(윈도우 종료)
                              55ms(스크롤 멈춤)

- 0ms: 이벤트 처리됨 (throttle window 시작)
- 20ms, 40ms: 이벤트 무시됨 (throttle 중)
- 55ms: 스크롤 멈춤, 마지막 위치 미캡처!
```

#### 해결 과정

Throttle + Debounce 하이브리드 전략 구현:

```typescript
// performance-utils.ts
function throttleAndDebounce<T extends (...args: any[]) => void>(
  fn: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: NodeJS.Timeout | null = null;
  let called = false;

  return (...args: Parameters<T>) => {
    // 이전 debounce 타이머 취소
    if (timeoutId) clearTimeout(timeoutId);

    if (!called) {
      // 첫 호출: 즉시 실행 (응답성 보장)
      fn(...args);
      called = true;
      setTimeout(() => {
        called = false;
      }, delay);
    } else {
      // 후속 호출: debounce로 마지막 호출 보장 (정확성)
      timeoutId = setTimeout(() => {
        fn(...args);
      }, delay);
    }
  };
}

// scrollSync.ts에서 사용
const handleScroll = throttleAndDebounce(handleScrollCore, 50);
```

```
Throttle + Debounce (50ms 간격):
───┬───────┬───────┬───────┬───────┬───────
   │  ✓    │   ✗   │   ✗   │       │  ✓
   0ms    20ms   40ms   50ms   55ms  105ms
                              (멈춤) (debounce)

- 0ms: 즉시 처리 (응답성)
- 20ms, 40ms: throttle로 무시 (성능)
- 55ms: 스크롤 멈춤, debounce 타이머 설정
- 105ms: debounce 실행 → 최종 위치 캡처!
```

#### 선택 이유

- **lodash throttle trailing 옵션 vs 커스텀 구현**: lodash의 `trailing: true` 옵션은 마지막 호출을 보장하지만 throttle window 내 추가 타이머 생성으로 오버헤드 발생
- **커스텀 구현의 장점**: 프로젝트 요구사항에 맞게 최적화 가능, 외부 의존성 없이 경량화
- **단일 유틸리티 함수**: 재사용 가능한 형태로 분리하여 다른 이벤트 핸들러에도 적용 가능

#### 결과

- **응답성**: 첫 스크롤 이벤트 즉시 처리 (50ms 이내 반응)
- **성능**: 중간 이벤트 제한으로 CPU 부하 감소
- **정확성**: 마지막 위치 항상 동기화 보장

#### 참고

- 순수 Throttle: 성능 좋지만 마지막 이벤트 누락 가능
- 순수 Debounce: 정확하지만 첫 반응 지연
- 하이브리드: 두 장점 결합 (응답성 + 정확성)

---

### C2. 포커스 없는 탭에서 수동 스크롤 오프셋 저장 문제

**커밋:** (관련 작업) | **파일:** `src/contentScripts/scrollSync.ts`

#### 검색 키워드

`unfocused tab`, `포커스 없는 탭`, `manual scroll`, `수동 스크롤`, `WheelEvent`, `altKey`, `metaKey`, `modifier key`, `Arc 브라우저`, `분할 화면`, `keyboard event`

#### 배경

- 수동 스크롤 오프셋 기능: Alt/Meta 키를 누른 상태에서 스크롤하면 해당 탭만의 개별 오프셋 저장
- 기존 구현: `keydown`/`keyup` 이벤트로 modifier 키 상태 추적

#### 문제 상황

- Arc 브라우저 분할 화면에서 발생
- Tab A에 포커스된 상태에서 Alt 키 누름
- Tab B (포커스 없음)에서 마우스로 스크롤
- Tab B는 Alt가 눌렸다는 것을 모름 → 오프셋 저장 안됨

**핵심 제약**: 키보드 이벤트는 포커스된 창에서만 발생

```
시나리오:
1. A 탭 포커스 상태
2. 사용자가 Alt 키 누름 → A 탭에서만 keydown 이벤트
3. B 탭(보이지만 포커스 없음)에서 마우스 휠 스크롤
4. B 탭: Alt 상태 모름 → 일반 스크롤로 처리됨
```

#### 원인 분석

| 방법                  | 신뢰성      | UX       | 지연     | 범위          |
| --------------------- | ----------- | -------- | -------- | ------------- |
| keydown/keyup         | 포커스 탭만 | 좋음     | 없음     | 포커스 탭     |
| 글로벌 키 상태 공유   | 중간        | 좋음     | 5-10ms   | 모든 탭       |
| UI 버튼               | 높음        | 보통     | 없음     | 모든 탭       |
| **WheelEvent.altKey** | **높음**    | **좋음** | **없음** | **마우스 휠** |

`WheelEvent`와 `MouseEvent`는 이벤트 발생 순간의 modifier 키 상태를 `altKey`, `metaKey` 속성으로 제공:

- 포커스 여부와 무관하게 마우스 이벤트는 해당 탭에서 발생
- 이벤트 객체에서 직접 modifier 상태 확인 가능

#### 해결 과정

**하이브리드 접근법 채택: WheelEvent + mousemove**

**1. WheelEvent에서 modifier 키 감지:**

```typescript
// 휠 이벤트 리스너
function handleWheel(event: WheelEvent) {
  if (!isSyncActive) return;

  const isModifierPressed = event.altKey || event.metaKey;

  // modifier 키 + 스크롤 → wheel manual mode 진입
  if (isModifierPressed && !wheelManualModeActive && !isManualScrollEnabled) {
    wheelManualModeActive = true;
    wheelBaselineSnapshot = lastSyncedRatio;
    isManualScrollEnabled = true;

    // mousemove 리스너 등록 (Alt 해제 감지용)
    window.addEventListener('mousemove', handleMouseMove, { passive: true });
  }
}
```

**2. mousemove로 modifier 키 해제 감지:**

문제: `handleWheel`은 휠 이벤트에서만 실행되므로, Alt 해제 후 추가 스크롤 없이 해제하면 감지 불가

```typescript
// Alt 해제 후 마우스 이동 시 즉시 감지
function handleMouseMove(event: MouseEvent) {
  if (!wheelManualModeActive) return;

  // 성능 최적화: 50ms 쓰로틀링
  const now = Date.now();
  if (now - lastMouseMoveCheckTime < 50) return;
  lastMouseMoveCheckTime = now;

  const isModifierPressed = event.altKey || event.metaKey;

  // Alt/Meta 해제 감지 → wheel manual mode 종료
  if (!isModifierPressed) {
    exitWheelManualMode(); // 오프셋 저장 + 리스너 정리
  }
}
```

**3. 종료 시 정리:**

```typescript
async function exitWheelManualMode() {
  // 오프셋 계산 및 저장
  const currentRatio = getScrollRatio();
  const offsetRatio = currentRatio - wheelBaselineSnapshot;
  await saveManualScrollOffset(currentTabId, offsetRatio);

  // 상태 리셋
  wheelManualModeActive = false;
  isManualScrollEnabled = false;

  // mousemove 리스너 제거 (성능)
  window.removeEventListener('mousemove', handleMouseMove);
}
```

#### 선택 이유

**고려한 대안들:**

| 방법                        | 장점                                  | 단점                               | 선택 이유       |
| --------------------------- | ------------------------------------- | ---------------------------------- | --------------- |
| 글로벌 키 상태 (Background) | 모든 입력 방식 지원                   | 메시지 지연(5-10ms), 레이스 컨디션 | 복잡도 높음     |
| UI 버튼 추가                | 가장 신뢰성 높음                      | UX 변경, 추가 UI 필요              | 사용성 저하     |
| **WheelEvent + mousemove**  | **레이스 컨디션 없음, 메시지 불필요** | **마우스 휠만 지원**               | **가장 실용적** |

**WheelEvent 하이브리드 선택 이유:**

- **레이스 컨디션 없음**: 이벤트 발생 순간의 modifier 상태를 직접 확인
- **메시지 패싱 불필요**: 로컬에서 모든 처리 완료
- **기존 키보드 모드 유지**: 포커스된 탭에서는 기존 방식 그대로 사용
- **성능 최적화**: mousemove 리스너는 wheel manual mode일 때만 등록

**성능 최적화:**

- mousemove 리스너: 필요할 때만 등록/해제
- 50ms 쓰로틀링: 과도한 이벤트 처리 방지
- `{ passive: true }`: 스크롤 성능 보장

#### 결과

- Arc 브라우저 분할 화면에서 포커스 없는 탭의 수동 스크롤 정상 동작
- 기존 키보드 기반 수동 스크롤은 그대로 유지
- 두 모드(keyboard, wheel) 간 충돌 없이 독립 동작

#### 참고

- `WheelEvent.altKey`: 휠 이벤트 발생 순간의 Alt 키 상태
- `MouseEvent.altKey`: 마우스 이벤트 발생 순간의 Alt 키 상태
- 키보드 이벤트는 포커스된 창에서만 발생하지만, 마우스 이벤트는 마우스가 위치한 창에서 발생

---

## D. 크로스 브라우저 호환성 문제 _(레거시)_

### D1. WebExtension API 콜백/Promise 호환성 문제

**출처:** 레거시 문서화 | **파일:** `src/background/`, `src/contentScripts/`

#### 검색 키워드

`chrome.tabs.query`, `browser.tabs.query`, `webextension-polyfill`, `Promise 래퍼`, `크로스 브라우저`, `callback vs promise`

#### 배경

Chrome은 `chrome` 네임스페이스와 콜백 기반 API를 사용하고, Firefox는 `browser` 네임스페이스와 Promise 기반 API를 사용한다. 두 브라우저를 동시에 지원하려면 이 차이를 해결해야 한다.

#### 문제 상황

- Chrome에서 정상 동작하는 코드가 Firefox에서 실패
- `chrome.tabs.query`, `chrome.tabs.get` 호출 시 Firefox에서 예상치 못한 동작 발생
- Chrome은 콜백을 기대하고, Firefox는 Promise를 반환하여 호출 패턴 불일치

#### 원인 분석

| 브라우저 | 네임스페이스 | API 패턴     |
| -------- | ------------ | ------------ |
| Chrome   | `chrome`     | 콜백 기반    |
| Firefox  | `browser`    | Promise 기반 |

Firefox에서 `chrome` 객체와 `browser` 객체가 모두 존재하지만, 동작 방식이 다르다:

- `chrome.tabs.query(options, callback)` → 콜백 실행
- `browser.tabs.query(options)` → Promise 반환

#### 해결 과정

Promise를 반환하는 래퍼 함수를 구현하여 API 차이를 추상화했다:

```typescript
// 콜백 기반 함수를 Promise로 래핑
function wrapAsyncFunction(fn: Function) {
  return (...args: any[]) =>
    new Promise((resolve, reject) => {
      fn(...args, (result: any) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result);
        }
      });
    });
}

// browser 객체가 없으면 chrome 객체를 래핑하여 사용
const api = globalThis.browser ?? wrapObject(chrome);
```

#### 선택 이유

- **직접 래퍼 구현**: 프로젝트 요구사항에 맞는 최소한의 코드로 문제 해결
- **폴리필 패턴**: `browser` 객체가 없는 환경에서만 래핑 적용하여 오버헤드 최소화
- **확장성**: 동일한 패턴을 다른 WebExtension API에도 적용 가능

#### 결과

- Chrome, Firefox 모두에서 동일한 코드로 API 호출 가능
- 브라우저별 분기 처리 없이 핵심 로직에 집중 가능
- 향후 Edge, Brave 등 Chromium 기반 브라우저 지원 용이

#### 참고

- [MDN: Browser support for JavaScript APIs](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Browser_support_for_JavaScript_APIs)
- [webextension-polyfill](https://github.com/nicolo-ribaudo/webextension-polyfill)

---

### D2. CSS 선택자 특수문자 이스케이프 문제

**출처:** 레거시 문서화 | **파일:** `src/shared/lib/utils.ts`

#### 검색 키워드

`CSS selector escape`, `querySelector SyntaxError`, `큰따옴표`, `특수문자 이스케이프`

#### 배경

`document.querySelector`는 CSS 선택자 문법을 따르므로, 선택자 문자열에 큰따옴표(`"`)가 포함되면 파싱 오류가 발생한다.

#### 문제 상황

탭 제목에 큰따옴표가 포함된 경우 `querySelector` 호출 시 `SyntaxError` 발생:

```typescript
// 탭 제목: Steal The Show (From "Elemental") - YouTube Music
document.querySelector('[data-title="Steal The Show (From "Elemental")"]');
// SyntaxError: unexpected character
```

#### 원인 분석

CSS 선택자에서 큰따옴표는 속성 값의 시작과 끝을 구분하는 구문 문자다. 값 내부에 이스케이프 없이 큰따옴표를 사용하면 파서가 문자열 경계를 잘못 해석한다.

#### 해결 과정

큰따옴표와 백슬래시를 이스케이프하는 유틸리티 함수 구현:

```typescript
export function escapeCSSSelector(selector: string): string {
  return selector.replace(/(["\\])/g, '\\$1');
}

// 사용 예시
const title = escapeCSSSelector('Steal The Show (From "Elemental")');
document.querySelector(`[data-title="${title}"]`);
```

#### 선택 이유

CSS 명세에서 권장하는 백슬래시 이스케이프 방식을 적용했다. `CSS.escape()` API도 고려했으나, 속성 값 내부의 특수문자만 처리하면 되므로 경량 유틸리티로 구현했다.

#### 결과

큰따옴표가 포함된 탭 제목도 정상적으로 선택 가능하다.

#### 참고

- [MDN - CSS 선택자 이스케이프](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_selectors#escaping_characters): 표준 CSS 문법에 포함되지 않은 문자는 백슬래시로 이스케이프해야 한다.

---

## E. 빌드 및 배포 자동화 _(레거시)_

### E1. 브라우저별 Manifest 설정 자동화

**출처:** 레거시 문서화 | **파일:** `vite.config.*.mts`, `src/manifest.ts`

#### 검색 키워드

`manifest 자동화`, `브라우저별 빌드`, `MV3 CSP`, `크로스 브라우저 확장 프로그램`, `롤업 플러그인`

#### 배경

Chrome, Firefox, Edge는 각각 다른 Manifest 구성을 요구한다. 배포 시마다 빌드 결과물을 브라우저별로 수동 수정하면 시간이 낭비되고 실수가 발생한다.

#### 문제 상황

- 브라우저마다 `manifest.json` 구성이 다르다
- 3개 브라우저 지원 시 수동 작업을 3번 반복해야 한다
- zip/xpi 압축 작업도 매번 수동으로 진행해야 한다

#### 원인 분석

- Firefox는 `browser_specific_settings` 필드가 필요하다
- Chrome MV3는 `service_worker` 방식, Firefox는 `scripts` 배열 방식을 사용한다
- MV3 CSP 정책이 인라인 스크립트를 차단한다
- 브라우저별 배포 패키지 형식이 다르다 (Chrome/Edge: zip, Firefox: xpi)

#### 해결 과정

롤업 빌드 프로세스에 다음 5단계 자동화 파이프라인을 추가한다:

1. **에셋 처리**: 정적 에셋과 백그라운드 스크립트를 복사하고 경량화한다
2. **Manifest 생성**: 브라우저별 manifest를 자동 생성한다
3. **CSP 대응**: 인라인 스크립트를 별도 JS 파일로 추출한다
4. **결과물 분리**: 브라우저별 폴더에 결과물을 저장한다
5. **자동 압축**: zip/xpi 패키지를 자동 생성한다

#### 선택 이유

롤업 플러그인 방식을 선택한 이유:

- 빌드 프로세스에 자연스럽게 통합된다
- 브라우저별 조건 분기를 코드로 관리할 수 있다
- CI/CD 파이프라인에서 일관된 결과물을 보장한다

#### 결과

```text
📦 build
 ┗ 📂 release
   ┣ 📂 chrome
   ┣ 📂 chrome-mv3
   ┣ 📂 edge
   ┣ 📂 firefox
   ┣ 📜 sync-tab-scroll-chrome-mv3-v2.1.0.zip
   ┣ 📜 sync-tab-scroll-chrome-v2.1.0.zip
   ┣ 📜 sync-tab-scroll-edge-v2.1.0.zip
   ┗ 📜 sync-tab-scroll-firefox-v2.1.0.xpi
```

#### 참고

- `src/manifest.ts`: 브라우저별 manifest 설정 정의
- `vite.config.mts`: 메인 빌드 설정
- `vite.config.background.mts`: 백그라운드 스크립트 번들링 설정
- `scripts/prepare.ts`: 빌드 전처리 스크립트

---

## 부록 A: 검색 키워드 인덱스

### 한글 키워드

`다크 모드`, `상태 동기화`, `스크롤 동기화`, `탭 검증`, `크로스도메인`, `불투명도`, `텍스트 색상`, `CSS 변수`, `메시지 패싱`, `이벤트 핸들링`, `포커스 없는 탭`, `수동 스크롤`, `분할 화면`, `크로스 브라우저`, `큰따옴표`, `특수문자 이스케이프`, `브라우저별 빌드`, `manifest 자동화`

### 영어 키워드

`Shadow DOM`, `UnoCSS`, `@property`, `CSS variables`, `inherits`, `opacity`, `MutationObserver`, `tabs.onUpdated`, `hard navigation`, `cross-domain`, `throttle`, `debounce`, `scroll sync`, `final position`, `Tab ID`, `discarded`, `stale state`, `validation`, `webext-bridge`, `background script`, `message passing`, `broadcast`, `WheelEvent`, `MouseEvent`, `altKey`, `metaKey`, `modifier key`, `unfocused tab`, `manual scroll`, `Arc browser`, `split view`, `chrome.tabs.query`, `browser.tabs.query`, `Promise wrapper`, `callback vs promise`, `CSS selector escape`, `querySelector SyntaxError`, `MV3 CSP`, `rollup plugin`

### 기술 스택 키워드

`Chrome Extension`, `Firefox Extension`, `Manifest V3`, `Content Script`, `Background Script`, `Service Worker`, `webextension-polyfill`, `webext-bridge`, `React`, `TypeScript`, `Vite`

---

## 부록 B: 코드 작성 철학 _(레거시)_

공유 코드베이스의 맥락에서 좋은 코드는 단순한 코드다. 마치 초보 개발자에게 기본 개념을 설명할 때처럼 추상화를 최소한으로 사용하는 코드가 그러하다.

### 단순한 코드 vs 추상화된 코드

개발 과정에서 코드의 추상화 수준을 결정하는 것은 중요하다. 추상화는 코드를 더 유연하고 재사용 가능하게 만들 수 있지만, 과도한 추상화는 오히려 코드의 가독성과 유지보수성을 저하시킬 수 있다.

**추상화된 코드 예시:**

```typescript
type BrowserType = 'firefox' | 'edge' | 'chrome';

const browserRules = {
  firefox: ['about:', 'moz', 'view-source:', ...],
  edge: ['chrome', 'data', 'devtools', ...],
  chrome: ['chrome', 'https://chrome.google.com/webstore', ...],
};

const canInjectScript = (url: string | null | undefined, browserType: BrowserType): boolean => {
  if (!url) return false;
  const isRestricted = (rule: string) => url.startsWith(rule) || googleServices.some((s) => url.startsWith(s));
  return !browserRules[browserType].some(isRestricted);
};
```

**단순한 코드 예시:**

```typescript
const canInjectScript = (url: string | null | undefined): boolean => {
  if (!url) return false;
  const isGoogleService = googleServices.some((serviceUrl) => url.startsWith(serviceUrl));

  if (isFirefox) {
    return !(
      url.startsWith('about:') ||
      url.startsWith('moz') ||
      url.startsWith('view-source:') ||
      isGoogleService
    );
  }
  if (isEdge) {
    return !(
      url.startsWith('chrome') ||
      url.startsWith('data') ||
      url.startsWith('devtools') ||
      isGoogleService
    );
  }
  return !(url.startsWith('chrome') || url.startsWith('data') || isGoogleService);
};
```

추상화된 코드는 중복이 없고 재사용성이 높지만, 단순한 코드가 이해하는 데 걸리는 시간이 더 짧다.

### 가독성이 중요한 이유

팀 작업과 오픈소스 프로젝트의 핵심은 많은 사람이 프로젝트에 기여하도록 장려하는 것이다. 간단하고 기본적인 구문을 사용하면 주니어, 시니어 상관없이 **누구나** 코드를 쉽게 이해하고 기여할 수 있다.

### 코드 길이와 버그 발견

보통 코드가 짧을수록 버그를 발견하기 쉽다고 한다. 이는 **오타**에 관해서는 사실이다. 하지만 오타는 쉽게 발견할 수 있다. 정말 퇴근을 늦추는 버그는 코드가 길어서가 아니라 너무 복잡해서 발생하는 경우가 많다.

문제를 디버깅하려면 코드가 무엇을 하고 있는지 머릿속으로 파악할 수 있어야 한다. 복잡한 추상화를 만들면 디버깅하는 데 어려움을 겪을 가능성이 높아진다.

### 추상화의 비용과 이점

추상화는 어디에나 있다. 루프, 함수는 추상화이며 심지어 프로그래밍 언어 자체도 기계 코드에 대한 추상화다. 핵심은 추상화의 비용과 이점을 비교하는 것이다.

**추상화가 적절한 경우:**

- 동일한 코드를 여러 번 복사/붙여넣기하는 것이 유지 관리 부담이 될 때
- 노드 모듈처럼 복잡한 인터페이스를 다루는 공통 작업을 단순화할 때

```typescript
// 적절한 추상화 예시: 파일 시스템 유틸리티
export const writeFile = async (dest: string, data: string) => {
  await mkDirIfMissing(dest);
  await fs.writeFile(dest, data, 'utf8');
};
```

이러한 추상화는 노드 모듈을 잘 모르는 개발자도 쉽게 작업할 수 있도록 도와준다.

### 복잡성 격리

때로 코드는 복잡해야 하는 경우가 있다. 비즈니스 로직이 까다롭거나, 이해할 수 없는 인터페이스의 API를 사용해야 할 때가 있다. 이를 해결하는 가장 좋은 방법은 복잡성을 격리하는 것이다.

- 간단하고 이해하기 쉬운 코드는 밖으로
- 복잡한 부분은 어려운 문제를 처리하는 코어로

이렇게 하면 앱 전체에 복잡성이 흩어져 있지 않게 되므로 대부분의 기여자는 이러한 복잡성을 처리할 필요가 없다.

### 결론

복잡한 코드는 누구나 작성할 수 있다. 진짜 어려운 것은 **복잡한 일을 간단한 코드로 해결**하는 것이다.

#### 참고

- Joshua Comeau의 [Clever Code Considered Harmful](https://www.joshwcomeau.com/career/clever-code-considered-harmful/)

---

## 변경 이력

| 날짜       | 커밋      | 문제 ID | 설명                                            |
| ---------- | --------- | ------- | ----------------------------------------------- |
| 2025-12-03 | `c217b29` | C1      | Throttle+Debounce 하이브리드 전략 도입          |
| 2025-12-03 | `d0e5be8` | B3      | Tab ID 유효성 검증 로직 추가                    |
| 2025-12-03 | -         | C2      | WheelEvent 기반 포커스 없는 탭 수동 스크롤 지원 |
| 2025-12-04 | `53ce1ad` | A1      | UnoCSS 불투명도 변수 명시적 선언                |
| 2025-12-04 | `ac03127` | -       | 동적 테마 지원 구현                             |
| 2025-12-04 | `18526be` | B2      | urlSyncEnabled 탭 간 동기화 메커니즘            |
| 2025-12-04 | `707b617` | B1      | 크로스도메인 URL 동기화 수정                    |
| 2025-12-04 | -         | A2      | 다크 모드 텍스트 가시성 수정                    |
| 2025-12-04 | -         | D1      | Issue.md 병합: WebExtension API 호환성          |
| 2025-12-04 | -         | D2      | Issue.md 병합: CSS 선택자 이스케이프            |
| 2025-12-04 | -         | E1      | Issue.md 병합: Manifest 자동화                  |
| 2025-12-04 | -         | 부록 B  | Issue.md 병합: 코드 작성 철학                   |
