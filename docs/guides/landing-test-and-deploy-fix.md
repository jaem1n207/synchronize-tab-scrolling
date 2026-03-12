# 랜딩 페이지 테스트 및 배포 수정

이 문서는 PR #355 (랜딩 페이지 테스트 추가) 코드 리뷰 피드백 반영과, 배포 과정에서 발견한 prerender 버그 수정을 기록합니다.

---

## 1. PR #355 코드 리뷰 피드백 처리

### 개요

CodeRabbit이 PR #355에 남긴 리뷰 코멘트 총 16개 (인라인 8개 + 닛픽 6개 + 후속 2개)를 분석하고, 유효한 피드백은 코드로 반영, 부적절한 피드백은 근거와 함께 거부했습니다.

### 인라인 코멘트 (8개)

| #   | 파일                            | 이슈                                    | 판정    | 사유                                                                                                                                              |
| --- | ------------------------------- | --------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `page-load.spec.ts:29`          | 모든 JSON-LD 블록 검증                  | ✅ 수정 | 첫 번째만 검증 → 전체 순회                                                                                                                        |
| 2   | `page-load.spec.ts:67`          | data-umami-event로 설치 링크 타겟팅     | ✅ 수정 | 텍스트 의존 → 속성 기반 셀렉터                                                                                                                    |
| 3   | `scroll-sync-demo.spec.ts:24`   | 패널 탐색 셀렉터 통일                   | ✅ 수정 | 뮤테이션/어설션 셀렉터 불일치 → 공유 헬퍼 추출                                                                                                    |
| 4   | `setup.ts:36`                   | IntersectionObserver에서 관찰 대상 추적 | ✅ 수정 | `observe()` 호출 시 `Set<Element>`에 저장                                                                                                         |
| 5   | `header.test.tsx:35`            | window.scrollY에 vi.stubGlobal 사용     | ❌ 거부 | `setup.ts` 84-87행에서 이미 `Object.defineProperty(window, 'scrollY', { writable: true })`로 설정됨. 직접 할당이 정상 동작                        |
| 6   | `language-selector.test.tsx:52` | 키보드 내비게이션 테스트명 수정         | ✅ 수정 | Enter로 열고 click으로 선택 → 테스트명이 동작을 정확히 반영하도록 변경                                                                            |
| 7   | `use-scroll-sync.test.ts:31`    | RAF 스텁 정리 (vi.unstubAllGlobals)     | ✅ 수정 | `vi.clearAllMocks()`는 호출 기록만 초기화, `vi.stubGlobal()` 스텁은 복원하지 않음                                                                 |
| 8   | `detect-browser.test.ts:47`     | Arc를 chrome이 아닌 별도로 분류         | ❌ 거부 | `detectBrowser()`가 의도적으로 Arc/Dia를 `'chrome'`으로 반환 (Chrome Web Store 사용). `toPrimaryBrowserKey('arc')`는 현재 도달 불가능한 방어 코드 |

### 닛픽 코멘트 (6개)

| #   | 파일                           | 이슈                               | 판정    | 사유                                                                              |
| --- | ------------------------------ | ---------------------------------- | ------- | --------------------------------------------------------------------------------- |
| N1  | `vite.config.mts:80-83`        | 셋업을 랜딩 테스트에만 스코프      | 보류    | 현재 vitest 사용하는 테스트가 랜딩만 존재. 확장 프로그램 vitest 추가 시 분리 예정 |
| N2  | `translations.test.ts:15-26`   | i18n 레지스트리에서 로케일 맵 파생 | ❌ 거부 | 명시적 import가 컴파일 타임에 누락 export를 잡아냄                                |
| N3  | `sections.test.tsx:16-40`      | 구조적 동작만 테스트               | ❌ 거부 | 이미 구조적 랜드마크(heading, section ID)만 검증 중                               |
| N4  | `accessibility.test.tsx:31-57` | 전체 페이지 axe 테스트 추가        | ✅ 수정 | `<App />` 렌더링 후 axe-core 검사 추가                                            |
| N5  | `i18n.test.tsx:46-51`          | 브라우저 상태 리셋                 | ✅ 수정 | `afterEach`에서 `navigator.language`, `document.documentElement.lang` 복원        |
| N6  | `integration.test.tsx:18-53`   | e2e 레이어로 이동                  | ❌ 거부 | jsdom 기반 통합 테스트(~400ms)와 Playwright e2e(`i18n.spec.ts`)가 상호 보완       |

### 후속 코멘트 (2개 — 두 번째 리뷰 라운드)

| #   | 파일                   | 이슈                                          | 판정    | 사유                                                           |
| --- | ---------------------- | --------------------------------------------- | ------- | -------------------------------------------------------------- |
| F1  | `page-load.spec.ts:22` | SEO 태그 값 검증 (존재만 확인 → 실제 값 확인) | ✅ 수정 | `toHaveCount(1)` → `toHaveAttribute('content', /패턴/)`        |
| F2  | `page-load.spec.ts:31` | JSON-LD 읽기 전 web-first 어설션 사용         | ✅ 수정 | `textContent()` 루프 → `evaluateAll` + `toHaveCount(2)` 게이트 |

### 최종 SEO 태그 어설션 패턴

```typescript
// Before (존재만 확인)
await expect(page.locator('meta[property="og:title"]')).toHaveCount(1);

// After (값까지 검증)
await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
  'content',
  /Synchronize Tab Scrolling/,
);
```

### 최종 JSON-LD 검증 패턴

```typescript
// Before (textContent → ESLint 위반 + auto-wait 우회)
for (let i = 0; i < count; i++) {
  const text = await jsonLdScripts.nth(i).textContent();
  const parsed = JSON.parse(text!);
}

// After (evaluateAll → ESLint 준수 + web-first 게이트)
await expect(jsonLdScripts).toHaveCount(2);
const jsonLdContents = await jsonLdScripts.evaluateAll((scripts) =>
  scripts.map((el) => el.textContent ?? ''),
);
for (const content of jsonLdContents) {
  const parsed = JSON.parse(content);
}
```

---

## 2. Prerender 배포 버그 발견 및 수정

### 증상

`deploy-landing.yml` CI에서 prerender 단계가 30초 타임아웃으로 실패:

```
[prerender] Fatal error: page.waitForSelector: Timeout 30000ms exceeded.
  - waiting for locator('#app > *') to be visible
```

SEO 브랜치(PR #353)에서 prerender 스크립트를 도입한 이후 **CI에서 한 번도 성공한 적이 없었음**.

### 근본 원인

`scripts/prerender-landing.ts`의 정적 서버가 `LANDING_BASE` 경로 접두사를 처리하지 않았습니다.

```
CI 환경:
  LANDING_BASE=/synchronize-tab-scrolling/

빌드된 HTML의 에셋 경로:
  <script src="/synchronize-tab-scrolling/assets/main-xxx.js">

정적 서버의 파일 매핑:
  /synchronize-tab-scrolling/assets/main-xxx.js
  → dist-landing/synchronize-tab-scrolling/assets/main-xxx.js  ← 존재하지 않음!

실제 파일 위치:
  dist-landing/assets/main-xxx.js
```

로컬에서는 `LANDING_BASE`가 기본값 `/`이므로 에셋 경로가 `/assets/main-xxx.js` → `dist-landing/assets/main-xxx.js`로 정상 매핑되어 문제가 발생하지 않았습니다.

### 수정 내용

**1. 정적 서버에서 LANDING_BASE 접두사 제거** (`scripts/prerender-landing.ts`)

```typescript
const LANDING_BASE = process.env.LANDING_BASE ?? '/';

// createServer 내부
const rawPath = req.url?.split('?')[0] ?? '/';
const stripped = rawPath.startsWith(LANDING_BASE)
  ? '/' + rawPath.slice(LANDING_BASE.length)
  : rawPath;
```

**2. 네비게이션 URL에 LANDING_BASE 반영**

```typescript
// Before
await page.goto(`http://localhost:${port}/`, { waitUntil: 'networkidle' });

// After
await page.goto(`http://localhost:${port}${LANDING_BASE}`, { waitUntil: 'networkidle' });
```

**3. 워크플로우에서 prerender 단계에 LANDING_BASE 환경 변수 전달** (`deploy-landing.yml`)

기존에는 `build` 단계에만 `LANDING_BASE`가 설정되어 있었고, `prerender` 단계에는 전달되지 않았습니다:

```yaml
# Before
- name: Prerender landing page for SEO
  run: pnpm prerender:landing

# After
- name: Prerender landing page for SEO
  run: pnpm prerender:landing
  env:
    LANDING_BASE: /synchronize-tab-scrolling/
```

**4. 워크플로우 paths 트리거에 prerender 스크립트 추가** (`deploy-landing.yml`)

`scripts/prerender-landing.ts` 변경이 배포 워크플로우를 트리거하지 않는 문제:

```yaml
paths:
  - 'src/landing/**'
  - 'src/shared/**'
  - 'scripts/prerender-landing.ts' # 추가
  - 'vite.config.landing.mts'
  - 'uno.config.ts'
  - 'tsconfig.json'
  - '.github/workflows/deploy-landing.yml'
```

### 검증 결과

- 로컬: `LANDING_BASE=/synchronize-tab-scrolling/ pnpm prerender:landing` → 63,234자 캡처 성공
- CI: `Deploy Landing Page` 워크플로우 → build ✅ + deploy ✅
- 브라우저: prerender된 HTML이 raw source에 포함됨 (SEO 크롤러가 JS 없이 콘텐츠 접근 가능)

---

## 3. 커밋 내역

| 커밋      | 설명                                        | 브랜치                       |
| --------- | ------------------------------------------- | ---------------------------- |
| `e2baf14` | PR 리뷰 피드백 반영 (8개 수정)              | `test/landing-comprehensive` |
| `bfb9da0` | SEO 태그 값 검증 + JSON-LD web-first 어설션 | `test/landing-comprehensive` |
| `c58676b` | PR #355 squash merge                        | `main`                       |
| `75aa24f` | prerender 정적 서버 LANDING_BASE 처리       | `main`                       |
| `1ff97d9` | 워크플로우 paths에 prerender 스크립트 추가  | `main`                       |
| `a6f107f` | prerender 단계에 LANDING_BASE env 전달      | `main`                       |

---

## 4. 교훈 및 주의사항

### 환경 변수 스코프

GitHub Actions에서 `env:`는 해당 단계에만 적용됩니다. 여러 단계에서 같은 환경 변수가 필요하면 각 단계마다 명시적으로 전달하거나, `jobs.<job_id>.env`로 작업 수준에서 설정해야 합니다.

### Playwright textContent() vs evaluateAll()

- `textContent()`는 Playwright의 auto-waiting을 우회하며, `playwright/prefer-web-first-assertions` ESLint 규칙에 위배됩니다.
- 데이터 추출이 목적이라면 `evaluateAll()`을 사용하되, 반드시 `toHaveCount()` 등 web-first 어설션으로 요소 존재를 먼저 보장합니다.

### vi.clearAllMocks() vs vi.unstubAllGlobals()

- `vi.clearAllMocks()`: mock의 호출 기록(`.mock.calls`, `.mock.results`)만 초기화. `vi.stubGlobal()`로 교체된 전역 변수는 복원하지 않음.
- `vi.unstubAllGlobals()`: `vi.stubGlobal()`로 교체된 모든 전역 변수를 원래 값으로 복원.
- **규칙**: `vi.stubGlobal()`을 사용하면 반드시 `afterEach(() => vi.unstubAllGlobals())`로 정리합니다.

### detectBrowser()의 Arc/Dia 분류

`detectBrowser()`는 의도적으로 Arc와 Dia를 `'chrome'`으로 분류합니다:

- 두 브라우저 모두 Chromium 기반이며 Chrome Web Store를 사용
- User Agent에 "Chrome"이 포함되어 있음
- `install-buttons.tsx`의 `toPrimaryBrowserKey('arc')` 매핑은 현재 도달 불가능한 방어 코드

향후 Arc/Dia 전용 스토어가 생기면 `detect-browser.ts`에 UA 파싱 로직을 추가하는 것이 올바른 접근입니다.
