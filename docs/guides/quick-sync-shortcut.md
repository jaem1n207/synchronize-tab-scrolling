# Quick Sync 단축키 운영 가이드

Quick Sync는 팝업을 열지 않고 현재 탭을 수동 스크롤 동기화 세션에 시작하거나 추가하는
브라우저 전역 WebExtension command다. 이 문서는 구현·운영·릴리스 검증 계약을 요약한다.
전체 제품 설계와 배경은
[`2026-08-11-quick-sync-shortcut-design.md`](../superpowers/specs/2026-08-11-quick-sync-shortcut-design.md)를
참고한다.

## Command와 기본값

manifest에는 다음 command 하나만 둔다.

| 항목                        | 값                                           |
| --------------------------- | -------------------------------------------- |
| command name                | `quick-sync-start-or-add`                    |
| macOS suggested key         | `Command+Shift+Period` (`⌘ ⇧ .`)             |
| Windows/Linux suggested key | `Ctrl+Shift+Period` (`Ctrl ⇧ .`)             |
| 의미                        | 후보 지정, 두 탭 Start, 활성 세션에 Add 전용 |

이 command는 toggle이 아니다. 이미 포함된 탭을 제거하거나 세션을 Stop하지 않는다. 팝업
내부의 `Cmd/Ctrl+S`는 팝업에 포커스가 있을 때 Start/Stop을 실행하는 별도 단축키다.

## 정확한 후보 결정표

후보는 브라우저 프로필 전체에 하나뿐이며 background 메모리에만 존재한다.

| 커밋된 상태              | command 대상              | 결정                                                |
| ------------------------ | ------------------------- | --------------------------------------------------- |
| inactive, 후보 없음      | eligible 탭               | HUD/Port handshake 성공 후 10초 후보로 지정         |
| inactive, 유효 후보 있음 | 같은 후보 탭              | no-op, 기존 `expiresAt` 유지                        |
| inactive, 유효 후보 있음 | 다른 eligible 탭          | 두 탭 require-all Start 시도                        |
| inactive, 만료 후보 있음 | 어떤 eligible 탭          | 만료 후보를 지운 뒤 새 첫 입력으로 처리             |
| active manual session    | 포함되지 않은 eligible 탭 | 기존 세션에 그 탭 하나만 Add 시도                   |
| active manual session    | 이미 포함된 탭            | no-op과 포함됨 feedback                             |
| 어떤 상태든              | ineligible/접근 불가 탭   | 후보와 세션을 바꾸지 않고 badge/recent outcome 표시 |

### 10초 경계

- 첫 입력의 절대 마감은 한 번만 `Date.now() + 10_000`으로 정한다.
- 화면 숫자는 저장된 counter가 아니라 `ceil((expiresAt - now) / 1000)`으로 계산한다.
- 같은 탭 재입력은 마감을 연장하지 않는다.
- command event가 `commandReceivedAt < expiresAt`에 도착했다면 gate나 ACK가 마감 뒤에
  끝나도 해당 Start 시도는 유효하다.
- `commandReceivedAt >= expiresAt`이면 이전 후보를 소비하지 않고 새 첫 입력으로 처리한다.
- `0초`는 표시하지 않는다.

## Candidate generation과 Port lifecycle

1. coordinator가 transition gate 안에서 provisional generation을 만든다.
2. content script에 candidate HUD를 보내고
   `quick-sync-candidate:<generation>` runtime Port를 요청한다.
3. background는 같은 generation과 sender tab ID가 일치하는 Port만 bind한다.
4. HUD/Port handshake가 성공해야 provisional candidate가 활성 후보가 된다.
5. Port 생성과 같은 탭 재입력은 절대 마감을 연장하지 않는다.
6. Port disconnect, 탭 종료, ineligible navigation, 만료, 성공한 Start, 성공한 popup Start,
   accepted suggestion은 일치하는 generation만 정리한다.
7. 마감 전에 접수된 두 번째 입력이 generation을 reserve했다면 Start 시도가 끝날 때까지
   timeout/Port callback이 그 generation을 지우지 못한다.

서비스 워커가 재시작되면 Port가 끊기고 후보 HUD도 즉시 사라진다. 후보를 storage에서
복원하지 않는 것이 정상적인 fail-closed 동작이다.

## Gate, revision, epoch

### Transition gate

`syncTransitionGate`는 다음 작업의 단일 FIFO 직렬화 경계다.

- 후보 생성·소비·만료·탭 lifecycle 정리
- popup Start/Stop
- Quick Sync Start/Add
- accepted auto-suggestion Replace/Add
- linked tab 제거와 reconnect topology repair

gate callback은 진입할 때 `operationGeneration`과 현재 커밋된 `expectedRevision`을 받는다.
`handleScrollCore()`와 `scroll:sync` relay는 gate를 기다리지 않는다.

### Revision

- 수동 topology나 accepted auto transition이 커밋될 때 증가한다.
- suggestion payload의 `expectedRevision`이 수락 시점 revision과 다르면
  `stale-revision`으로 거부한다.
- persistence 이전의 staged 작업은 revision을 바꾸지 않는다.

### Session epoch

- 새 manual Start/Replace에서만 증가한다.
- Add와 Reconnect는 기존 epoch를 유지한다.
- manual content message는 sender tab ID, committed membership, `sessionEpoch`을 await 전에
  동기적으로 검증한다.
- 이전 세션의 늦은 relay가 같은 tab ID를 재사용한 새 세션에 영향을 주지 못한다.

## 트랜잭션 순서

### Start

```text
gate 진입
→ inactive/revision/대상 검증
→ manual override prepare
→ content script 준비
→ scroll:start handshake
→ ACK와 탭 존재/revision/generation 재검증
→ override commit
→ 새 active state persist (새 revision + 새 epoch)
→ in-memory commit
→ status broadcast
→ keep-alive 시작
→ 커밋되지 않은 대상 idempotent Stop cleanup
```

Quick Sync 두 탭 Start는 두 탭 모두의 유효 ACK가 필요하다. 기존 팝업 Start는 기존 계약대로
두 탭 이상이 연결되면 연결된 subset을 커밋하고 나머지를 cleanup한다.

### Add

```text
gate 진입
→ active/revision/미포함 탭 검증
→ 새 탭의 manual override prepare
→ 새 탭에만 전체 linked tab ID를 포함한 scroll:start 전송
→ 새 탭 ACK와 탭 존재/revision/generation 재검증
→ override commit
→ append state persist (새 revision, 기존 epoch)
→ in-memory commit
→ status broadcast
```

실패하면 staged 새 탭만 cleanup한다. 기존 linked tab에는 `scroll:start`나 `scroll:stop`을
다시 보내지 않고 기존 topology, offset, revision, epoch, keep-alive를 유지한다.

### Stop

```text
gate 진입
→ linked tab snapshot
→ inactive state persist (새 revision)
→ in-memory inactive commit
→ relay/keep-alive 중지
→ captured tab에 idempotent scroll:stop cleanup
→ cleanup 실패 시 warning과 retry 예약
```

inactive persist가 실패하면 Stop을 보내지 않는다. cleanup이 늦게 실패해도 durable truth는
inactive다.

### Reconnect

```text
authoritative active snapshot과 revision 확인
→ disconnected/error 탭별 최신 attempt generation 발급
→ 탭 존재와 content runtime 확인/재주입
→ 3초 reconnect handshake
→ revision과 최신 attempt generation 재검증
→ 연결 상태 반영과 authoritative status 갱신
```

Reconnect는 세션 topology와 epoch를 바꾸지 않는다. 같은 revision의 오래된 attempt 결과는
더 최신 attempt 상태를 덮어쓸 수 없다.

## Popup 책임

### Inactive

팝업은 기존 수동 흐름을 그대로 제공한다.

- current-window 탭 검색, 필터, 선택, 선택 chip, Start
- URL Sync 설정과 Actions 메뉴
- popup-local `Cmd/Ctrl+S`
- `commands.getAll()`이 보고한 실제 Quick Sync assignment 또는 unassigned/unavailable 상태
- 브라우저 단축키 설정 열기

Quick Sync는 추가 편의 경로이며 picker와 Start 버튼을 대체하지 않는다.

### Active

팝업은 background의 authoritative cross-window snapshot을 표시한다.

- picker/search/checkbox/chip/select-all은 렌더링하지 않는다.
- linked tab을 `현재 탭`, `현재 창`, `다른 창` 중 하나로 표시한다.
- metadata 조회 실패 행은 unavailable로 표시하되 active topology를 숨기지 않는다.
- URL Sync 설정, 필요한 Reconnect, Stop을 제공한다.
- Stop/Reconnect 뒤에는 로컬 성공 상태를 만들지 않고 authoritative snapshot을 다시 읽는다.

## Auto suggestion과의 관계

- initial suggestion과 Add suggestion은 storage의 `autoSyncEnabled === true`일 때만 표시한다.
- Quick Sync command는 suggestion을 켜거나 toast를 만들지 않는다.
- accepted Add는 shared transition gate와 session orchestrator를 사용하며 새 탭 하나만
  초기화한다.
- accepted Replace는 같은 gate 안에서 durable manual Stop 뒤 legacy auto-sync adapter를
  시작한다.
- 모든 accepted response는 표시 당시 `expectedRevision`을 echo하고 커밋 전에 다시 검증한다.

세부 suggestion 동작은
[`sync-suggestion-replacement.md`](./sync-suggestion-replacement.md)를 참고한다.

## `commands.getAll()` 증거 경계

다음 코드는 이름, assignment string, 설명만 확인한다.

```javascript
browser.commands.getAll().then((commands) =>
  console.table(
    commands.map(({ name, shortcut, description }) => ({
      name,
      shortcut,
      description,
    })),
  ),
);
```

Chromium raw DevTools에서는 `chrome.commands.getAll`을 사용한다.

이 증거로 확인할 수 있는 것은 다음뿐이다.

- command가 manifest/profile에 존재한다.
- 현재 assignment가 문자열 또는 빈 문자열이다.
- clear 뒤 `shortcut === ''`가 된다.
- user remap 뒤 반환 문자열과 팝업 표시가 바뀐다.

이 API는 물리 키가 OS와 브라우저를 거쳐 `commands.onCommand`에 도달하는지, 다른 shortcut과
충돌하는지 증명하지 않는다. Playwright `page.keyboard`도 그 증거가 아니다.

## 브라우저별 remap 경로

| 브라우저      | 우선 경로                         | 실패 시 안내                                       |
| ------------- | --------------------------------- | -------------------------------------------------- |
| Chrome        | `chrome://extensions/shortcuts`   | 주소를 직접 열도록 안내                            |
| Edge          | `edge://extensions/shortcuts`     | 주소를 직접 열도록 안내                            |
| Brave         | `brave://extensions/shortcuts`    | 주소를 직접 열도록 안내                            |
| Firefox       | `commands.openShortcutSettings()` | `about:addons` → gear → Manage Extension Shortcuts |
| 기타 Chromium | Chrome 경로 best effort           | 브라우저의 extension shortcut 설정 안내            |

팝업은 API가 resolve되기 전에 설정 화면이 열렸다고 표시하지 않는다. Firefox native API가
없거나 reject되면 fallback을 사용한다. Chromium runtime에 `commands.onChanged`가 없더라도
`commands.getAll()` assignment 조회는 계속 수행한다.

## Privacy-safe logging

허용 예:

```typescript
logger.info('Quick Sync transition committed', {
  result: 'added',
  tabId,
  tabCount,
  revision,
  sessionEpoch,
});
```

금지 예:

```typescript
logger.info('Quick Sync tab', {
  tab,
  url,
  title,
  payload,
});
```

URL, normalized URL, title, favicon, canonical/alternate metadata, 전체 tab/message/storage 객체는
로그·외부 서비스·QA artifact에 기록하지 않는다. 로컬 팝업에서 title/favicon을 렌더링하는
것은 허용되지만 이 기능이 persist하거나 외부로 보내면 안 된다.

## 문제 해결

| 증상                          | 확인                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| 팝업에 단축키 미할당 표시     | `commands.getAll()`의 exact command shortcut이 빈 문자열인지 확인                    |
| 첫 입력 HUD가 바로 사라짐     | candidate Port disconnect, worker restart, absolute deadline 확인                    |
| 두 번째 입력이 Start하지 않음 | event 수신 시각이 `expiresAt` 이전인지, 양쪽 ACK가 유효한지 확인                     |
| Add 실패                      | 기존 revision/offset/epoch가 유지되고 staged 새 탭만 cleanup됐는지 확인              |
| 팝업 active 행 누락           | current-window query가 아니라 authoritative snapshot을 사용했는지 확인               |
| popup 상태 오류               | manual restore의 `storage-error`/`invalid-state`를 inactive로 오인하지 않았는지 확인 |

## Physical QA template

아래 template은 exact candidate SHA의 자동화 gate가 모두 통과한 뒤 별도 파일에 복사한다.
URL, title, page content, raw log, screenshot은 넣지 않는다.

```markdown
# Quick Sync Browser Matrix

- Test date:
- Candidate SHA:
- Repository state: clean tracked worktree
- Tester:

commands.getAll() evidence verifies assignment state only.
Physical-key rows verify OS/browser delivery to commands.onCommand.

## Automated evidence

| Check                     | Result    | Non-sensitive note |
| ------------------------- | --------- | ------------------ |
| Privacy logging rules     | PASS/FAIL |                    |
| Privacy completion search | PASS/FAIL |                    |
| i18n parity               | PASS/FAIL |                    |
| lint                      | PASS/FAIL |                    |
| typecheck                 | PASS/FAIL |                    |
| unit tests                | PASS/FAIL |                    |
| Chromium production build | PASS/FAIL |                    |
| Firefox production build  | PASS/FAIL |                    |
| Chromium extension E2E    | PASS/FAIL |                    |

## Physical shortcut rows

| Browser / OS            | Exact version/build      | Assignment API | Physical delivery | Scenario result | Remap result | Gate         | Note |
| ----------------------- | ------------------------ | -------------- | ----------------- | --------------- | ------------ | ------------ | ---- |
| Chrome stable / macOS   | NOT RUN                  | NOT RUN        | NOT RUN           | NOT RUN         | NOT RUN      | Blocking     |      |
| Chrome stable / Windows | NOT RUN                  | NOT RUN        | NOT RUN           | NOT RUN         | NOT RUN      | Blocking     |      |
| Firefox stable / one OS | NOT RUN                  | NOT RUN        | NOT RUN           | NOT RUN         | NOT RUN      | Blocking     |      |
| Edge stable / Windows   | NOT RUN                  | NOT RUN        | NOT RUN           | NOT RUN         | NOT RUN      | Blocking     |      |
| Brave stable / one OS   | NOT RUN                  | NOT RUN        | NOT RUN           | NOT RUN         | NOT RUN      | Blocking     |      |
| Arc stable / macOS      | NOT RUN                  | NOT RUN        | NOT RUN           | NOT RUN         | NOT RUN      | Advisory     |      |
| Dia / Linux             | automated contracts only | N/A            | NOT RUN           | NOT RUN         | NOT RUN      | Non-blocking |      |

## Per-profile checklist

- [ ] command name exists exactly once.
- [ ] default assignment is recorded truthfully, including an empty assignment.
- [ ] first physical press shows candidate feedback.
- [ ] second physical press in another tab starts two-tab sync.
- [ ] later physical press adds an unlinked tab.
- [ ] same/included presses are no-op and never Stop/remove.
- [ ] cross-window popup labels are truthful.
- [ ] two-tab scrolling and popup Stop work.
- [ ] clear/remap changes assignment API output and physical delivery.
- [ ] restricted page reports badge/popup failure without changing session.

## Release decision

- Blocking rows complete: YES/NO
- Advisory findings:
- Residual risk:
```

Chrome macOS/Windows, Firefox, Edge, Brave의 blocking physical row가 실제 hands-on으로 완료되지
않으면 자동화가 모두 통과해도 physical shortcut release evidence는 미완료다.
