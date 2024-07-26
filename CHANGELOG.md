## [2.3.2](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.3.1...v2.3.2) (2024-07-26)


### Bug Fixes

* 외부 스크립트 추가할 수 없는 구글 서비스 url들 추가하여 관리 ([abbe731](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/abbe731afe08efa7face1611e0b45ac2c593d8b5))

## [2.3.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.3.0...v2.3.1) (2024-05-13)


### Bug Fixes

* 스크롤 백분율 계산할 때 문서 실제 보이는 뷰포트 높이 고려하도록 수정 ([c24ff10](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c24ff10f6d5a50f4b3cc8a333b71ddf6c6d2a6c3)), closes [#132](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/132)

# [2.3.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.2.1...v2.3.0) (2024-2-25)


### Bug Fixes

* onSelect 이벤트가 발생하더라도 input 포커스 유지하도록 수정 ([36ecd27](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/36ecd27b79f2ea7467f45f9c0b2d455c90f9576e))


### Features

* url로도 검색이 가능하도록 설정 ([0221703](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0221703bc02890a703fb3c837a55cfa9cb0d61d7))

## [2.2.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.2.0...v2.2.1) (2024-2-22)


### Bug Fixes

* 윈도우 환경에서 단축키 텍스트 수정 ([1895890](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/189589010b61d02b313555eaf6f6daebe21228ed))

# [2.2.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.1.2...v2.2.0) (2024-2-21)


### Features

* add support for Edge and Opera platforms ([5aa5c78](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5aa5c78d5b93f197126d739626d2a89b2849fe83))

## [2.1.2](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.1.1...v2.1.2) (2024-02-15)


### Bug Fixes

* chrome ([48fd343](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/48fd34376827539ace3d2d2a8fc62167a87eebb9))
* syncTabIds 반환 타입 수정 ([0b60535](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0b60535d04a4e11347a18bceded78ff14a1da97e))

## [2.1.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.1.0...v2.1.1) (2024-02-15)


### Bug Fixes

* add polyfill for chrome.tabs.query function ([498e913](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/498e913074c9e3e19da36f8b29608e48ab06ef69))
* chrome 네임스페이스로 타입 단언하던 부분 제거 ([4da90c0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4da90c0a2f85c8a666a5637c677b7276fdef0989))
* fix typo in Firefox add-on link ([59b2c8a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/59b2c8aaf96b88d5fa81b733edd766c4b9987e2b))
* update delay values in copyToPlatformDirs and zip plugins ([d383051](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d3830517f5d316ee4f2e981fe8f65683a587c7eb))
* 서버에서 데이터 패칭하지 않음 ([bdc9711](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bdc9711b5fa501b523ee75ab5d1263603e0e7c4c))

# [2.1.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.0.3...v2.1.0) (2024-02-13)


### Bug Fixes

* querySelector 사용 시, 표준 CSS 구문에 포함되지 않는 문자 이스케이프 처리 ([fc5c473](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fc5c4738b4bad8054da08b0ccbdbfdd0b4f1452c))
* 데브툴 보이는 조건 수정 ([6b9c1ca](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6b9c1cad07522238064632fecd1d5857ec54079a))
* 파일 복사할 때 이미지 파일 손상되지 않도록 수정 ([3330444](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3330444a13360b42a74828b3b0067d3aa0ce93e3))


### Features

* add node module utility functions ([3c8a24e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3c8a24e278abfce8ff10045ebec714b4a598b483))
* add support for Firefox version check in background script ([248ec52](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/248ec5210ace4e47d8b9735f09a816732d55068b))
* mv2 대응 & 빌드 프로세스 업데이트 ([a719992](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a719992366d33aa5b54b417922ffc6735f7a3356))
* platform detection logic ([b7f71a4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b7f71a4f9b1c52026ed40ec92b07f41d566fbc40))
* 브라우저별 manifest 구성 파일 생성 ([0ddcd87](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0ddcd87f193d7e577db9a031f6525db57326aac7))
* 빌드 시작 시, 특정 폴더 존재를 보장하는 플러그인 구현 ([bc103e0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bc103e0e6960838f9025f4d152ec067c56d593e3))
* 빌드가 시작되면 특정 경로의 폴더를 제거하는 플러그인 구현 ([9ebc3b3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9ebc3b368efdcd5937fcac7679947a8e6dad34e0))
* 플랫폼별 빌드 결과물 압축 파일 생성 ([e37c5ee](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e37c5ee91f0d75ac0cd86b54b5b816772c6683b3))
* 플랫폼별 빌드 경로로 번들링 파일 복사 후 제거하는 롤업 플러그인 구현 ([5916a08](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5916a08bf23b8eb9838193f6f2c42355a1ddbf84))
* 환경 변수 타입 정의 ([3791ae6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3791ae6d5c546db40fadcba920a4710e6ad60f51))
