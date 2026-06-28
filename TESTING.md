# 확장 프로그램 테스트 가이드

## 문제 해결: "No handler registered in 'background'" 오류

이 오류는 백그라운드 스크립트가 제대로 로드되지 않았을 때 발생합니다.

### 해결 방법

1. **Chrome 확장 프로그램 페이지 열기**
   - `chrome://extensions/` 로 이동

2. **확장 프로그램 완전히 다시 로드**
   - "Synchronize Tab Scrolling" 확장 프로그램 찾기
   - 새로고침 버튼 클릭 (🔄)
   - 또는 확장 프로그램을 비활성화했다가 다시 활성화

3. **백그라운드 스크립트 콘솔 확인**
   - 확장 프로그램에서 "서비스 워커" 또는 "백그라운드 페이지" 링크 클릭
   - 콘솔에서 다음 메시지 확인:
     ```
     [INFO] [background]: Background script loaded, registering message handlers
     [INFO] [background]: Registering scroll:start handler
     ```

4. **팝업 테스트**
   - 브라우저 툴바에서 확장 프로그램 아이콘 클릭
   - 2개 이상의 탭 선택
   - "Start Sync" 버튼 클릭
   - 에러 없이 동작하는지 확인

## 정상 동작 확인 사항

### 팝업 UI

- ✅ 탭 목록이 표시됨
- ✅ 검색으로 탭 필터링 가능
- ✅ 체크박스로 탭 선택 가능
- ✅ 현재 탭에 "Current" 배지 표시
- ✅ 선택된 탭 개수 표시
- ✅ "페이지 이동도 동기화"가 탭 선택 목록 아래, "Start Sync" 버튼 위에 표시됨
- ✅ URL Sync mode editor에서 "변경한 탭 따라가기"와 "각 탭의 웹사이트 유지"를 선택 가능
- ✅ Start Sync 버튼 클릭 시 동기화 시작

### 콘텐츠 스크립트 패널

- ✅ 동기화 시작 시 탭에 드래그 가능한 패널 표시
- ✅ 패널에 연결된 탭 목록 표시
- ✅ 패널 최소화/최대화 가능
- ✅ 패널 드래그로 위치 이동 가능
- ✅ 패널이 다른 요소 위에 표시됨 (z-index: 2147483647)

### 스크롤 동기화

- ✅ 한 탭에서 스크롤 시 다른 탭도 동기화됨
- ✅ 딜레이 < 100ms
- ✅ Stop Sync 버튼으로 동기화 중지 가능

### URL 이동 동기화

- ✅ URL Sync ON + "변경한 탭 따라가기"에서 변경한 탭의 페이지 이동을 다른 탭이 따라감
- ✅ URL Sync ON + "각 탭의 웹사이트 유지"에서 가능한 경우 각 탭이 자기 웹사이트에 남아 대응 페이지를 염
- ✅ URL Sync OFF에서 스크롤 동기화는 유지되지만 페이지 이동은 전파되지 않음
- ✅ 팝업과 content panel이 저장된 실제 URL Sync mode를 동일하게 표시

### Privacy logging guard

- ✅ `pnpm privacy:logging:test`로 raw URL/title/payload logging 규칙 테스트 통과
- ✅ `pnpm privacy:logging`으로 source validator 통과

### 로컬 파일 수동 동기화

- ✅ `file://` HTML, Markdown, JSON, 텍스트, CSV, 로그 파일이 수동 선택 가능
- ✅ Chrome/Edge/Brave에서 파일 URL 접근이 꺼져 있으면 팝업에 설정 버튼 표시
- ✅ 설정 버튼이 `chrome://extensions/?id=<extension-id>` 또는 `edge://extensions/?id=<extension-id>`로 이동
- ✅ 파일 URL 접근을 켠 뒤 팝업을 다시 열면 로컬 파일 탭 선택 가능
- ✅ `file://` PDF와 Word 문서(`.doc`, `.docx`)는 계속 비활성화
- ✅ `data:`, `blob:`, `view-source:`, `about:` 같은 특수 URL은 계속 비활성화

## 디버깅

### 백그라운드 콘솔 로그 확인

```
chrome://extensions/ → 서비스 워커 클릭
```

### 팝업 콘솔 로그 확인

```
확장 프로그램 아이콘 우클릭 → 검사
```

### 콘텐츠 스크립트 콘솔 로그 확인

```
F12 → 콘솔 탭
```
