# CI 파이프라인 격리: 확장 프로그램 vs 랜딩 페이지

이 저장소는 하나의 모노레포에서 **브라우저 확장 프로그램**과 **랜딩 페이지**를 함께 관리합니다.
두 프로젝트가 서로의 배포에 영향을 미치지 않도록 **3중 격리**(워크플로우 트리거 +
release PR version gate + semantic-release 규칙)를 적용합니다.

---

## 워크플로우 구조

| 워크플로우               | 대상                                       | 파일                                       |
| ------------------------ | ------------------------------------------ | ------------------------------------------ |
| `prepare-release-pr.yml` | 확장 프로그램 release PR 준비              | `.github/workflows/prepare-release-pr.yml` |
| `release.yml`            | 확장 프로그램 → Chrome/Edge/Firefox 스토어 | `.github/workflows/release.yml`            |
| `deploy-landing.yml`     | 랜딩 페이지 → GitHub Pages                 | `.github/workflows/deploy-landing.yml`     |

---

## 트리거 규칙

### `release.yml` (확장 프로그램)

```yaml
on:
  push:
    branches: [main]
    paths-ignore:
      - 'src/landing/**'
      - 'vite.config.landing.mts'
      - '.github/workflows/deploy-landing.yml'
```

- `main` 브랜치에 push할 때 version check job 실행
- **단, 랜딩 페이지 전용 파일만 변경된 경우 실행하지 않음**
- `src/shared/**` 변경 시 실행됨 (확장 프로그램에도 영향을 줄 수 있으므로)
- `package.json`의 version tag가 이미 존재하면 store publish job은 실행하지 않음
- extension 변경을 배포하려면 `Prepare Release PR`을 수동 실행하고 생성된 version/CHANGELOG
  PR을 병합해야 함

### `deploy-landing.yml` (랜딩 페이지)

```yaml
on:
  push:
    branches: [main]
    paths:
      - 'src/landing/**'
      - 'src/shared/**'
      - 'vite.config.landing.mts'
      - 'uno.config.ts'
      - 'tsconfig.json'
      - '.github/workflows/deploy-landing.yml'
```

- 명시된 경로의 파일이 변경된 경우에만 실행
- 확장 프로그램 코드(`src/popup/`, `src/background/`, `src/contentScripts/`) 변경은 무시

---

## 시나리오별 동작

| 변경 내용                                | `release.yml`                   | `deploy-landing.yml` |
| ---------------------------------------- | ------------------------------- | -------------------- |
| `src/landing/**`만 변경                  | ❌ 건너뜀                       | ✅ 실행              |
| 일반 extension PR                        | version check 후 publish 건너뜀 | ❌ 건너뜀            |
| `src/shared/**`                          | version check 후 publish 건너뜀 | ✅ 실행              |
| release PR (`package.json` version 갱신) | ✅ build + store publish        | ❌ 건너뜀            |

---

## Semantic-release 커밋 스코프 필터링

워크플로우 트리거 격리만으로는 불충분한 경우가 있습니다:

**문제 시나리오**: `src/shared/`와 `src/landing/` 모두 변경된 push
→ 일반 PR merge에서는 package version tag가 이미 존재하므로 publish 건너뜀
→ 다음 release PR 계산 시 semantic-release가 `feat(landing): ...` 커밋을 분석할 수 있음

**해결**: `release.config.js`에서 `landing` 스코프 커밋을 버전 범프에서 제외:

```javascript
// release.config.js
[
  '@semantic-release/commit-analyzer',
  {
    releaseRules: [{ scope: 'landing', release: false }],
  },
],
```

이로써 `feat(landing):`, `fix(landing):` 등의 커밋은 확장 프로그램 버전에 영향을 주지 않습니다.

---

## 커밋 컨벤션 (필수)

| 대상          | 스코프               | 예시                                                     |
| ------------- | -------------------- | -------------------------------------------------------- |
| 랜딩 페이지   | `(landing)`          | `feat(landing): add hero section`                        |
| 확장 프로그램 | 없음 또는 모듈명     | `fix: scroll sync timing`, `feat(popup): add tab filter` |
| 공통 코드     | 없음 또는 `(shared)` | `refactor: update animation utils`                       |

**`(landing)` 스코프를 사용하지 않으면**:

1. `release.yml`의 version gate가 일반 merge의 즉시 배포를 막지만
2. 다음 release PR 계산에 landing 커밋이 포함되면 불필요한 version bump가 생길 수 있음
3. 따라서 `(landing)` scope를 계속 사용해야 함

---

## 번들 격리

두 프로젝트는 완전히 독립된 빌드 파이프라인을 사용합니다:

|                   | 확장 프로그램                            | 랜딩 페이지                  |
| ----------------- | ---------------------------------------- | ---------------------------- |
| **빌드 명령**     | `pnpm build`                             | `pnpm build:landing`         |
| **Vite 설정**     | `vite.config.mts` + background + content | `vite.config.landing.mts`    |
| **엔트리 포인트** | `src/popup/index.html`                   | `src/landing/index.html`     |
| **출력 디렉토리** | `extension/dist/`                        | `dist-landing/`              |
| **공유 코드**     | `src/shared/` (tree-shaking)             | `src/shared/` (tree-shaking) |

- `pnpm build`에 랜딩 빌드가 **포함되지 않음**
- `src/shared/`는 Vite tree-shaking으로 각 빌드에 실제 사용하는 코드만 포함
- 상호 import 없음: landing ↛ popup/background/contentScripts (역방향도 동일)

---

## 트러블슈팅

### 랜딩 페이지만 변경했는데 확장 프로그램이 릴리스됨

1. 커밋 메시지에 `(landing)` 스코프를 사용했는지 확인
2. `release.yml`의 `paths-ignore`에 해당 파일이 포함되어 있는지 확인
3. 같은 push에 확장 프로그램 관련 파일이 포함되어 있지 않은지 확인

### `src/shared/` 변경 시 양쪽 모두 배포됨

`src/shared/`는 양쪽 모두 사용하므로:

- 확장 프로그램: 즉시 publish하지 않고 다음 release PR에 포함
- 랜딩 페이지: 항상 재배포 (버전 개념 없음)

단, `(landing)` 스코프 커밋은 `releaseRules`에 의해 버전 범프에서 제외되므로, shared 코드 변경과 landing 커밋만 있는 push에서는 확장 프로그램 버전이 올라가지 않습니다.
