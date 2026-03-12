# Store Stats 자동화

이 문서는 Chrome Web Store / Firefox AMO의 rating, version, user 수를 자동으로 가져와 랜딩 페이지 JSON-LD에 주입하는 파이프라인을 설명합니다.

---

## 배경

`src/landing/index.html`의 JSON-LD `aggregateRating`과 `softwareVersion`이 하드코딩되어 있어, 리뷰가 추가되거나 버전이 올라가면 직접 조회 → 수정 → 배포해야 했습니다. 이를 GitHub Actions 스케줄로 자동화합니다.

---

## 전체 흐름

```
매주 월요일 06:00 UTC (15:00 KST)
    │
    └─ update-store-stats.yml
         │
         ├─ pnpm fetch-stats
         │    ├─ Chrome Web Store: HTML 스크래핑 (webextension-store-meta)
         │    └─ Firefox AMO: 공식 REST API v5
         │
         ├─ store-stats.json 갱신 (변경 시에만)
         │
         └─ git commit "chore(landing): update store stats"
              │
              └─ push → deploy-landing.yml 자동 트리거
                   │
                   ├─ Vite transformIndexHtml → JSON-LD 주입
                   ├─ Playwright prerender
                   └─ GitHub Pages 배포
```

---

## 관련 파일

| 파일                                       | 역할                                                                |
| ------------------------------------------ | ------------------------------------------------------------------- |
| `scripts/fetch-store-stats.ts`             | CWS + AMO에서 rating/version/users 조회, fallback 포함              |
| `src/landing/public/store-stats.json`      | 조회 결과 저장 (빌드 시 Vite 플러그인이 읽음)                       |
| `vite.config.landing.mts`                  | `injectStoreStats()` 플러그인 — `transformIndexHtml`로 JSON-LD 교체 |
| `.github/workflows/update-store-stats.yml` | 주간 cron + workflow_dispatch                                       |
| `.github/workflows/deploy-landing.yml`     | paths에 `scripts/fetch-store-stats.ts` 포함                         |
| `.github/workflows/release.yml`            | paths-ignore에 stats 관련 파일 추가                                 |

---

## 스토어별 데이터 소스

### Chrome Web Store

공식 API(v2)는 publish 관리용 엔드포인트만 제공하며 rating 데이터를 노출하지 않습니다. 유일한 방법은 HTML 스크래핑입니다.

- **라이브러리**: `webextension-store-meta` (shields.io, badgen.net이 사용하는 동일 라이브러리)
- **방식**: `chromewebstore.google.com/detail/{id}` HTML을 파싱하여 난독화된 CSS 클래스에서 rating 추출
- **리스크**: Google이 CSS 클래스명(`j3zrsd`, `Vq0ZA`, `xJEoWe` 등)을 변경하면 스크래핑 실패 → null 반환
- **대응**: fallback 로직으로 기존 `store-stats.json` 값 유지

### Firefox AMO

공식 REST API v5가 공개되어 있으며 인증 불필요합니다.

```
GET https://addons.mozilla.org/api/v5/addons/addon/synchronize-tab-scrolling/
→ { "ratings": { "average": 5.0, "count": 2 }, "average_daily_users": 35 }
```

### Edge Add-ons

프로그래밍적으로 rating을 조회할 수 있는 API가 없습니다. Edge 데이터는 수집하지 않습니다.

---

## Fallback 전략

`scripts/fetch-store-stats.ts`는 다음 순서로 동작합니다:

1. CWS와 AMO를 병렬로 fetch
2. CWS 실패 시: 기존 `store-stats.json`의 chrome 데이터 유지 + 경고 로그
3. AMO 실패 시: 기존 `store-stats.json`의 firefox 데이터 유지 + 경고 로그
4. 양쪽 모두 실패 시: 파일 무변경 → 커밋 없음 → 배포 없음
5. 데이터 무변경 시: `No changes detected — skipping write` → 빈 커밋 방지

CWS 스크래핑은 추가 검증을 수행합니다: `ratingValue`가 0 또는 NaN이면 스크래핑이 조용히 깨진 것으로 판단하여 null을 반환합니다.

---

## Vite 플러그인 동작

`vite.config.landing.mts`의 `injectStoreStats()` 플러그인:

1. `src/landing/public/store-stats.json`을 읽음
2. `transformIndexHtml` 훅에서 `SoftwareApplication` JSON-LD 블록을 정규식으로 매칭
3. JSON을 파싱하여 `aggregateRating`과 `softwareVersion`을 교체
4. 파일 읽기 실패 또는 데이터 누락 시 원본 HTML을 그대로 반환 (빌드 실패 없음)

JSON-LD에는 Chrome 데이터를 사용합니다 (가장 큰 사용자 기반, 가장 많은 리뷰).

---

## CI 격리

| 변경                                | `release.yml`                           | `deploy-landing.yml`         | `update-store-stats.yml` |
| ----------------------------------- | --------------------------------------- | ---------------------------- | ------------------------ |
| `store-stats.json`만 변경           | Skipped (`src/landing/**` paths-ignore) | Runs (`src/landing/**` 매칭) | — (schedule만)           |
| `scripts/fetch-store-stats.ts` 변경 | Skipped (paths-ignore)                  | Runs (paths 매칭)            | —                        |
| 커밋 스코프 `(landing)`             | `releaseRules`로 버전 범프 제외         | —                            | —                        |

`update-store-stats.yml`은 `schedule`과 `workflow_dispatch`로만 트리거되어, 자신의 커밋에 의한 무한 루프가 발생하지 않습니다.

---

## 로컬 실행

```bash
# 스토어 데이터 수동 조회
pnpm fetch-stats

# 조회 후 랜딩 빌드 (JSON-LD 주입 확인)
pnpm build:landing

# 빌드 결과에서 JSON-LD 확인
grep -A6 'aggregateRating' dist-landing/landing/index.html
```

---

## 스케줄 조정

`update-store-stats.yml`의 cron 표현식을 수정합니다:

```yaml
# 매주 월요일 (현재)
- cron: '0 6 * * 1'

# 격주 (1일, 15일)
- cron: '0 6 1,15 * *'

# 매일
- cron: '0 6 * * *'
```

GitHub Actions → Update Store Stats → Run workflow로 수동 트리거도 가능합니다.

---

## 주의사항

1. **CWS 스크래핑 불안정성**: `webextension-store-meta`가 의존하는 CSS 클래스명은 Google이 예고 없이 변경합니다. 깨지면 라이브러리 업데이트(`npm update webextension-store-meta`)가 필요합니다. shields.io도 같은 라이브러리를 사용하므로, shields.io CWS 배지가 작동하면 스크래핑도 정상입니다.

2. **`softwareVersion` 소스**: JSON-LD의 `softwareVersion`은 `package.json`이 아닌 CWS에서 가져온 실제 published 버전을 사용합니다. CWS 심사 지연으로 인해 package.json 버전(예: 2.9.0)과 CWS 버전(예: 2.8.2)이 다를 수 있으며, 이는 정상입니다.

3. **낮은 리뷰 수**: 현재 CWS 12개, AMO 2개로 리뷰 수가 적습니다. 리뷰가 더 쌓이기 전까지는 주간 스케줄로 충분합니다.
