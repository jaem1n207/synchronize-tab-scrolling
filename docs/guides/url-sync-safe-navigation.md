# URL Sync 안전한 페이지 이동 가이드

이 문서는 URL Sync의 두 모드가 언제 페이지 이동을 적용하고, 언제 의도적으로 건너뛰어야
하는지 설명합니다. `src/shared/lib/translated-page-url-utils.ts`,
`src/contentScripts/scroll-sync.ts`, URL Sync E2E를 수정하기 전에 먼저 읽으세요.

## 사용자 계약

URL Sync는 스크롤 동기화 중 한 탭의 페이지 이동을 다른 동기화 탭에도 전달하는 옵션입니다.
이 옵션이 켜져 있어도 스크롤 동기화와 페이지 이동 동기화는 별개의 계약입니다. 페이지 이동을
건너뛰어도 스크롤 동기화는 계속 유지되어야 합니다.

모드는 두 가지입니다.

| 모드                     | 의미                                                                                                            |
| ------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `follow-changed-tab`     | 대상 탭이 변경한 탭의 웹사이트로 이동합니다. 대상 URL의 언어 marker와 hash는 가능한 한 보존합니다.              |
| `keep-each-tabs-website` | 대상 탭이 자기 웹사이트에 남은 채 source의 path/query를 적용합니다. 단, site boundary가 호환될 때만 이동합니다. |

`follow-changed-tab`은 실제 source URL을 따라가는 모드라서 서로 다른 host도 허용합니다.
`keep-each-tabs-website`는 target 사이트 위에 source path/query를 합성하는 모드라서,
합성이 안전하지 않으면 fail closed 해야 합니다.

## Site Boundary 호환성

`keep-each-tabs-website`는 HTTP(S) source/target URL을 파싱한 뒤, normalized hostname을
비교합니다. 이 과정은 순수 함수 안에서만 수행하고, raw URL/hostname/path/query/hash를 log,
notice, 외부 서비스, issue/PR comment에 노출하지 않습니다.

호환되는 경우:

- `developer.chrome.com` ↔ `developer.chrome.com`
- `en.example.com` ↔ `ko.example.com`
- `example.com` ↔ `staging.example.com`
- `docs.example.com` ↔ `preview.docs.example.com`

차단되는 경우:

- `developer.chrome.com` ↔ `d2.naver.com`
- `docs.example.com` ↔ `app.example.com`
- `one.github.io` ↔ `two.github.io`
- `en.github.io` ↔ `ko.github.io`
- `dev.pages.dev` ↔ `staging.pages.dev`
- `dev.vercel.app` ↔ `staging.vercel.app`
- `dev.netlify.app` ↔ `staging.netlify.app`

중요한 예외가 있습니다. `github.io`, `pages.dev`, `vercel.app`, `netlify.app`은 hosted
public suffix로 취급합니다. 이 suffix 바로 앞의 label은 locale이나 environment가 아니라
tenant 이름일 수 있으므로 제거하면 안 됩니다. 예를 들어 `en.github.io`와 `ko.github.io`는
번역 subdomain 쌍이 아니라 서로 다른 hosted site일 수 있으므로 차단합니다.

## Content Script 동작

`resolveUrlSyncTarget()`이 `status: 'blocked'`를 반환하면 `url:sync` receiver는 다음 순서를
지켜야 합니다.

1. `urlSyncIncompatibleSiteNotice` 또는 기존 invalid URL notice를 emit합니다.
2. raw URL 없이 `reason`, `sourceTabId`, `mode` 같은 비민감 metadata만 log합니다.
3. `window.location.href`를 바꾸지 않습니다.
4. `clearManualScrollOffset()`을 호출하지 않습니다.
5. `cachedManualOffset`을 그대로 둡니다.
6. scroll sync session은 계속 활성 상태로 둡니다.

호환되는 target URL로 실제 이동할 때만 navigation 전에 manual offset을 clear합니다. 같은 URL로
resolve된 경우에도 이동이 없으므로 offset을 clear하지 않습니다.

## E2E Fixture 규칙

URL Sync E2E는 public website에 의존하지 않습니다. fixture server는 다음 구성을 사용합니다.

- `primary`: `127.0.0.1`
- `comparison`: `127.0.0.1`의 다른 port
- `unrelated`: `localhost`

`localhost`는 환경에 따라 IPv4 또는 IPv6로 resolve될 수 있으므로 unrelated fixture는
`listenHost: '::'`, `publicHost: 'localhost'`로 띄웁니다. 같은 hostname의 다른 port는
compatible site-family로, `127.0.0.1`과 `localhost`는 unrelated site-family로 테스트합니다.

`expectNoNavigation()` 같은 no-navigation helper는 Playwright `TimeoutError`만 기대한
"이동 없음"으로 처리해야 합니다. 다른 예외는 실제 테스트 실패이므로 다시 throw합니다.

## 검증 체크리스트

- [ ] `keep-each-tabs-website`가 같은 host, locale subdomain, environment host에서는 이동한다.
- [ ] `keep-each-tabs-website`가 unrelated host, sibling product host, hosted public suffix tenant에서는 차단한다.
- [ ] 차단된 target은 URL과 manual offset이 유지되고, 이후 `scroll:sync`를 계속 수신한다.
- [ ] `follow-changed-tab`은 unrelated target도 source website로 이동하는 기존 계약을 유지한다.
- [ ] 새 notice key는 `extension/_locales/*`와 `src/shared/i18n/_locales/*`에 모두 있다.
- [ ] URL Sync 변경 후 `pnpm privacy:logging`, resolver unit test, content-script scenario test,
      extension E2E를 실행한다.
