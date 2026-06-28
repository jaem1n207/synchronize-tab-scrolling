<p align="center">
  <a href="https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc" target="_blank" rel="noreferrer noopener">
    <img width="250" src="https://github.com/jaem1n207/synchronize-tab-scrolling/assets/50766847/ec9b53f7-b8b7-46fe-9b0f-bf08b38cb940" alt="Synchronize Tab Scrolling 로고" />
  </a>
</p>

<h1 align="center">Synchronize Tab Scrolling</h1>

<p align="center">
  <strong>한 번 스크롤하면, 모든 탭이 함께 움직입니다.</strong><br/>
  여러 탭의 스크롤을 동시에 맞춰주는 브라우저 확장 프로그램이에요.
</p>

<p align="center">
  <a href="https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc">
    <img alt="Chrome" src="https://img.shields.io/badge/Chrome-4285F4?style=for-the-badge&logo=GoogleChrome&logoColor=white">
  </a>
  <a href="https://microsoftedge.microsoft.com/addons/detail/synchronize-tab-scrolling/jonclaakmpjodjggkadldgkapccdofnn">
    <img alt="Edge" src="https://img.shields.io/badge/Edge-0078D7?style=for-the-badge&logo=Microsoft-edge&logoColor=white">
  </a>
  <a href="https://addons.mozilla.org/firefox/addon/synchronize-tab-scrolling">
    <img alt="Firefox" src="https://img.shields.io/badge/Firefox-FF7139?style=for-the-badge&logo=Firefox-Browser&logoColor=white">
  </a>
  <a href="https://chromewebstore.google.com/detail/synchronize-tab-scrolling/phceoocamipnafpgnchbfhkdlbleeafc">
    <img alt="Brave" src="https://img.shields.io/badge/Brave-FB542B?style=for-the-badge&logo=Brave&logoColor=white">
  </a>
</p>

<p align="center">
  <a href="https://github.com/jaem1n207/synchronize-tab-scrolling/releases">
    <img alt="Release" src="https://img.shields.io/github/v/release/jaem1n207/synchronize-tab-scrolling?style=flat-square&color=6096B4">
  </a>
  <a href="https://github.com/jaem1n207/synchronize-tab-scrolling/blob/main/LICENSE">
    <img alt="License" src="https://img.shields.io/github/license/jaem1n207/synchronize-tab-scrolling?style=flat-square&color=6096B4">
  </a>
</p>

<p align="center">
  <a href="./README.md">ENGLISH</a> | 한국어
</p>

---

## 이게 뭔가요?

두 문서를 나란히 놓고 읽을 때(ex: 원문과 번역문) 스크롤을 맞추는 게 번거로웠죠? 이 확장 프로그램이 그 문제를 해결해 줘요.

**한 탭에서 스크롤하면, 연결된 모든 탭이 같은 위치로 자동으로 따라와요.**

---

## 사용 영상

<a href="https://youtu.be/cpLPy5OlJ8g?si=dfDTYmt7NbakQocG">
  <img src="https://img.youtube.com/vi/cpLPy5OlJ8g/0.jpg" alt="사용 영상" width="480" height="360" />
</a>

---

## 사용 방법

### 1단계: 설치

위의 브라우저 배지 중 하나를 클릭해서 각 브라우저의 확장 프로그램 스토어에서 설치해 주세요.

### 2단계: 탭 열기

탭을 두 개 이상 열어 주세요.

**로컬 파일:** `file://`로 열린 브라우저에서 읽을 수 있는 로컬 파일은 수동 동기화할 수 있어요.
예를 들어 HTML 보고서, Markdown, JSON, 텍스트, CSV, 로그 파일을 지원합니다. Chromium 계열
브라우저에서 팝업이 요청하면 이 확장 프로그램의 **"파일 URL에 대한 액세스 허용"** 설정을 켜 주세요.

### 3단계: 동기화 시작

1. 브라우저 도구 모음에서 확장 프로그램 아이콘을 클릭해 주세요
2. 동기화할 탭을 선택해 주세요 (체크박스 선택)
3. **"동기화 시작"** 버튼을 클릭해 주세요

### 4단계: 스크롤!

동기화된 탭 중 아무 곳에서나 스크롤해 보세요. 연결된 모든 탭이 자동으로 따라와요.

MDN 같은 페이지는 내부 링크 이동을 위해 CSS smooth scrolling을 설정할 수 있어요. Synchronize
Tab Scrolling은 확장이 적용하는 동기화 스크롤에 한해서만 이 애니메이션을 우회하므로, 연결된
탭이 오래된 위치를 천천히 따라가지 않고 최신 위치로 즉시 맞춰져요. 페이지 자체의 일반 스크롤이나
anchor navigation 동작은 바꾸지 않습니다.

### 팁: 수동 위치 조정

원문과 번역문처럼 같은 내용이라도 언어에 따라 길이가 달라요—어떤 언어는 간결하게, 어떤 언어는 길게 표현하니까요. 그래서 스크롤하다 보면 읽고 있는 위치가 점점 어긋나기도 해요.

**Option** (Mac) 또는 **Alt** (Windows) 키를 누른 채로 스크롤하면, 다른 탭에 영향을 주지 않고 특정 탭의 위치만 조정할 수 있어요. 키를 놓으면 조정된 위치를 기준으로 동기화가 계속돼요.

### 5단계: 동기화 중지

확장 프로그램 아이콘을 다시 클릭해서 **"동기화 해제"**를 선택하거나, 동기화된 탭을 닫으면 돼요.

---

## 지원되지 않는 페이지

브라우저 보안 제한 때문에 아래 페이지에서는 동기화가 안 돼요:

- 브라우저 내부 페이지 (`chrome://`, `edge://`, `about:`)
- 확장 프로그램 스토어
- Google 서비스 (문서, 드라이브, Gmail, 스프레드시트 등)
- 일부 웹 앱 (Figma, JIRA, Microsoft Office Online, Notion 등)
- 검색 엔진 결과 페이지 (Google 검색, 네이버, Bing, DuckDuckGo 등)
- PDF 파일 및 PDF 뷰어
- 로컬 Word 문서 (`file://` `.doc` / `.docx`)
- 로그인/인증 페이지
- 특수 URL (`view-source:`, `data:`, `blob:`)

이런 탭은 선택 목록에서 비활성화돼요.

---

## 누구를 위한 건가요?

- 여러 논문을 동시에 검토할 때
- 코드 버전을 나란히 비교할 때
- 원문과 번역문을 비교할 때
- **여러 문서를 동시에 다루는 모든 분**

---

## 주요 기능

### 실시간 스크롤 동기화

한 탭에서 스크롤하면, 연결된 모든 탭이 같은 위치로 즉시 이동해요.
CSS `scroll-behavior: smooth`를 사용하는 페이지에서도 확장이 적용하는 동기화 스크롤은 즉시
반영되며, 페이지 자체의 smooth scrolling 설정은 전역으로 끄지 않아요.

```mermaid
flowchart LR
    subgraph 사용자["사용자 동작"]
        A[탭 A에서 스크롤]
    end

    A --> B[확장 프로그램이 위치 감지]
    B --> C[탭 B가 같은 위치로 이동]
    B --> D[탭 C가 같은 위치로 이동]
```

### 수동 위치 조정

문서의 위치가 완벽하게 맞지 않을 때가 있어요. **Option** (Mac) 또는 **Alt** (Windows) 키를 누른 채로 스크롤하면, 동기화를 유지하면서 개별 탭의 위치를 조정할 수 있어요.

```mermaid
flowchart TD
    A["Option/Alt 키 누르기"] --> B["한 탭에서 자유롭게 스크롤"]
    B --> C["키 놓기"]
    C --> D["새 위치가 저장됨"]
    D --> E["새 기준점에서 동기화 계속"]
```

### URL 이동 동기화

동기화 중인 한 탭에서 링크를 클릭하면, 다른 동기화 탭도 페이지 이동을 함께 따라가도록 설정할 수 있어요.
팝업에서는 **"페이지 이동도 동기화"** 옵션으로 표시되며, 최종 결정 버튼인 **"동기화 시작"** 근처에 있어요.

페이지 이동 방식은 두 가지 중에서 고를 수 있어요.

- **변경한 탭 따라가기**: 다른 탭도 변경한 탭이 연 웹사이트/페이지로 이동해요.
- **각 탭의 웹사이트 유지**: 각 탭은 자기 웹사이트에 남고, 가능한 경우 같은 페이지 경로를 열어요.

### 자동 동기화 제안

확장 프로그램이 같은 페이지로 보이는 탭을 발견하면, 예를 들어 같은 URL의 탭이 여러 개 열려 있으면,
각 탭의 오른쪽 하단에 토스트 알림이 나타나요. 이 기능은 스크롤 동기화를 시작하자는 제안일 뿐이고,
동기화 시작 후 페이지 이동을 따라갈지 정하는 **"페이지 이동도 동기화"**와는 별도예요.

```mermaid
flowchart LR
    A[같은 페이지 탭 열기] --> B[토스트 표시]
    B --> C{사용자 선택}
    C -->|동기화 시작| D[동기화 시작됨]
    C -->|지금 안 함| E[세션 동안 무시됨]
    C -->|이 사이트에서 표시 안 함| F[도메인 영구 제외]
    B --> G[10초 후 자동 사라짐]
```

이 기능은 **기본적으로 활성화**되어 있어요.

- **작업 메뉴** → **"같은 페이지 탭 자동 제안"**에서 전체 비활성화할 수 있어요
- 토스트의 **"이 사이트에서 다시 표시 안 함"**을 클릭하면 특정 도메인만 제외할 수 있어요
- **작업 메뉴** → **"제외된 도메인 관리"**에서 제외 목록을 관리할 수 있어요

이미 동기화가 진행 중일 때 새로운 동기화 제안이 나타나면, 토스트에 경고 메시지와 **"교체하고 동기화"** 버튼이 표시돼요.

### 도메인 제외 관리

특정 도메인을 자동 동기화 제안에서 영구적으로 제외할 수 있어요. 동기화 제안이 필요 없는 사이트에 유용해요.

**도메인을 제외하는 방법:**

- 동기화 제안 토스트에서 **"이 사이트에서 다시 표시 안 함"**을 클릭
- 또는 **작업 메뉴** → **"제외된 도메인 관리"**에서 직접 추가

**제외 목록 관리 방법:**

- 확장 프로그램 팝업 → **작업 메뉴** → **"제외된 도메인 관리"** 열기
- 새 도메인 추가 또는 기존 도메인 삭제
- 키보드로 탐색: 화살표 키로 이동, Enter로 확인, Delete로 삭제

### 자동 재연결

탭의 연결이 끊어지면(예: 컴퓨터가 절전 모드에서 깨어난 후) 확장 프로그램이 자동으로 다시 연결하고 동기화를 재개해요. 별도의 조작이 필요 없어요.

```mermaid
flowchart LR
    A[연결 끊김] --> B[자동 감지]
    B --> C[재연결]
    C --> D[동기화 재개]
```

---

## 지원 언어

확장 프로그램 인터페이스는 **9개 언어**로 제공돼요:

| 언어                | 코드  |
| ------------------- | ----- |
| English (영어)      | en    |
| 한국어              | ko    |
| 日本語 (일본어)     | ja    |
| Français (프랑스어) | fr    |
| Español (스페인어)  | es    |
| Deutsch (독일어)    | de    |
| 중국어 (중국)       | zh_CN |
| 중국어 (대만)       | zh_TW |
| हिन्दी (힌디어)     | hi    |

---

## 개인정보 보호정책

**여러분의 개인정보를 소중히 생각해요.**

- **데이터 수집 없음**: 어떤 개인 정보도 수집하거나 저장하지 않아요
- **분석 없음**: 추적, 쿠키, 원격 측정 없음
- **네트워크 요청 없음**: 확장 프로그램은 완전히 오프라인으로 작동해요
- **오픈 소스**: [모든 코드를 직접 확인](https://github.com/jaem1n207/synchronize-tab-scrolling)할 수 있어요

이 확장 프로그램은 동기화를 위해 명시적으로 선택한 탭에만 접근하며, 모든 데이터는 여러분의 기기에만 저장돼요.

---

## 지원

문제가 있으신가요? 도움을 드릴게요:

- **이메일**: [tech.jmtt@gmail.com](mailto:tech.jmtt@gmail.com)
- **GitHub**: [버그 신고하기](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/new?title=버그%20신고&labels=bug&assignees=jaem1n207)

---

## 기여하기

기여하고 싶으신가요? [Contributing Guide](./CONTRIBUTING.md)에서 개발 환경 설정과 가이드라인을 확인해 주세요.

---

## 라이선스

MIT 라이선스. 자세한 내용은 [LICENSE](./LICENSE) 파일을 확인해 주세요.
