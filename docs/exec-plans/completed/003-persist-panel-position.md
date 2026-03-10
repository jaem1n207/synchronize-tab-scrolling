# 003: Persist Panel Drag Position

- **Status**: Completed
- **Branch**: `feat/persist-panel-position` → merged into `release/2.9.0`
- **PR**: #337
- **Commits**: `3275b76`, `03c0eab`, `aa5c2e6`, `272bcfe`, `b18dd52`, `d0edf30`, `fddca29`

## Background

스크롤 동기화 패널의 드래그 버튼은 화면 내에서 위치를 변경할 수 있지만, 페이지 새로고침이나 URL 변경 시 초기 위치(`{ x: 32, y: 32 }`)로 리셋되는 문제. 추가로 한 탭에서 위치를 변경하면 다른 동기화된 탭의 위치도 덩달아 변경되는 문제가 발견됨.

---

## Phase 1: 위치 영속화 (초기 구현)

### 접근

`browser.storage.local`에 `panelPosition` 키로 위치를 저장하고 마운트 시 로드.

### 수정

- `storage.ts`에 `PANEL_POSITION` 키, `PanelPosition` 인터페이스, `savePanelPosition`/`loadPanelPosition` 함수 추가
- `useDragPosition` 훅에서 마운트 시 `loadPanelPosition()` 호출, 드래그 종료 시 `savePanelPosition()` 호출

### 문제 발견

탭1에서만 패널 위치를 변경했는데 페이지 이동 후 탭2의 패널 위치가 탭1과 동일하게 변경됨.

---

## Phase 2: 크로스탭 위치 오염 수정

### 원인 분석

두 가지 원인이 복합적으로 작용:

#### 원인 A: 실시간 크로스탭 브로드캐스트

```
handleMouseUp:
  snapToEdge() → setPosition() → savePanelPosition()
  → sendMessage('panel:position', { x, y, sourceTabId }, 'background')
  → background가 모든 동기화된 탭에 중계

onMessage('panel:position'):
  수신 탭에서 setPosition({ x, y }) + savePanelPosition({ x, y })
  → 탭2가 탭1의 위치를 실시간으로 받아 적용
```

#### 원인 B: 글로벌 스토리지 공유

```
browser.storage.local:
  panelPosition: { x: 200, y: 300 }  ← 모든 탭이 동일한 키를 공유

탭1 드래그 → 글로벌 storage에 저장
탭2 페이지 이동 → 재마운트 → loadPanelPosition() → 탭1의 위치 로드
```

### 해결: sessionStorage 전환

`sessionStorage`는 브라우저에서 **탭별로 독립적**으로 관리되는 저장소:

```
탭1의 sessionStorage: { __sync_tab_scroll_panel_pos: '{"x":200,"y":300}' }
탭2의 sessionStorage: { __sync_tab_scroll_panel_pos: '{"x":32,"y":32}' }
→ 서로 접근 불가, 오염 원천 차단
```

장점:

- **탭별 격리**: 각 탭이 독립적인 sessionStorage를 가짐
- **탭 내 영속성**: 같은 탭에서 페이지 이동 시에도 유지 (같은 origin 내)
- **동기식 API**: `browser.storage.local` 대비 async IPC 오버헤드 없음
- **자동 정리**: 탭을 닫으면 자동 삭제 (메모리 누수 없음)

추가 개선:

- `useState` lazy initializer 적용 → 첫 렌더부터 올바른 위치 적용 (깜빡임 제거)
- `panel:position` 메시지 송수신 로직 전체 제거
- webext-bridge, webextension-polyfill, logger import 제거 → 번들 크기 감소

### 파일 변경

| 파일                                                 | 변경                                                  |
| ---------------------------------------------------- | ----------------------------------------------------- |
| `src/contentScripts/hooks/use-drag-position.ts`      | sessionStorage 전환, 브로드캐스트 제거, 동기식 초기화 |
| `src/contentScripts/hooks/use-drag-position.test.ts` | 신규 생성 — sessionStorage 기반 23개 테스트           |
| `src/shared/lib/storage.ts`                          | 미사용 `PANEL_POSITION` 키 및 관련 함수 제거          |
| `src/shared/lib/storage.test.ts`                     | 제거된 함수의 테스트 제거                             |

---

## Results

- 658 tests, 0 type errors, lint clean, build clean
- 번들 크기 감소 (490.83KB vs 491.45KB — 불필요한 import 제거)

## Key Takeaway

> **전역 저장소에 탭별 데이터를 저장하지 마라.** `browser.storage.local`은 모든 탭이 공유한다. 탭별로 독립적이어야 하는 데이터는 `sessionStorage`를 사용하라. 동기식이라 성능도 더 좋다.

> **"동기화"와 "공유"를 구분하라.** 스크롤 위치를 동기화하는 것과, UI 패널의 위치를 공유하는 것은 다른 요구사항이다. 동기화 인프라가 있다고 모든 상태를 공유할 필요는 없다.
