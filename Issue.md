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
  target: typeof chrome | typeof browser,
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
const wrapObject = (target: typeof chrome | typeof browser) => {
  ...
  return new Proxy(proxyTarget, handlers) as typeof chrome;
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
  '[data-cmdk-item][data-value="Steal The Show (From "Elemental") - YouTube Music"]'
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
