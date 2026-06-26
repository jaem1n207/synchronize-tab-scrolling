# 로컬 파일 수동 동기화

이 문서는 `file://` 로컬 파일에 대한 현재 수동 스크롤 동기화 지원 범위를 정리한다.

## 지원 범위

브라우저가 직접 렌더링할 수 있는 `file://` 로컬 파일은 수동 동기화할 수 있다.

- HTML 보고서
- Markdown
- JSON
- 일반 텍스트
- CSV
- 로그 파일

확장 프로그램은 tab id, URL, scroll position만 사용한다. 로컬 파일 내용을 읽거나 업로드하지
않는다.

## 지원하지 않는 대상

다음 대상은 계속 unavailable 상태로 유지한다.

- PDF 파일 및 PDF viewer page
- 로컬 Word 문서 (`.doc`, `.docx`)
- 브라우저 내부 페이지 (`chrome://`, `edge://`, `about:`)
- 확장 프로그램 스토어 페이지
- `data:`, `blob:`, `filesystem:`, `javascript:`, `vbscript:`, `view-source:`

## Chromium 파일 URL 접근 권한

Chrome, Edge, Brave, Arc 등 Chromium 브라우저는 확장 프로그램이 로컬 파일에 content script를
주입하기 전에 사용자가 extension detail page에서 별도 설정을 켜야 한다.

설정이 꺼져 있으면 popup은 다음을 보여야 한다.

- unavailable 로컬 파일 row
- local file access가 꺼져 있다는 reason
- `chrome://extensions/?id=<runtime.id>` 또는 `edge://extensions/?id=<runtime.id>`를 여는
  settings action

사용자가 **Allow access to file URLs**를 켠 뒤에는 popup을 다시 열고 로컬 파일 탭을 다시 선택해야
한다.

## Firefox 및 확인 불가능한 브라우저

Firefox는 Chromium의 `chrome.extension.isAllowedFileSchemeAccess()` capability를 제공하지 않는다.
파일 URL 접근 상태를 확인할 수 없는 브라우저에서는 popup eligibility를 낙관적으로 유지하고,
실제 content-script 연결 결과로 성공/실패를 판단한다.

## Auto-Sync 범위

Auto-sync suggestion은 의도적으로 `file://` 페이지를 그룹화하지 않는다. 로컬 경로는 사용자의
private machine detail을 드러낼 수 있고 자동 그룹 key로도 오해를 만들 수 있으므로, 로컬 파일은
manual sync만 지원한다.

## Regression Checklist

`src/manifest.ts`, `src/shared/lib/url-utils.ts`, `src/shared/lib/file-scheme-access.ts`,
`src/popup/hooks/use-tab-discovery.ts`, `src/popup/hooks/use-sync-control.ts`를 수정했다면 다음을
확인한다.

```bash
pnpm build
rg -nF 'file:///*' extension/manifest.json
pnpm i18n:validate
pnpm test
```

Manual QA:

1. Chromium 브라우저에서 빌드된 `extension/` 폴더를 load unpacked 한다.
2. file URL access를 끈 상태로 로컬 `.html`, `.md`, `.json` 파일을 연다.
3. 로컬 파일 row가 settings action과 함께 unavailable로 표시되는지 확인한다.
4. 이 확장 프로그램의 **Allow access to file URLs**를 켠다.
5. Popup을 다시 열고 두 개의 로컬 파일 탭을 manual sync 한다.
6. 로컬 `.pdf`, `.doc`, `.docx` 파일이 계속 unavailable인지 확인한다.
