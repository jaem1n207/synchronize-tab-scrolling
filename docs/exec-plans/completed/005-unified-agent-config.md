# 005: Unified Agent Configuration & Curated Skills

- **Status**: Completed
- **Branch**: `chore/unified-agent-config` → `release/2.9.0`
- **PR**: #340

## Background

4개의 AI 에이전트(OpenCode, Claude Code, Codex, Cursor)가 각각 독립된 설정 파일을 사용하여 지침이 분산되어 있었음:

- `CLAUDE.md` (240줄) — Claude Code 전용
- `.cursorrules` (88줄) — Cursor 전용, `.cursor/rules/`(13개 파일)와 중복
- 에이전트 스킬 미설치 — 프로젝트 도메인에 특화된 가이드 없음

문제점:

- 지침 변경 시 여러 파일을 동시에 수정해야 함
- 에이전트 간 지침 불일치 위험
- 스킬 부재로 에이전트의 코드 품질이 프로젝트 컨벤션과 불일치

---

## 설계 결정

### 지침 통합 구조

| 에이전트    | 지침 파일                         | 스킬 경로                                        |
| ----------- | --------------------------------- | ------------------------------------------------ |
| OpenCode    | `AGENTS.md` (native)              | `.agents/skills/`                                |
| Claude Code | `CLAUDE.md` → `@AGENTS.md` import | `.claude/skills/` (symlinks → `.agents/skills/`) |
| Codex       | `AGENTS.md` (native)              | `.agents/skills/`                                |
| Cursor      | `.cursor/rules/*.mdc` (기존 유지) | `.agents/skills/`                                |

**`CLAUDE.md`를 symlink이 아닌 `@` import로 유지한 이유**: Claude Code의 Write/Edit 도구가 symlink을 무경고로 일반 파일로 교체하는 open bug([#28376](https://github.com/anthropics/claude-code/issues/28376))가 있음. `/memory` 사용 시 symlink이 파괴되어 `AGENTS.md`와의 연결이 끊어질 수 있음. `@` import는 [공식 문서](https://code.claude.com/docs/en/memory.md)에서 지원하는 메커니즘.

### 스킬 설치 구조

- `.agents/skills/<name>/` — 정본(canonical) 위치. OpenCode, Codex, Cursor가 직접 참조
- `.claude/skills/<name>` — 상대 경로 symlink(`../../.agents/skills/<name>`). Claude Code 전용
- `skills-lock.json` — 재현 가능한 설치를 위한 lock file

---

## 설치된 스킬 (20개)

| 카테고리           | 스킬                                                                                                                     | 출처                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| React & UI         | vercel-react-best-practices, vercel-composition-patterns, web-design-guidelines, frontend-design, shadcn-ui, tailwindcss | vercel-labs, anthropics, google-labs, TerminalSkills |
| Testing & Build    | vitest, testing-library, playwright-testing, webapp-testing, vite                                                        | TerminalSkills, anthropics                           |
| Accessibility      | accessibility-auditor                                                                                                    | TerminalSkills                                       |
| Browser Extension  | wxt                                                                                                                      | TerminalSkills                                       |
| Workflow & Quality | github, github-actions, eslint, code-reviewer, security-audit                                                            | callstackincubator, TerminalSkills                   |
| i18n & Meta        | i18next, skill-creator                                                                                                   | TerminalSkills, anthropics                           |

---

## 도구 설정 변경

스킬 디렉토리의 예제 `.tsx` 파일이 ESLint `import/no-unresolved` 에러와 `--max-warnings=0` 위반을 일으킴. 해결:

| 파일               | 변경                                                             |
| ------------------ | ---------------------------------------------------------------- |
| `eslint.config.ts` | `.agents/**`, `.claude/skills/**` ignores 추가                   |
| `.prettierignore`  | `.agents/`, `.claude/skills/` 추가                               |
| `lefthook.yml`     | `.agents`, `.claude/skills` exclude + `--no-warn-ignored` 플래그 |

---

## 커밋 (15개, 각각 독립 배포 가능)

| #   | 타입        | 내용                                          |
| --- | ----------- | --------------------------------------------- |
| 1   | `docs(dx)`  | AGENTS.md 생성 (237줄, agent-agnostic)        |
| 2   | `chore(dx)` | CLAUDE.md → 3줄 `@AGENTS.md` import wrapper   |
| 3   | `chore(dx)` | `.cursorrules` 삭제 (`.cursor/rules/`로 대체) |
| 4   | `chore(dx)` | 스킬 디렉토리 lint/format 제외 설정           |
| 5   | `fix(dx)`   | ESLint `--no-warn-ignored` 플래그 추가        |
| 6   | `chore(dx)` | React, UI, design 스킬 설치 (6개)             |
| 7   | `chore(dx)` | Testing, build tool 스킬 설치 (5개)           |
| 8   | `chore(dx)` | Accessibility auditor 스킬 설치               |
| 9   | `chore(dx)` | WXT browser extension 스킬 설치               |
| 10  | `chore(dx)` | GitHub workflow 스킬 설치 (2개)               |
| 11  | `chore(dx)` | ESLint 스킬 설치                              |
| 12  | `chore(dx)` | Code review, security audit 스킬 설치 (2개)   |
| 13  | `chore(dx)` | i18next 스킬 설치                             |
| 14  | `chore(dx)` | Skill creator meta 스킬 설치                  |
| 15  | `chore(dx)` | skills-lock.json 추가                         |

---

## Lessons Learned

1. **`npx skills add` CLI**가 `.agents/skills/`(정본)과 `.claude/skills/`(symlink)를 자동 생성 — 수동 symlink 관리 불필요
2. **외부 스킬의 예제 코드**가 프로젝트 lint 규칙을 위반할 수 있음 — 스킬 디렉토리를 lint/format에서 반드시 제외
3. **Symlink은 Claude Code Write/Edit 도구에 취약** — `@` import가 더 안전한 연결 방식
4. **스킬 선정 기준**: 프로젝트 tech stack 직접 매칭(React, Vite, UnoCSS) + 도메인 특화(browser extension, accessibility) + 워크플로우(GitHub, ESLint)
