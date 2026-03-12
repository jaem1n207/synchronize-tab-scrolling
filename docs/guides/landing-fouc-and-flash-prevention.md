# 랜딩 페이지 FOUC 및 콘텐츠 플래시 방지

이 문서는 PR #360, #361, #362에서 수정한 랜딩 페이지 시각적 결함(FOUC, 언어 플래시)의 근본 원인과 해결 패턴을 기록합니다. 유사한 문제 재발 방지를 위해 작성되었습니다.

---

## 1. 다크 테마 FOUC (Flash of Unstyled Content)

### 증상

`landing-theme` 값이 `dark`일 때 페이지 로드 시 흰색 배경이 잠깐 보인 뒤 검정 배경으로 전환됨.

### 근본 원인

테마가 React `useEffect`에서만 적용되었음. React 번들 로딩 → 파싱 → 하이드레이션 완료 후에야 `dark` 클래스가 `<html>`에 추가되므로, 그 전까지 기본 라이트 스타일이 노출됨.

### 해결 패턴: `<head>` 블로킹 스크립트

```html
<script>
  (function () {
    var theme;
    try {
      theme = localStorage.getItem('landing-theme');
    } catch (_) {}
    if (
      theme === 'dark' ||
      (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches)
    ) {
      document.documentElement.classList.add('dark');
    }
  })();
</script>
```

**핵심 규칙:**

- 반드시 `<head>` 안에 위치 (CSS보다 먼저 실행되어야 함)
- `defer`/`async` 없는 동기 스크립트여야 함
- `localStorage` 접근은 반드시 `try/catch`로 감싸야 함 (아래 Pitfall 참조)

---

## 2. 시스템 테마 변경 미반영

### 증상

사용자가 OS 테마를 라이트→다크로 변경한 뒤 랜딩 페이지를 재방문해도 라이트 테마가 유지됨.

### 근본 원인

`applyTheme()` 함수가 매 렌더마다 `localStorage.setItem('landing-theme', theme)`을 호출하여, 첫 방문 시 시스템 테마를 localStorage에 기록함. 이후 `resolveInitialTheme()`은 항상 localStorage 값을 사용하므로 시스템 테마 변경이 무시됨.

### 해결 패턴: 명시적 선택과 자동 적용 분리

```typescript
// ❌ BAD: 매 렌더마다 localStorage에 저장
function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  localStorage.setItem('landing-theme', theme); // 시스템 테마도 저장됨!
}

// ✅ GOOD: DOM 적용과 영구 저장을 분리
function applyThemeToDOM(theme: Theme) {
  document.documentElement.classList.toggle('dark', theme === 'dark');
}

// 사용자가 토글 버튼 클릭 시에만 호출
function persistThemeChoice(theme: Theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
```

**핵심 규칙:**

- `localStorage`에 테마를 저장하는 것은 **사용자가 명시적으로 토글 클릭했을 때만**
- `isExplicit` 상태로 "사용자 선택" vs "시스템 추종"을 구분
- `isExplicit === false`일 때 `useEffect`에서 `systemTheme` 변경을 감지하여 자동 반영
- `getStoredTheme()`이 `null`을 반환하면 시스템 테마를 따르도록 설계

---

## 3. 비영어 사용자 콘텐츠 플래시

### 증상

한국어 등 비영어 사용자가 랜딩 페이지 접속 시, 영어 텍스트가 잠깐 보인 뒤 해당 언어로 전환됨. 텍스트 길이 차이로 레이아웃 시프트도 발생.

### 근본 원인

`scripts/prerender-landing.ts`가 Playwright Chromium으로 영어 콘텐츠를 프리렌더링. `<html lang="en">`이 고정. 클라이언트에서 React 하이드레이션 시 로케일을 감지하고 재렌더링하므로, 그 사이 영어 콘텐츠가 노출됨.

### 해결 패턴: 블로킹 로케일 감지 + visibility 숨김

**Step 1: `<head>` 블로킹 스크립트로 로케일 감지**

```html
<script>
  (function () {
    var SUPPORTED = ['en', 'ko', 'de', 'ru', 'it', 'vi', 'id', 'pl', 'tr', 'zh_TW'];
    var stored;
    try {
      stored = localStorage.getItem('landing-locale');
    } catch (_) {}
    var locale = 'en';

    if (stored && SUPPORTED.indexOf(stored) !== -1) {
      locale = stored;
    } else {
      // navigator.language 기반 감지 (fallback)
    }

    document.documentElement.lang = locale === 'zh_TW' ? 'zh-TW' : locale;

    if (locale !== 'en') {
      document.documentElement.classList.add('i18n-loading');
      // Fail-open: 하이드레이션 실패 시 3초 후 자동 표시
      setTimeout(function () {
        document.documentElement.classList.remove('i18n-loading');
      }, 3000);
    }
  })();
</script>
```

**Step 2: CSS로 프리렌더 영어 콘텐츠 숨김**

```css
html.i18n-loading #app {
  visibility: hidden;
}
```

- `display: none` 대신 `visibility: hidden` 사용 → 레이아웃 리플로우 방지
- 영어 사용자는 `i18n-loading` 클래스가 추가되지 않으므로 즉시 프리렌더 콘텐츠 표시

**Step 3: 하이드레이션 완료 후 표시**

```typescript
// main.tsx
hydrateRoot(appContainer, app, {
  onRecoverableError: (error, errorInfo) => {
    console.warn('[landing] Recoverable hydration error:', error, {
      componentStack: errorInfo?.componentStack,
    });
  },
});

requestAnimationFrame(() => {
  document.documentElement.classList.remove('i18n-loading');
});
```

**핵심 규칙:**

- 하이드레이션 에러를 무시하지 말 것 (`() => undefined` ❌) — `console.warn`으로 로깅
- `requestAnimationFrame` 으로 첫 페인트 후 클래스 제거
- **반드시 fail-open 타임아웃 포함** — JS 로딩 실패 시 영구 빈 화면 방지

---

## 4. Pitfall: `localStorage` SecurityError

### 규칙

> 블로킹 `<script>`에서 `localStorage` 접근 시 반드시 `try/catch`로 감싸야 한다.

### 배경

프라이빗 브라우징, 스토리지 차단 정책, 서드파티 iframe 등의 환경에서 `localStorage.getItem()`이 `SecurityError`를 throw할 수 있음. 블로킹 스크립트에서 예외가 발생하면 스크립트 전체가 중단되어:

- 테마 초기화 실패 → FOUC 발생
- 로케일 초기화 실패 → 영어 플래시 발생 + fail-open 타임아웃 미등록

```javascript
// ❌ BAD: localStorage 직접 접근
var theme = localStorage.getItem('landing-theme');

// ✅ GOOD: try/catch로 감싸기
var theme;
try {
  theme = localStorage.getItem('landing-theme');
} catch (_) {}
// theme이 undefined면 기존 fallback 로직이 동작
```

### 핵심

- `typeof localStorage`로 존재 여부만 확인하는 것은 **불충분** — 객체는 존재하지만 접근이 차단될 수 있음
- 인라인 스크립트에서는 `var` 사용 (`const`/`let` 대비 호환성)
- `try/catch` 실패 시 변수가 `undefined`로 남아 기존 fallback (시스템 테마, `navigator.language`) 로직이 자연스럽게 동작하도록 설계

---

## 5. Pitfall: 프리렌더링 환경과 하이드레이션 불일치

### 규칙

> 프리렌더링된 HTML에 포함되는 동적 값은 하이드레이션 불일치를 유발할 수 있다. 클릭 시 읽히는 analytics 속성 등은 허용 가능하지만, 시각적 영향이 있는 값은 `useEffect` 패턴으로 지연 적용해야 한다.

### 배경

`scripts/prerender-landing.ts`는 **Playwright Chromium**에서 렌더링하므로:

- `detectBrowser()` → `'chrome'` 반환 (Chromium이므로)
- `navigator.language` → 영어 반환
- `useEffect`도 실행됨 (실제 브라우저 환경이므로)

따라서 프리렌더된 HTML에는 Chrome 기준 값이 하드코딩됨. Firefox 사용자가 하이드레이션하면:

- `data-umami-event-user-browser="chrome"` → `"firefox"`로 변경 (하이드레이션 불일치)
- 주 설치 버튼이 Chrome → Firefox로 변경 (시각적 변화)

**현재 상태**: analytics 속성(`data-umami-event-*`)의 불일치는 기능적 영향 없음 (Umami가 클릭 시점에 읽음). 주 설치 버튼 변경은 기존부터 존재하던 동작.

### 향후 개선이 필요한 경우

`useState(undefined)` + `useEffect` 패턴으로 지연 감지하되, 프리렌더가 최종 상태(effects 포함)를 캡처하므로 완전한 해결은 프리렌더 스크립트 수정이 필요함.

---

## 6. Pitfall: 병렬 브랜치 작업 시 워킹 디렉토리 오염

### 규칙

> 동일 로컬 리포지토리에서 여러 브랜치를 병렬로 작업할 때, 브랜치 간 변경사항이 섞이지 않도록 반드시 브랜치 격리를 검증해야 한다.

### 배경

PR #360, #361, #362를 병렬 에이전트로 동시 작업했을 때:

- `fix/landing-theme` 브랜치가 `main` 대신 `fix/landing-analytics` 위에 생성됨
- 원인: 에이전트 2가 `git checkout -b`를 실행할 때, 에이전트 1의 커밋이 이미 워킹 디렉토리에 있었음
- PR #362에 analytics 커밋이 포함되어 cherry-pick + force push로 수정

### 검증 체크리스트

```bash
# 각 브랜치가 main에서만 분기했는지 확인
git log --oneline main..<branch-name>
# → 해당 브랜치의 커밋만 표시되어야 함

# 원격 브랜치도 동일하게 확인
git log --oneline main..origin/<branch-name>
```

### 예방책

- 병렬 에이전트 작업 시 각 에이전트가 `git checkout main && git checkout -b <branch>` 실행 전 `git stash`로 워킹 디렉토리 정리
- 브랜치 생성 직후 `git log --oneline main..HEAD`로 커밋 0개인지 확인
- PR 생성 전 `git diff --stat main..HEAD`로 의도하지 않은 파일 변경 없는지 확인

---

## 체크리스트: 랜딩 페이지 `<head>` 블로킹 스크립트 추가 시

- [ ] `<head>` 안, CSS/번들 로딩 전에 위치하는가?
- [ ] `defer`/`async` 없는 동기 스크립트인가?
- [ ] `localStorage` 접근이 `try/catch`로 감싸져 있는가?
- [ ] 스크립트 실패 시에도 페이지가 표시되는 fail-open 경로가 있는가?
- [ ] 인라인 스크립트에서 `var` (호환성) 사용하고, `indexOf` 등 ES5 호환 메서드를 사용하는가?
- [ ] 프리렌더링 시에도 동일하게 동작하는가? (Playwright Chromium 환경 고려)
