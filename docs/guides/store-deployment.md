# Store Deployment Pipeline

이 문서는 Chrome Web Store, Firefox AMO, Microsoft Edge Add-ons에 자동 배포하는 CI/CD 파이프라인을 설명합니다.
코드를 `main` 브랜치에 머지하면 semantic-release가 커밋을 분석하여 버전을 결정하고, 3개 스토어에 자동 배포합니다.

---

## 전체 흐름

```
push to main
    │
    ├─ Build Chrome → extension/ staging → validate/copy to build/chromium/
    ├─ Build Firefox → extension/ staging → validate/copy to build/firefox/
    │
    └─ semantic-release
         ├─ analyzeCommits → 커밋 메시지 분석 → 다음 버전 결정
         ├─ generateNotes → 릴리스 노트 생성
         ├─ prepare:
         │    ├─ changelog → CHANGELOG.md 업데이트
         │    ├─ semantic-release-chrome → build/chromium/manifest.json에 버전 기록, zip 생성
         │    ├─ semantic-release-amo → build/firefox/manifest.json에 버전 기록, zip 생성
         │    ├─ npm → package.json 버전 업데이트
         │    └─ git → CHANGELOG.md + package.json 커밋
         └─ publish:
              ├─ semantic-release-chrome → Chrome Web Store 업로드
              ├─ semantic-release-amo → Firefox AMO 업로드
              ├─ github → GitHub Release 생성 + zip 에셋 첨부
              └─ exec → scripts/publish-edge.mjs (Chrome zip으로 Edge 업로드)
```

---

## 관련 파일

| 파일                            | 역할                                                            |
| ------------------------------- | --------------------------------------------------------------- |
| `.github/workflows/release.yml` | GitHub Actions 워크플로우 — 빌드, 패키징, semantic-release 실행 |
| `release.config.js`             | semantic-release 플러그인 구성 — 스토어별 설정 포함             |
| `scripts/publish-edge.mjs`      | Edge Add-ons API 호출 스크립트 (soft-fail 지원)                 |
| `src/manifest.ts`               | 동적 manifest.json 생성 — 브라우저별 분기                       |

---

## 빌드 파이프라인

Chrome과 Firefox compilation은 기존처럼 동일한 `extension/` staging 디렉토리에 출력됩니다.
각 build 명령의 마지막 단계가 manifest, Quick Sync command/runtime listener, 필수 파일을 검증한 뒤
브라우저별 안정 경로로 전체 artifact를 복사합니다:

```bash
pnpm build             # Chrome staging → build/chromium/
pnpm build-firefox     # Firefox staging → build/firefox/
```

- **Chrome/Edge/Brave**: `build/chromium/` 사용 (Chromium 기반 — 동일 빌드)
- **Firefox**: `build/firefox/` 사용 (gecko 전용 manifest 포함)
- Firefox build가 `extension/` staging을 덮어써도 이미 검증된 `build/chromium/`은 유지됩니다.
- CI는 `pnpm install --frozen-lockfile`로 감사된 `pnpm-lock.yaml`과 보안 override를 그대로
  사용합니다. 다른 패키지 매니저로 release dependency graph를 다시 해석하지 않습니다.

---

## 스토어별 배포 메커니즘

### Chrome Web Store

- **플러그인**: `semantic-release-chrome`
- **동작**: prepare 단계에서 `build/chromium/manifest.json`에 버전 기록 후 zip 생성, publish 단계에서 Chrome Web Store API로 업로드
- **자격증명**: OAuth 2.0 (Client ID, Client Secret, Refresh Token)

### Firefox AMO

- **플러그인**: `semantic-release-amo`
- **동작**: prepare 단계에서 `build/firefox/manifest.json`에 버전 기록 후 zip 생성, publish 단계에서 AMO API v5로 업로드
- **소스 코드 제출**: Vite로 번들링하므로 `submitSource: true` 설정으로 git-tracked 파일을 자동 압축하여 제출
- **자격증명**: JWT (API Key, API Secret)

### Microsoft Edge Add-ons

- **방식**: `@semantic-release/exec` → `scripts/publish-edge.mjs`
- **동작**: Chrome zip을 Edge Add-ons API v1.1로 업로드 (Edge는 Chromium 기반이므로 Chrome 빌드 재사용)
- **Soft-fail**: 자격증명이 없으면 경고만 출력하고 exit 0 (Chrome/Firefox/GitHub Release는 정상 진행)
- **자격증명**: API Key + Client ID + Product ID

---

## GitHub Actions 자격증명

Repository Settings → Secrets and variables → Actions 에서 등록합니다.

### GitHub Release / release commit

| 종류     | 이름                      | 설명                                              |
| -------- | ------------------------- | ------------------------------------------------- |
| Variable | `RELEASE_APP_CLIENT_ID`   | release 전용 GitHub App의 Client ID               |
| Secret   | `RELEASE_APP_PRIVATE_KEY` | GitHub App에서 내려받은 PEM private key 전체 내용 |

release 전용 GitHub App은 다음 원칙으로 구성합니다.

- App 이름: `synchronize-tab-scrolling-release`
- 소유자/설치 가능 계정: `jaem1n207`
- Repository permission: `Contents: Read and write`만 허용
- Webhook, OAuth user authorization, Device Flow: 비활성화
- Repository access: `jaem1n207/synchronize-tab-scrolling`만 선택
- `main` ruleset bypass list: App을 `Always allow`로 등록

워크플로우는 `actions/create-github-app-token@v3`으로 현재 저장소에만 유효한 installation
token을 만들고 `permission-contents: write`로 권한을 다시 제한합니다. 이 token은 1시간
이내 만료되며 job 종료 시 action이 폐기합니다.

checkout은 read-only 기본 Actions token을 사용하고 `persist-credentials: false`로 후속
step에 Git credential을 남기지 않습니다. Chrome/Firefox 빌드가 모두 끝난 뒤에만 release
App token을 생성하고, semantic-release step의 `GITHUB_TOKEN`으로만 전달합니다.
semantic-release는 이 환경변수를 Git push와 GitHub API 인증에 사용하므로 release
commit/tag와 GitHub Release가 같은 App actor로 처리됩니다. install/build step은 App
private key나 `main` ruleset bypass 권한이 있는 token에 접근할 수 없습니다.

검증 완료 후 기존 `RELEASE_GITHUB_TOKEN` secret과 `Repository admin` role bypass는
제거했으며, release App만 자동 release를 위한 예외 actor로 유지합니다.

### Chrome Web Store

| Secret                 | 설명                    | 취득 경로                                                                                                  |
| ---------------------- | ----------------------- | ---------------------------------------------------------------------------------------------------------- |
| `GOOGLE_CLIENT_ID`     | OAuth 2.0 Client ID     | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → OAuth 2.0 Client → Desktop app |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret | 위와 동일                                                                                                  |
| `GOOGLE_REFRESH_TOKEN` | OAuth 2.0 Refresh Token | `npx chrome-webstore-upload-keys` 실행 → 브라우저 인증 → 토큰 출력                                         |

**사전 조건**:

1. Google Cloud Console에서 Chrome Web Store API 활성화
2. OAuth consent screen 구성 (External, 테스트 사용자에 게시자 이메일 추가)
3. OAuth 2.0 Client ID 생성 (Desktop app 유형)

### Firefox AMO

| Secret           | 설명       | 취득 경로                                                                                       |
| ---------------- | ---------- | ----------------------------------------------------------------------------------------------- |
| `AMO_API_KEY`    | JWT issuer | [AMO Developer Hub](https://addons.mozilla.org/en-US/developers/addon/api/key/) → JWT issuer 값 |
| `AMO_API_SECRET` | JWT secret | 위와 동일 페이지 → JWT secret 값                                                                |

### Microsoft Edge Add-ons

| Secret            | 설명                            | 취득 경로                                                                                                          |
| ----------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `EDGE_PRODUCT_ID` | 확장 프로그램 Product ID (GUID) | [Partner Center](https://partner.microsoft.com/dashboard/microsoftedge/overview) → 확장 프로그램 선택 → URL의 GUID |
| `EDGE_CLIENT_ID`  | API Client ID                   | Partner Center → Publish API → Create API credentials                                                              |
| `EDGE_API_KEY`    | API Key                         | 위와 동일 (생성 시 한 번만 표시 — 즉시 복사)                                                                       |

---

## 자격증명 갱신

### GitHub App

- Private key는 자동 만료되지 않으므로 정기적으로 수동 rotation합니다.
- 무중단 rotation은 새 private key를 생성하고 `RELEASE_APP_PRIVATE_KEY`를 교체한 뒤,
  release token 생성이 성공하는지 확인하고 이전 key를 삭제하는 순서로 진행합니다.
- App 권한을 확대하면 설치 소유자의 별도 승인이 필요할 수 있습니다. 이 파이프라인은
  `Contents: Read and write` 외 권한을 요구하지 않습니다.
- private key 파일은 repository에 커밋하지 않고 GitHub Actions secret에 등록한 후 로컬
  다운로드 파일을 안전하게 삭제합니다.

### Google (Chrome)

- Refresh Token은 만료되지 않음 (revoke하지 않는 한)
- Client Secret은 Google Cloud Console에서 순환(rotate) 가능

### Mozilla (Firefox)

- JWT 키 쌍은 만료되지 않음
- [AMO Developer Hub](https://addons.mozilla.org/en-US/developers/addon/api/key/) 에서 언제든 재생성 가능

### Microsoft (Edge)

- **API Key에 만료일이 있음** — Partner Center에서 수동 갱신 필요
- 프로그래밍적 갱신 방법 없음 ([관련 이슈](https://github.com/microsoft/MicrosoftEdge-Extensions/issues/218))
- 만료 전 캘린더 알림 등록 권장
- 만료 시: Edge 배포만 실패하고 Chrome/Firefox/GitHub Release는 정상 진행 (soft-fail)

---

## Troubleshooting

### semantic-release가 버전을 올리지 않는 경우

- Conventional Commits 형식을 따르지 않는 커밋만 있으면 버전이 올라가지 않음
- `fix:`, `feat:` 등의 prefix가 있는 커밋이 필요
- `chore:`, `docs:`, `style:` 등은 기본적으로 버전 변경을 트리거하지 않음

### release commit push가 ruleset에 막히는 경우

- 로그에 `GH013: Repository rule violations found for refs/heads/main`가 표시되면 release
  commit/tag push가 `main` ruleset을 통과하지 못한 것입니다.
- `synchronize-tab-scrolling-release` App이 현재 저장소에 설치되어 있는지 확인합니다.
- `main` ruleset bypass list에 App이 `Always allow`로 등록되어 있는지 확인합니다.
- `Generate release app token`이 build step 뒤, `Release` step 바로 앞에 있는지 확인합니다.
- `Release` step의 `GITHUB_TOKEN`이
  `${{ steps.release-app-token.outputs.token }}`인지 확인합니다. semantic-release는 이
  환경변수를 Git push와 GitHub API 인증에 모두 사용합니다.
- `actions/checkout`은 `persist-credentials: false`를 유지해야 합니다. release App token을
  checkout에 전달하면 install/build step에도 `main` bypass Git credential이 노출됩니다.

### release App token 생성이 실패하는 경우

- `RELEASE_APP_CLIENT_ID`가 App ID가 아닌 Client ID인지 확인합니다.
- `RELEASE_APP_PRIVATE_KEY`에 PEM의 시작/끝 줄을 포함한 전체 내용이 들어 있는지 확인합니다.
- App 설치 범위에 현재 저장소가 포함되어 있는지 확인합니다.
- App과 설치의 `Contents: Read and write` 권한이 모두 승인되어 있는지 확인합니다.
- key를 교체했다면 새 secret이 저장된 뒤 이전 private key를 삭제했는지 확인합니다.

### Chrome Web Store 업로드 실패

- `403 Forbidden`: Refresh Token 만료 또는 revoke → `npx chrome-webstore-upload-keys`로 재발급
- `400 Bad Request`: manifest.json 버전이 이미 게시된 버전과 동일 → 커밋 분석으로 새 버전이 결정되어야 함
- 리뷰 대기 중인 버전이 있으면 새 업로드 불가 → Chrome Web Store Developer Dashboard에서 리뷰 취소 후 재시도

### Firefox AMO 업로드 실패

- `401 Unauthorized`: JWT 키 쌍 재확인
- 소스 코드 제출 관련 오류: `submitSource: true` 설정이 git-tracked 파일을 기준으로 동작하므로, `.gitignore`에 포함된 파일은 제외됨

### Edge Add-ons 업로드 실패

- `401 Unauthorized`: API Key 만료 → Partner Center에서 갱신
- `409 Conflict`: 이전 제출이 아직 처리 중 → 잠시 후 재시도
- Edge 배포 실패는 릴리스 전체를 차단하지 않음 (soft-fail)

### 워크플로우 디버깅

GitHub Actions 로그에서 각 단계별 출력을 확인할 수 있습니다:

```
semantic-release → Wrote version X.Y.Z to build/chromium/manifest.json
semantic-release → Published Chrome extension
semantic-release → Published Firefox add-on
Edge Add-ons: vX.Y.Z submitted successfully.
```

실패 시 해당 스토어의 에러 메시지가 로그에 출력됩니다.
