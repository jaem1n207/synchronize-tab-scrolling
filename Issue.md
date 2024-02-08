# 99번째 이슈: CSS 선택자 내 큰따옴표 이슈

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
