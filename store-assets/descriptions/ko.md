---
사용 방법

1. 확장 프로그램 아이콘을 클릭합니다.
2. 현재 열린 탭 목록에서 동기화할 탭을 선택합니다.
3. 탭이 많다면 제목, URL 일부, 도메인으로 빠르게 찾습니다.
4. "동기화 시작"을 누른 뒤, 연결된 탭 중 아무 탭에서나 스크롤합니다.
---

기본 스크롤 동기화

한 탭에서 스크롤하면 연결된 다른 탭도 각 페이지 길이에 맞춰 같은 상대 위치로 이동합니다.

예를 들어 한 문서의 40% 지점으로 이동하면, 다른 문서도 자기 페이지 길이 기준 40% 지점에 맞춰집니다. 페이지 길이가 달라도 전체 흐름을 기준으로 함께 움직이므로 긴 문서를 나란히 읽을 때 편합니다.

페이지에 smooth scrolling이 적용되어 있어도 동기화 스크롤은 최신 위치를 즉시 반영합니다.

---

수동 위치 조정

페이지 구조가 다르면 같은 상대 위치라도 문단이 어긋날 수 있습니다.

번역문은 원문보다 길거나 짧을 수 있고, Staging과 Production은 배너나 실험 UI가 다를 수 있습니다. 문서마다 목차, 광고, 헤더 높이도 다를 수 있습니다.

이럴 때 Option(Mac) 또는 Alt(Windows/Linux)를 누른 채 한 탭만 스크롤하세요.

키를 누르는 동안에는 현재 탭만 움직입니다. 키를 떼면 그 위치가 새 기준점으로 저장되고, 이후에는 다시 모든 탭이 함께 스크롤됩니다.

동기화를 끊지 않고 비교 위치만 다시 맞추고 싶을 때 유용합니다.

---

URL Sync

URL Sync를 켜면 스크롤 위치뿐 아니라 지원되는 페이지 이동도 함께 맞출 수 있습니다.

`/products/keyboard`에서 `/products/mouse`로 이동하는 것처럼 경로(path)가 바뀌어도 동기화됩니다. 검색어, 필터, 정렬처럼 쿼리 파라미터에 담긴 정보도 함께 반영됩니다. `/ko`, `/en` 같은 언어 경로는 가능한 경우 각 탭의 언어에 맞게 유지됩니다.

URL Sync는 두 가지 모드를 제공합니다.

1. 변경한 탭 따라가기

다른 탭도 변경한 탭의 웹사이트와 페이지 흐름을 따라갑니다. 경로와 쿼리 파라미터가 함께 바뀌며, 대상 탭에 `/en`, `/ko` 같은 언어 경로가 있으면 가능한 경우 그 언어를 유지합니다.

시작 상태:

• 탭 A: https://docs.example.com/ko/guides/start?q=scroll&filter=basic
• 탭 B: https://docs.example.com/en/guides/start?q=scroll&filter=basic

탭 A에서 다른 경로와 검색 조건으로 이동:

• 탭 A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced

결과:

• 탭 A: https://docs.example.com/ko/guides/url-sync?q=tab-sync&filter=advanced
• 탭 B: https://docs.example.com/en/guides/url-sync?q=tab-sync&filter=advanced

같은 사이트의 문서, 내부 검색 결과, 필터링된 목록을 여러 언어로 나란히 확인할 때 적합합니다.

2. 각 탭의 웹사이트 유지

각 탭은 자기 웹사이트에 남아 있고, 가능한 경우 같은 경로와 쿼리 파라미터로 이동합니다. 언어 경로도 각 탭에 맞게 유지됩니다.

시작 상태:

• 탭 A: https://www.example.com/ko/products/keyboard?q=keyboard&color=black
• 탭 B: https://staging.example.com/en/products/keyboard?q=keyboard&color=black

탭 A에서 다른 상품 경로와 필터로 이동:

• 탭 A: https://www.example.com/ko/products/mouse?q=mouse&color=white

결과:

• 탭 A: https://www.example.com/ko/products/mouse?q=mouse&color=white
• 탭 B: https://staging.example.com/en/products/mouse?q=mouse&color=white

사이트는 다르지만 URL 구조가 비슷한 페이지를 비교할 때 적합합니다. Production과 Staging, A/B variant, 국가별 사이트, 언어별 페이지, 내부 검색 결과, 필터링된 상품 목록을 나란히 확인할 수 있습니다.

브라우저 보안 정책이나 사이트 제한으로 지원되지 않는 페이지에서는 URL Sync가 적용되지 않을 수 있습니다. 예를 들어 일부 검색 엔진 결과 페이지, 로그인 페이지, PDF 뷰어, 웹 애플리케이션 페이지는 동기화 대상에서 제외됩니다.

---

주요 기능

• HTML, Markdown, JSON, 텍스트, CSV, 로그 등 브라우저가 직접 렌더링할 수 있는 로컬 file:// 페이지 수동 동기화
• 여러 탭의 스크롤 위치를 실시간으로 동기화
• URL Sync로 페이지 이동까지 함께 동기화
• 같은 웹사이트를 따라가는 모드와 각 탭의 웹사이트를 유지하는 모드 제공
• 경로(path), 검색어, 필터, 정렬 등 쿼리 파라미터 동기화 지원
• Option/Alt 키로 한 탭만 미세 조정한 뒤, 조정된 위치부터 다시 동기화
• Staging/Production, A/B variant, 원문/번역문, 다국어 페이지 비교 지원
• 동일하거나 관련된 페이지를 감지하면 자동 동기화 제안
• Chrome, Firefox, Edge, Brave 및 Chromium 기반 브라우저 지원
• 데이터 수집, 분석, 추적, 계정 가입 없이 로컬에서 동작

---

지원되지 않는 페이지

브라우저 보안 정책이나 사이트 제한으로 인해 다음 페이지에서는 사용할 수 없습니다.

• Google 서비스: Docs, Drive, Gmail, Sheets, Slides
• Figma, JIRA, Notion, Microsoft Office Online 등 웹 애플리케이션
• 브라우저 내부 페이지: chrome://, edge://, about:
• 확장 프로그램 스토어 및 일부 검색 엔진 결과 페이지
• PDF 파일 및 PDF 뷰어
• 로그인 및 인증 페이지
• view-source:, data:, blob: 등 특수 URL

지원되지 않는 탭은 선택 목록에서 비활성화되며, 제한 사유는 툴팁으로 확인할 수 있습니다.

---

개인정보 보호

• 사용자 데이터를 수집하지 않음
• 분석, 추적, 쿠키 없음
• 네트워크 요청 없이 오프라인으로 동작
• 계정 및 로그인 불필요
• 로컬 파일 내용을 읽거나 업로드하지 않음
• 오픈소스: https://github.com/jaem1n207/synchronize-tab-scrolling

---

Chrome, Firefox, Edge, Brave 및 Chromium 기반 브라우저에서 사용할 수 있습니다.

9개 언어 지원: 한국어, English, 日本語, Français, Español, Deutsch, 中文(简体), 中文(繁體), हिन्दी.
