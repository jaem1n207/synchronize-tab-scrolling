# 001: 8-Phase Codebase Restructuring

- **Status**: Completed
- **Branch**: `refactor/codebase-restructuring` → `release/2.9.0`
- **Period**: v2.8.3 → v2.9.0
- **PR**: #336 (closed, merged into release/2.9.0)

## Why

Background script(`main.ts`)가 2,500줄 단일 파일이었고, 모듈 간 경계가 없어서:

- 새 개발자가 코드 흐름을 이해하기 어려움
- 버그 수정 시 영향 범위 파악 불가
- 테스트 작성이 구조적으로 어려움 (순수 함수가 분리되지 않음)
- 타입 안전성 부재 (`as any` 다수 사용)

## What (8 Phases)

| Phase | Goal                      | Key Change                                              |
| ----- | ------------------------- | ------------------------------------------------------- |
| 0     | Cleanup & Infrastructure  | kebab-case 파일명, barrel files, 미사용 의존성 제거     |
| 1     | Type System               | shared types 추출, ProtocolMap 타입 복원, `as any` 제거 |
| 2     | Pure Functions & Tests    | `scroll-math.ts`, `url-utils.ts` 추출 + 245 tests       |
| 3     | Content Script State      | 20개 산발 변수 → 4개 typed state objects                |
| 4     | Background Module Split   | `main.ts` 2500→48줄, 8개 lib + 4개 handler 모듈         |
| 5     | Popup Hook Extraction     | `ScrollSyncPopup` 713→199줄, 5개 custom hooks           |
| 6     | Content Script Components | `sync-control-panel` 393→~150줄, 2개 hooks 추출         |
| 7     | Integration Tests & Docs  | 57 integration tests, 14개 README.md                    |

## Results

- **88 files changed**, +13,528 / -4,090 lines
- **635 tests** (unit + integration + scenario), all passing
- **0 type errors**, 0 lint errors
- 동작 변경 없음 (refactoring only)

## Lessons Learned

1. **Phase별 브랜치 분리**가 리뷰 효율을 높임 — 각 phase를 독립 브랜치로 작업하고 integration branch에 merge
2. **barrel files(`index.ts`)**로 import 경로를 통일하면 이후 파일 이동 시 변경 범위 최소화
3. **순수 함수 추출**이 테스트 커버리지 확보의 선행 조건 — 비동기, side-effect가 섞인 함수는 테스트가 어려움
4. **타입 시스템**은 리팩토링 안전망 — `as any` 제거 후 타입 에러가 잘못된 호출을 즉시 잡아줌
