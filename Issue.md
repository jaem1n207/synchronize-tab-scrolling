# 1번째 이슈: WebExtension API의 크로스 브라우저 호환성 문제 해결하기

## 배경

Chrome뿐만 아니라 다양한 브라우저를 지원하기 위한 작업을 시작했습니다. Chrome과 Firefox는 각각 `chrome`과 `browser` 네임스페이스를 사용하여 API를 제공합니다.

이 두 브라우저 간의 주요 차이점 중 하나는 Chrome이 **콜백 기반**의 API를 제공하는 반면, Firefox는 **Promise 기반**의 API를 제공한다는 것입니다. 이로 인해 동일한 기능을 가진 확장 프로그램을 두 브라우저 모두에서 작동하게 만들기 위해서는 추가적인 작업이 필요했습니다.

## 문제 상황

Chrome에서 잘 작동했지만 Firefox에서는 `chrome.tabs.query`와 `chrome.tabs.get`과 같은 API 호출이 문제를 일으키고 있었습니다. Chrome은 이러한 함수에 대해 콜백을 기대하지만, Firefox는 Promise를 반환합니다. 이로 인해 코드베이스에 크로스 브라우저 호환성 문제가 발생했습니다.

## 해결 과정

이 문제를 해결하기 위해, 각 브라우저에서 `chrome` 또는 `browser` 객체가 어떻게 존재하는지 파악했습니다. Chrome에서는 `browser` 객체가 존재하지 않았습니다. 반면에 Firefox에서는 `chrome`, `browser` 객체 모두 존재했습니다.

Firefox에서 `chrome.tabs.query` 함수를 호출하면 콜백을 통해 결과를 받을 수 있었고 `browser.tabs.query` 함수를 호출하면 Promise를 반환했습니다. Chrome에선 사용하는 Chrome 버전이 MV3를 지원할 경우에 콜백, Promise 어느 방식으로 하던 결과를 받을 수 있었죠. 기존 코드는 `chrome.tabs.query` API를 사용하며 Promise를 반환할 거라 예측하고 사용 중이었기에 Firefox에서는 탭 정보를 가져올 수 없었던 것입니다.

개인적으로 `Promise`를 사용하면 코드를 더 선언적으로 작성할 수 있으며, 코드의 가독성과 유지보수성이 높아지는 경험을 했기에 콜백보다 Promise를 더 선호합니다. 하지만 무작정 `Promise`를 반환하는 API를 사용한다면 구형 브라우저나 Manifest V3를 지원하지 않는 브라우저에서는 해당 기능을 사용할 수 없을 것입니다. 다양한 브라우저를 지원하는 목적이 더 많은 사용자가 이용하길 바래서인데 이 작업을 위해 구형 브라우저 사용자가 사용하지 못하게 되는 것은 제 목적과 맞지 않습니다. 그래서 다양한 브라우저에서 사용 가능하고 구형 브라우저 사용자도 챙기면서 코드의 가독성도 모두 챙기기 위한 작업을 진행했습니다.

> `async & await` 구문을 사용하면 개발자가 코드를 더 읽기 쉽게 만들 수 있을 뿐만 아니라 JS 엔진에서 비동기 코드에 대한 스택 추적과 관련된 최적화를 수행할 수 있습니다.
> [why await beats Promise#then()](https://mathiasbynens.be/notes/async-stack-traces)

브라우저 API 호출을 추상화하는 래퍼 함수를 만들어 해결할 수 있었습니다.

```typescript
// declaration type
interface Window {
  webextension: typeof webExtension;
}

declare namespace webExtension {
  namespace tabs {
    type Tab = chrome.tabs.Tab | browser.tabs.Tab;
    type QueryInfo = chrome.tabs.Tab | browser.tabs._QueryQueryInfo;
    function query(queryInfo: QueryInfo): Promise<Tab[]>;
    function get(tabId: number): Promise<Tab>;
  }

  namespace runtime {
    function sendMessage(message: any, options?: browser.runtime._SendMessageOptions): Promise<any>;
  }
}

// polyfill

// Promise를 반환하도록 합니다.
const wrapAsyncFunction = (method: FunctionShape) => {
  return (target: typeof chrome | typeof browser, ...args: any[]) => {
    return new Promise((resolve, reject) => {
      method.call(target, ...args, (result: any) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  };
};

// 대상 객체의 기존 함수를 래핑하여 지정된 래퍼 함수에 의해 호출을 가로채도록 합니다. 래퍼 함수는 첫 번째 인자로 원래의 `target` 객체를 받은 다음, 원래 메서드에 전달된 각 인자를 받습니다.
const wrapMethod = (
  target: typeof chrome,
  method: any,
  wrapper: FunctionShape
) => {
  return new Proxy(method, {
    apply(_, thisArg, args) {
      return wrapper.call(thisArg, target, ...args);
    }
  });
};

// 함수를 가로채서 Proxy로 객체를 래핑합니다.
const wrapObject = (target: typeof chrome) => {
  ...
  return new Proxy(proxyTarget, handlers)
};

const createWebExtensionPolyfillObj = (): typeof webExtension => {
  if (!globalThis.chrome?.runtime?.id) {
    throw new Error('This script should only be loaded in a browser extension.');
  }

  if (!globalThis.browser?.runtime?.id) {
    return wrapObject(chrome) as typeof webExtension;
  } else {
    return globalThis.browser as typeof webExtension;
  }
};

// using
const browser = createWebExtensionPolyfillObj();
return browser.tabs.query(queryInfo);
```

`browser` 객체가 존재하지 않는 브라우저(Chrome)에선 `chrome` 객체를 사용한다고 볼 수 있습니다. 이 함수는 콜백을 통해 결과를 제공하거나 `Promise`로 반환하는 `chrome.tabs.query` 함수를 Promise로 래핑합니다. 이 래퍼 함수를 이용하면 Firefox, Chrome에서 동일한 방식으로 사용할 수 있게 되며, 콜백을 통해 결과를 제공하는 구형 브라우저도 지원할 수 있게 됩니다. 여기에 더해 개발할 때 선언적인 코드를 작성할 수 있게 되는 이점도 챙기게 되었습니다.

## 결론

이러한 접근 방식을 통해, 확장 프로그램의 크로스 브라우저 호환성 문제를 성공적으로 해결할 수 있었습니다. 브라우저 간의 차이점을 걱정하지 않고, 확장 프로그램의 핵심 기능에 집중할 수 있습니다. 이 과정을 통해 브라우저 API의 차이점을 추상화하는 함수를 구현했고, 이는 향후 다른 API에도 적용될 수 있습니다.

### 참고

[JavaScript API에 대한 브라우저 지원](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Browser_support_for_JavaScript_APIs)
[webextension-polyfill](https://github.com/mozilla/webextension-polyfill/blob/master/src/browser-polyfill.js)
[Background scripts 디버깅](https://extensionworkshop.com/documentation/develop/debugging/#debugging-background-scripts)

# 2번째 이슈: CSS 선택자 내 큰따옴표 이슈

## 영상

### 버그 재현

<video controls width="250">
  <source src="https://github.com/jaem1n207/lazy-dev/assets/50766847/fd4e42c0-5fe5-401e-a1eb-c0475cd1add7" />
</video>

### 버그 해결

<video controls width="250">
  <source src="https://github.com/jaem1n207/lazy-dev/assets/50766847/157f2386-d0fc-4128-bec8-c4837b218615" />
</video>

## 배경

`document.querySelector` 함수를 사용할 때, CSS 선택자가 큰따옴표(`"`)를 포함하는 문자열을 처리하려고 하면 `SyntaxError`가 발생합니다. 이는 CSS 선택자의 문법 규칙에 따라 큰따옴표가 문자열의 시작과 끝을 나타내기 때문입니다.

## 문제 상황

예를 들어, "Steal The Show (From "Elemental") - YouTube Music"처럼 큰따옴표(`"`)가 포함된 제목인 탭을 활성화한 상태라고 가정해보겠습니다. 이때 이 제목을 가진 요소에 `querySelector`를 사용하려고 할 때 문제가 발생합니다:

```javascript
document.querySelector(
  '[data-cmdk-item][data-value="Steal The Show (From "Elemental") - YouTube Music"]',
);
```

위 코드는 `Uncaught SyntaxError`를 발생시키는데, 이는 선택자 내부의 큰따옴표가 문자열의 끝을 의미하기 때문입니다.

## 해결 방법

문제를 해결하기 위해, 선택자 내부의 큰따옴표를 이스케이프 처리해야 합니다. 이스케이프 처리는 선택자를 문자열로 안전하게 만들어 `querySelector`가 올바르게 해석할 수 있도록 합니다.

### 이스케이프 처리 함수

다음은 선택자를 이스케이프 처리하는 함수의 예시입니다:

```typescript
export function escapeCSSSelector(selector: string): string {
  return selector.replace(/(["\\])/g, '\\$1');
}
```

### 사용 예시

이스케이프 처리된 선택자를 `querySelector`에 사용하는 예시는 다음과 같습니다:

```typescript
const value = 'Steal The Show (From "Elemental") - YouTube Music1';
const escapedValue = escapeCSSSelector(value);
const selector = [data-value="${escapedValue}"];
const element = document.querySelector(selector);
```

이제, 큰따옴표를 포함한 문자열 대상으로도 안전하게 사용할 수 있게 되었습니다.

### 참고

https://developer.mozilla.org/en-US/docs/Web/API/Document/querySelector#parameters

> Note: Characters that are not part of standard CSS syntax must be escaped using a backslash character. Since JavaScript also uses backslash escaping, be especially careful when writing string literals using these characters. See Escaping special characters for more information.

# 3번째 이슈: 브라우저마다 다른 Manifest 설정

## 배경

브라우저마다 Manifest 구성을 다르게 설정해야 합니다. 매번 배포할 때마다 <strong>빌드한 결과물을 각 브라우저에 맞게 직접 수정하는 번거로움을 덜기 위해</strong> 롤업 빌드 프로세스 중 몇 가지 작업을 추가해 이를 자동화합니다.

## 문제 상황

확장 프로그램을 배포할 때 브라우저마다 요구하는 `Manifest.json` 구성이 다릅니다. 일일이 <strong>빌드한 결과물을 브라우저에 맞게끔 매번 직접 변경</strong>해야 합니다. 여기에 더해 결과물을 변경하고 나서 배포하려면 zip 또는 xpi 로 압축해야 합니다.

Chrome, Firefox, Edge 브라우저를 지원한다면 이 과정을 3번 해야 한다는 것이죠.
빌드할 때마다 이러한 과정을 거친다 생각하면 벌써부터 끔찍합니다. 좋지 않은 개발자 경험은 결국 사용자에게도 부정적인 영향을 미칩니다. 여가 시간을 활용해 개발한 프로젝트가 버그 하나 수정하기 쉽지 않은 개발 환경이라면 사용자의 피드백을 꾸준히 반영할만큼 부지런한 개발자는 없을 것입니다.

## 해결 방법

이 문제를 해결하기 위해, 롤업의 번들 과정에 개입해 다음 몇 가지 추가 작업을 해야 합니다:

1. 국제화를 위한 메시지 파일과 로고 아이콘 등의 `정적 에셋`들, 백그라운드와 같은 메니페스트 키에 추가한 스크립트를 경량화하고 복사한 뒤 빌드 결과물에 포함되도록 해야합니다. 이때, 메니페스트에서 지정한 경로와 일치하도록 폴더 구조를 미리 지정해두고 그대로 <strong>복사</strong>해야 합니다.
2. 지원하는 <strong>브라우저별 메니페스트를 생성</strong>합니다. `name`, `version`과 같은 공통 속성을 미리 정의해 둔 manifest를 기반으로 합니다.
3. `@sveltejs/adapter-static` 어댑터에 의해 생성된 파일의 `html` 파일의 <strong>`inline-script`를 `[name].{hash}.[js]` 파일로 추출</strong>합니다. Manifest V3에서는 콘텐츠 보안 정책에 따라 inline-script가 허용되지 않습니다.
4. 이렇게 생성된 결과물을 <strong>브라우저 폴더별로</strong> 저장합니다.
5. 수정 사항을 제출하기 위해 브라우저별로 <strong>압축</strong>합니다. 개발 환경이라면 생략합니다.

### 빌드 결과물

Chrome, Edge, Firefox 를 지원한다면 아래와 같은 폴더 구조를 가집니다. 개발 환경이라면 `release`가 아닌 `debug` 폴더에 저장되고 압축 파일을 생성하지 않으며, 구분이 용이하도록 manifest의 `name` 속성 값도 다릅니다.

```
📦build
 ┗ 📂release
 ┃ ┣ 📂chrome
 ┃ ┃ ┣ 📂_locales
 ┃ ┃ ┣ 📂app
 ┃ ┃ ┣ 📂icons
 ┃ ┃ ┣ 📜추출된_스크립트.js
 ┃ ┃ ┣ 📜background-script.js
 ┃ ┃ ┣ 📜index.html
 ┃ ┃ ┣ 📜manifest.json
 ┃ ┣ 📂chrome-mv3
 ┃ ┃ ┣ 📂_locales
 ┃ ┃ ┣ 📂app
 ┃ ┃ ┣ 📂icons
 ┃ ┃ ┣ 📜추출된_스크립트.js
 ┃ ┃ ┣ 📜background-script.js
 ┃ ┃ ┣ 📜index.html
 ┃ ┃ ┣ 📜manifest.json
 ┃ ┣ 📂edge
 ┃ ┃ ┣ 📂_locales
 ┃ ┃ ┣ 📂app
 ┃ ┃ ┣ 📂icons
 ┃ ┃ ┣ 📜추출된_스크립트.js
 ┃ ┃ ┣ 📜background-script.js
 ┃ ┃ ┣ 📜index.html
 ┃ ┃ ┣ 📜manifest.json
 ┃ ┣ 📂firefox
 ┃ ┃ ┣ 📂_locales
 ┃ ┃ ┣ 📂app
 ┃ ┃ ┣ 📂icons
 ┃ ┃ ┣ 📜추출된_스크립트.js
 ┃ ┃ ┣ 📜background-script.js
 ┃ ┃ ┣ 📜index.html
 ┃ ┃ ┣ 📜manifest.json
 ┃ ┣ 📜sync-tab-scroll-chrome-mv3-v2.1.0.zip
 ┃ ┣ 📜sync-tab-scroll-chrome-v2.1.0.zip
 ┃ ┣ 📜sync-tab-scroll-edge-v2.1.0.zip
 ┃ ┗ 📜sync-tab-scroll-firefox-v2.1.0.xpi
```

# 4번째 이슈: 복잡하고 "똑똑한" 코드보다는 단순하고 이해하기 쉬운 코드 작성

공유 코드베이스의 맥락에서 좋은 코드는 단순한 코드입니다. 마치 초보 개발자에게 기본 개념을 설명할 때처럼 추상화를 최소한으로 사용하는 코드처럼요.

개발 과정에서 코드의 추상화 수준을 결정하는 것은 중요합니다. 추상화는 코드를 더 유연하고 재사용 가능하게 만들 수 있지만, 과도한 추상화는 오히려 코드의 가독성과 유지보수성을 저하시킬 수 있기 때문입니다.

이를 잘 보여주는 예시로 `canInjectScript` 함수를 살펴보겠습니다:

```typescript
type BrowserType = 'firefox' | 'edge' | 'chrome';

const browserRules = {
  firefox: [
    'about:',
    'moz',
    'view-source:',
    'resource:',
    'chrome:',
    'jar:',
    'https://addons.mozilla.org/',
  ],
  edge: [
    'chrome',
    'data',
    'devtools',
    'edge',
    'https://chrome.google.com/webstore',
    'https://microsoftedge.microsoft.com/addons',
    'view-source',
  ],
  chrome: ['chrome', 'https://chrome.google.com/webstore', 'data', 'devtools', 'view-source'],
};

const googleServices = [
  'https://accounts.google.com',
  'https://analytics.google.com/analytics',
  'https://search.google.com/search-console',
  'https://chromewebstore.google.com',
];

const canInjectScript = (url: string | null | undefined, browserType: BrowserType): boolean => {
  if (!url) return false;

  const isRestricted = (rule: string) =>
    url.startsWith(rule) || googleServices.some((serviceUrl) => url.startsWith(serviceUrl));
  return !browserRules[browserType].some(isRestricted);
};
```

이 코드를 단순하게 변경해보겠습니다:

```typescript
const googleServices = [
  'https://accounts.google.com',
  'https://analytics.google.com/analytics',
  'https://search.google.com/search-console',
  'https://chromewebstore.google.com',
];

const canInjectScript = (url: string | null | undefined): boolean => {
  if (!url) return false;

  const isGoogleService = googleServices.some((serviceUrl) => url.startsWith(serviceUrl));

  if (isFirefox) {
    return !(
      url.startsWith('about:') ||
      url.startsWith('moz') ||
      url.startsWith('view-source:') ||
      url.startsWith('resource:') ||
      url.startsWith('chrome:') ||
      url.startsWith('jar:') ||
      url.startsWith('https://addons.mozilla.org/') ||
      isGoogleService
    );
  }
  if (isEdge) {
    return !(
      url.startsWith('chrome') ||
      url.startsWith('data') ||
      url.startsWith('devtools') ||
      url.startsWith('edge') ||
      url.startsWith('https://chrome.google.com/webstore') ||
      url.startsWith('https://microsoftedge.microsoft.com/addons') ||
      url.startsWith('view-source') ||
      isGoogleService
    );
  }
  return !(
    url.startsWith('chrome') ||
    url.startsWith('https://chrome.google.com/webstore') ||
    url.startsWith('data') ||
    url.startsWith('devtools') ||
    url.startsWith('view-source') ||
    isGoogleService
  );
};
```

변경하기 전 코드는 많은 장점이 있습니다:

1. 코드 중복 없음(수정된 코드는 본질적으로 동일한 작업을 수행하는 if문을 여러 개 사용)
2. 재사용성 및 유연성 향상: 브라우저 타입에 따라 URL을 검사하는 규칙을 `browserRules` 객체에 매핑하고, `isRestricted` 함수를 통해 URL이 주어진 규칙에 부합하는지 검사합니다.

하지만 대충 봐도 이해하는 데 걸리는 시간이 짧은 건 수정 후 if문이 중첩된 코드입니다.

## 가독성은 왜 중요한가

팀 작업과 오픈소스 프로젝트의 핵심은 많은 사람이 프로젝트에 기여하도록 장려하는 것입니다. 그 방법 중 하나가 코드를 매우 기본적인 수준으로 유지하는 것인데, 간단하고 기본적인 구문을 사용하면 주니어, 시니어 상관없이 **누구나** 코드를 쉽게 이해하고 기여할 수 있기 때문입니다.

## 코드 길이가 짧다고 버그를 발견하기 쉬운가?

보통 코드가 짧을수록 버그를 발견하기 쉽다고 합니다.

이는 **오타**에 관해서는 사실입니다. 하지만 오타는 쉽게 발견할 수 있습니다. 정말 퇴근을 늦추는 버그는 코드가 길어서가 아니라 너무 복잡해서 발생하는 경우가 많습니다.

문제를 디버깅하려면 코드가 무엇을 하고 있는지 머릿속으로 파악할 수 있어야 합니다. 복잡한 추상화를 만들면 디버깅하는 데 어려움을 겪을 가능성이 높아집니다.

## 추상화에서의 비용

그렇다면 아예 추상화를 하면 안 되나요?

추상화는 어디에나 있습니다. 루프, 함수는 추상화이며 심지어 프로그래밍 언어 자체도 기계 코드에 대한 추상화입니다. 모든 것이 추상화입니다.

핵심은 추상화의 비용과 이점을 비교하는 것입니다. 개발 환경에서 Vite와 Webpack의 성능을 비교하기 위해 5000개의 JSX를 렌더링해야 한다고 가정해 보겠습니다. 동일한 JSX를 5000번 복사/붙여넣을 수도 있고, 배열 위에 매핑하고 JSX를 한 번만 작성할 수도 있습니다. 이 경우 복붙하는 건 유지 관리가 매우 부담스럽기 때문에 그만한 가치가 있습니다.

## 피할 수 없는 복잡성이 쉬운 곳을 오염시키지 않도록 관리

때로 코드는 복잡해야 하는 경우가 있습니다. 비즈니스 로직이 정말 까다롭거나, 이해할 수 없는 인터페이스의 API를 사용해야 할 때도 있습니다.

이를 해결하는 가장 좋은 방법은 복잡성을 차단하는 것입니다. 복잡성이 주변 영역으로 스며들지 않도록 간단한 일과 복잡성 사이에 명확한 경계를 만들어야 합니다.

간단하고 이해하기 쉬운 코드는 밖으로, 복잡한 부분은 어려운 문제를 처리하는 코어로 밀어 넣는 것이죠. 이렇게 하면 앱 전체에 흩어져 있지 않게 되므로 대부분의 기여자는 이러한 복잡성을 처리할 필요가 없습니다.

예로 이 프로젝트에선 노드 모듈을 적절히 추상화해두었습니다:

```typescript
// utils/utils.ts
import fs from 'node:fs/promises';
import path from 'node:path';

import colorLog from './log';

export const getPaths = async (patterns: string | string[]) => {
  const { globby } = await import('globby');
  return await globby(patterns);
};

export const fileExists = async (src: string) => {
  try {
    await fs.access(src, fs.constants.R_OK);
    return true;
  } catch (error) {
    return false;
  }
};

export const pathExists = async (dest: string) => {
  try {
    await fs.access(dest);
    return true;
  } catch (error) {
    return false;
  }
};

export const mkDirIfMissing = async (dest: string) => {
  const dirName = path.dirname(dest);
  if (await pathExists(dirName)) {
    return;
  }

  try {
    await fs.mkdir(dirName, { recursive: true });
  } catch (error) {
    colorLog(`Failed to create directory ${dirName}`, 'error');
  }
};

export const removeFolder = async (dir: string) => {
  try {
    if (await pathExists(dir)) {
      await fs.rm(dir, { recursive: true });
    }
  } catch (error) {
    colorLog(`Failed to remove directory ${dir}`, 'error');
  }
};

export const writeFile = async (
  dest: string,
  data: Parameters<typeof fs.writeFile>[1],
  encoding: BufferEncoding = 'utf8'
) => {
  await mkDirIfMissing(dest);
  await fs.writeFile(dest, data, encoding);
};

export const copyFile = async (src: string, dest: string) => {
  await mkDirIfMissing(dest);
  await fs.copyFile(src, dest);
};

...
```

파일을 읽거나 쓰고, 폴더를 생성/삭제하는 등의 작업은 개발 과정에서 자주 발생합니다.이러한 작업을 할 때 노드 모듈을 다루게 됩니다. `utils.ts` 파일에 정의된 함수들은 파일 시스템 작업을 수행하는 공통적인 작업들을 추상화합니다. 이러한 추상화는 많은 이점을 제공합니다:

1. 유지보수 향상: 코드의 중복을 줄이고 재사용 가능한 함수로 적절히 추상화했습니다.
2. 가독성: 각 함수는 명확한 이름과 목적을 가지고 있어, 코드를 읽는 사람이 해당 함수가 무엇을 하는지 쉽게 이해할 수 있습니다. 예를 들어, `writeFile` 함수는 여러 단계를 추상화하여, 파일을 쓰는 작업을 간단하게 만듭니다. 폴더 존재 여부를 직접 확인하고 생성하는 복잡한 로직을 구현할 필요 없이, `writeFile` 함수를 호출하기만 하면 됩니다. **노드 모듈을 잘 모르는 개발자도 쉽게 작업을 할 수 있도록** 도와줍니다!
3. 오류 처리: 파일 시스템 작업은 실패할 가능성이 있습니다. 각 함수는 오류 처리 로직을 내장하고 있어, 각 작업을 수행할 때마다 오류 처리를 반복적으로 구현할 필요가 없습니다.

이러한 추상화는 코드를 더 단순하고 이해하기 쉽게 만들며, 동시에 코드의 재사용성과 유지보수성을 향상시켜주기에 적절하다고 볼 수 있습니다. 따라서, 추상화 자체가 나쁜 것이 아니라, 어떻게 사용되느냐가 중요합니다.

## 똑똑하다는 것을 복잡한 코드로 티내지 말기

모든 사람들은 자신이 잘 알고 있다는 것을 서로에게 증명하려고 노력합니다. 일부러 해독이 불가능할 만큼 추상화하고 억지로 라인 수를 줄여 예쁘게 함수를 작성하는 것처럼요.

하지만 복잡한 코드는 누구나 작성할 수 있습니다. 진짜 어려운 것은 **복잡한 일을 간단한 코드로 해결**하는 것입니다.

4번째 이슈에 대한 내용은 Joshua Comeau의 [Clever Code Considered Harmful](https://www.joshwcomeau.com/career/clever-code-considered-harmful/) 글에 영감을 받아 작성되었습니다. 이 글에선 모두가 이해하고 사용할 수 있는 간단한 코드를 작성해야 하는 이유에 대해 설명합니다.
