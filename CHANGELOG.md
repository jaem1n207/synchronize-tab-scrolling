# [2.7.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.6.1...v2.7.0) (2025-12-17)


### Features

* add chinese-taiwan localization files ([41d2747](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/41d2747990fd4585ab95a810834f57216d032b69))

## [2.6.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.6.0...v2.6.1) (2025-12-12)


### Bug Fixes

* **auto-sync:** show toast suggestion immediately after toggle ([3e86d81](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3e86d81f01d3745b0d594e352050315a949030be))
* enhance suggestion handling for newly joined tabs ([3fea213](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3fea213986f072ac7da60c7cdcca4373938c2307))
* improve error logging for extension context invalidation ([2f12160](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2f12160ff2b23e20003bd4d1059f37c80954490f))

# [2.6.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.5.1...v2.6.0) (2025-12-11)


### Features

* enhance auto-sync functionality by adding url exclusion checks for local development servers and forbidden urls ([a86c2a6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a86c2a6a57f9849b5bf24ba94446f59917b27dca))

## [2.5.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.5.0...v2.5.1) (2025-12-10)


### Bug Fixes

* **deps:** update dependency lucide-react to ^0.556.0 ([2816470](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2816470988d644d4dc34f2fa3d251459001192ca))

# [2.5.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.4.1...v2.5.0) (2025-12-10)


### Features

* enhance auto-sync functionality with content script injection ([98d2985](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/98d29850569ee72bdcd0a62e22a326b5898faae2))
* enhance tab closure handling in auto-sync ([c803642](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c803642cc8279d5fdde3af80c3f4f56d4141a466))
* integrate Sentry for enhanced error tracking and reporting ([a3d2d96](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a3d2d962919e648d3dba482ae4c19ba7ca2fe627))


### Performance Improvements

* reduce scroll sync start timeout from 2s to 1s ([26698a6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/26698a6abe20326208f32d673b2d5ef0f14d29fd))
* reduce scroll sync stop timeout from 2s to 1s ([e3bd3cb](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e3bd3cb18b027356d3f3d123a76ff143e02ea562))
* remove duplicate-element, memory leak fixes and cleanup enhancement ([3e28cb8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3e28cb84b0228f73b3e883fba01a3257ab7c50b2))

## [2.4.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.4.0...v2.4.1) (2025-12-09)


### Bug Fixes

* remove placeholder return statement in sentry initialization ([cae7433](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/cae74330e1547ffca26323d42a0a7139581fb995))

# [2.4.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.3.2...v2.4.0) (2025-12-09)


### Bug Fixes

* add explicit position:fixed to sync panel button for proper positioning ([d260159](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d260159cf2e4f709e99b8bf07afdd52b21939c8f))
* add popup entry point to vite configuration ([cdca724](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/cdca7240894d220d78ca86eb4a254c38715a01b9))
* add unocss opacity variable fallbacks for shadow dom ([53ce1ad](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/53ce1ad051fbb1083bcd01e62e134ebefb611915))
* auto-import-plugin 관련 eslint 구성 수정 ([b2c5f59](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b2c5f597e3d6df0d361a0deddd5a7010e6aec203))
* **auto-sync:** add retry mechanism when content scripts not ready ([e442916](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e4429161d0747b1dd2be8460de10e37632149e19))
* **auto-sync:** handle edge cases for port normalization and race conditions ([ba93b3a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ba93b3a9f52eedfcc94de9366df0df9bf92fbb20))
* calculate offset using latest synced ratio in manual mode ([fc7c35e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fc7c35e7ed8456518b78cc8f940dffadac2b6453))
* correct manual scroll offset baseline tracking and cleanup ([a018f79](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a018f794ecf58ecc276810eb8600e3b31052185c))
* correct manual scroll offset by tracking target ratio instead of source ([a492989](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a49298939d2d4c3b0f3ea0e036cd7346029577e8))
* correct manual scroll offset calculation to use activation baseline ([84578a7](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/84578a7e5aab483be7fe25ec06e67e07b1f523cd))
* correct manual scroll offset logic to use absolute values instead of accumulation ([88e381e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/88e381ede4aca7528f7a5e6c44befcf09e1f322e))
* correct webextension-polyfill import to use default export ([42c8311](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/42c8311b42ca2a7681785a43dd2b190f7f4beef3))
* **docs:** remove orphaned markdown code fence in workflow.md ([bea84d3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bea84d34fc1a309e4ccf93d9f8634a6cafe16b8f))
* eliminate race condition in manual scroll baseline snapshot ([b30eb93](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b30eb93aad3e7a15fb311f1a0af772c811a88ac4))
* enable URL sync navigation for cross-domain navigation ([707b617](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/707b617cf49788e2f6105da03ebe03318eb50d33))
* ensure final scroll position sync with throttle-debounce strategy ([c217b29](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c217b29276af570903918e4a3c4462a02ab2e56e))
* **eslint:** correct import path pattern from @/** to ~/** ([5de76ad](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5de76ad18f3c94d41e08c138712003caa711e8af))
* freeze baseline during manual mode to prevent corruption ([0ce7186](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0ce718653d4f4e280108379e33c73c4a235716d2))
* **i18n:** simplify urlSyncNavigation label for toggle context ([715b01c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/715b01c5fc10b2dabaec2d47cf3ae28f772cc51c))
* improve keyboard navigation in actions menu ([0c17ef1](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0c17ef18326d0130c74c0c5ae82bc394b059e19c))
* improve panel visibility and clickability with enhanced design ([d16f4cd](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d16f4cde8ab5eb60f7746930ecf5f0eba1247852))
* manual mode baseline을 동기화된 위치 기준으로 수정 ([fb64d1d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fb64d1d9ba0475397e0bc7a41e1c4dde1cfbeaee))
* manual scroll mode offset accumulation and baseline synchronization ([5b79bcc](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5b79bccf1cbd133c3f6603e4363b57b8d912aed1))
* offset 중복 적용 문제 해결 - 순수 scrollTop 전송 ([13d6181](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/13d6181e4550328116cbfb962988502dce01b84d))
* optimize popup layout with fixed height and proper flex overflow ([44c53e8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/44c53e821f011ee5b3acd4ffede0eb5f93c05d4b))
* pixel-based offset 시스템으로 전환하여 스크롤 동기화 개선 ([d0e9210](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d0e921058ae40fc5b006a1f76dea0573d817bae2))
* prevent error notification from overlapping tab list ([25859b9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/25859b97fa05cd2dfa3ed0bf60b2fe6aaa9da357))
* prevent infinite scroll sync loop with programmatic scroll detection ([c4edd6f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c4edd6f88c97d9f0626b25611a4ee50631109238))
* prevent panel dragging when popover is open ([b3ee88b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b3ee88b4cc338a298ac2b5d651d460118f3b6a5e))
* prevent sync control panel from blocking page interactions ([be3041e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/be3041e37d2ef0199256214224733a07c9b525bd))
* prevent tab position jumps when manual scroll offset is applied ([ed10a33](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ed10a33fcd17b72e9034e363e87007fbc13cce2b))
* remove full-screen overlay blocking page interactions ([701c0a8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/701c0a85e2a181abfeaf107f7b580015fd38dddc))
* remove tabs API usage from content script and pass tab ID from background ([fca59ac](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fca59ac14d4aa0e7a7ef9a62232a4d15530a0824))
* replace UnoCSS animations with Motion for Shadow DOM compatibility ([20341ea](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/20341ead3dccdc4b20036ef9c72a64e58540d49b))
* resolve drag and drop positioning issues in content script panel ([5f2f050](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5f2f050d5485ae4b5749f3ebf0346d37e305851d))
* resolve manual mode synchronization bug preventing proper scroll sync ([3de3326](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3de332660b2a71d5e020909a2ddd844a88104c72))
* resolve panel toggle interaction by preventing drag propagation ([802fcf4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/802fcf455d8497aceaddca307cb7a8bb1e7c7339))
* resolve scroll sync connection failures and re-sync issues ([5610d02](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5610d02396d6fa92c220d11d0be9f37c2973b9a2))
* **security:** add generic .env patterns to prevent secret exposure ([e30c49e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e30c49ece92f3fedb0c058f399817d29fc417b8d))
* sort tabs by similarity within domain groups instead of alphabetically ([241ead0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/241ead0442af4fbd43fc29ec32c623379d7a2e8c))
* synchronize urlSyncEnabled state across synced tabs ([18526be](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/18526be149a36e0e1ba040b5474b92a26a70faa3))
* update baseline when broadcasting to prevent stale baseline bug ([582f0fb](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/582f0fb064d1d6569a2244275b2244a01d85e0a9))
* update keyboard shortcuts in footer-info and sync-control-buttons components ([fc87867](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fc8786791dc5cc6e2502f9db45d94688fc3c26e0))
* update stubIndexHtml to remove options page references ([e1df49e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e1df49ee2cbbf1daa92597d608cf8efff5dca168))
* upgrade unocss-preset-shadcn to v1.0.1 to resolve CSS syntax warning ([0b484f9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0b484f99e976509181db9d425293f81111f4302f))
* validate selected tab ids against available tabs in popup ([d0e5be8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d0e5be891a231c3898fc33cc8449f51027924122))
* 스크롤 동기화 안정성 개선 및 hello 텍스트 제거 ([26ea139](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/26ea1397e48b60b2942b6a6fe774746b9e41d997))
* 실행 에러 해결 ([d8bc16b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d8bc16b7ea120fdb0a3a81ae34578627f5771423))


### Features

* @tanstack/react-query 및 @tanstack/eslint-plugin-query 추가 및 ESLint 설정 업데이트 ([7c055bc](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7c055bc44523f5cc3b5e89a7616811676220fcad))
* add connection health monitoring and improve manual mode exit ([ca18ef6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ca18ef6b979f418943a2fa9ad1348b8d3f638d1d))
* add domain-based grouping for tab sorting ([2a98643](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2a98643a03d49636c0aeff8f74e5655bf0c8d79e))
* add es-hangul and avatar component dependencies ([ee17136](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ee17136dd60f4dc90a1a34ea0e992f51e489998d))
* add idle tab reconnection via visibility change monitoring ([6b0e2c6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6b0e2c6af13b7284e40730fd307ba7a1521add03))
* add intelligent tab sorting by similarity to current tab ([c8cdd4f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c8cdd4f29fb5e5fe292159769cb052227fbfef44))
* add jamo-based partial matching for korean search ([f53d40c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/f53d40cab45e882f4d3a235b8c074dd99288d2d1))
* add keyboard shortcuts for popup controls ([d21a57c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d21a57cd6dcab401a5ac1fd4cbdd1df7be839489))
* add korean text search with chosung matching ([6c416d6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6c416d61b69735722a96b189683d6634c5a1e078))
* add manual scroll adjustment with keyboard modifiers ([4fbcd60](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4fbcd60227ba62cb41047065f6ff33b03251427c))
* add multi-language support (i18n) for 6 languages ([496cd2d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/496cd2d3ee6b1d22ef30436a21b0356f1392d571))
* add reconnection prompt UI for connection loss ([ce1c6c6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ce1c6c6739729ea9e98fc3bbbc74aa2dbec0868c))
* add reconnection ui i18n keys across all supported locales ([7414e96](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7414e96149ca499fb7aa2b8ffb81806a4b1cd3ec))
* add smooth animations to popup ui components using motion ([116ce8e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/116ce8e1926b2cb6fc5431271083c89487afa722))
* add url sync toggle with hash fragment preservation ([c256d1b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c256d1b7a41143514c98426e4fd265758496709d))
* **auto-sync:** add status display in popup and content panel ([d18e186](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d18e18671cf78a1bd256f4e13c307d2d36fc3705))
* **auto-sync:** implement automatic scroll sync for tabs with same url ([88de3d5](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/88de3d5f1149d7a0b7c9b1e375201ac25e2ae32a))
* automatically reload tabs when retrying failed sync ([e9e9ce3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e9e9ce3e582789acca9871f1f6beb03b0cda991d))
* complete panel redesign with draggable toolbar and command palette ([4d04c9b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4d04c9b900692f9731aefbbfee55c07d3f0a21c9))
* disable tab selection during active synchronization ([6cec76a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6cec76a506dccb32ab89eb4767fde378d360ad1c))
* enhance manual scroll handling with wheel-based mode ([4eab105](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4eab1050b9ed7431f7195af9bccce70a73003a93))
* enhance popup focus management and interaction handling ([dac3b25](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/dac3b25941f25f16d3edee83493a2bccea80d263))
* enhance URL synchronization and manual scroll offset management ([c51dfe1](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c51dfe1ed5e89cbf61e7db3a5107230e48ff18b8))
* **i18n:** add spanish and japanese support with system refactoring ([7fccb14](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7fccb148221961a777c6bc4765ba8dcbcbb415a5))
* implement comprehensive error handling and user notifications ([3574e1f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3574e1f790c11cd77a40484bf9340881a5317a0d))
* implement dynamic theme support in panel component ([ac03127](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ac0312791322dcd5e6bb37728d3ee0f09c46a5b8))
* implement raycast-inspired command palette ui with comprehensive keyboard navigation ([ae33d8c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ae33d8c434b5b7b5ccb86c914aafc05e537bb32f))
* implement robust tab reconnection and content script health checks ([5d6a11c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5d6a11c8544ecef10ee55656343c8b01d7a6ba82))
* implement scroll synchronization system with webext-bridge ([39e9d24](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/39e9d24c3265fe912ef81888d69c356705d2d234))
* implement state persistence with browser.storage ([37718e9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/37718e9372cb989958e51166bd35996c452fe110))
* implement toast notifications for sync suggestions ([7098a6f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7098a6f1a0db3684c01c817a6571eeb934b0fafe))
* implement URL navigation synchronization (P1) ([4020d41](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4020d4171c921c9e40d91be721dfb5c2bf699863))
* improve content script panel positioning and drag interaction ([c26aa02](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c26aa02372e87961e0516bc9efb9700c4b02f083))
* improve popup focus management for seamless keyboard navigation ([058ceb0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/058ceb0d840663d972ef92e9b0a7ab62e6160ff0))
* integrate browser api for real-time tab management ([7f1cbe0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7f1cbe02660937bccba9ca7376a749eb149d0576))
* integrate popup with background script for scroll sync control ([373e5b7](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/373e5b7c0039973634dd96b4cc66a589c8f2d427))
* mcp, components shadn/ui 레지스트리 추가 ([0170e0e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0170e0e8fbc0f41807e501276ce8266ca2c24cae))
* popup 추가 ([f155266](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/f155266ff9b49a2571dddcca6d76370242bf917c))
* prd 문서 작성 ([3edbcca](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3edbccabce5bfd2265b16cabd866827b6aa893d2))
* rebuild sync control panel with shadcn/ui and add manual mode visual feedback ([31dc38b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/31dc38b4fb50b612b4ab36b27c610766f40342d6)), closes [#section](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/section) [ko#section1](https://github.com/ko/issues/section1) [ko#section2](https://github.com/ko/issues/section2)
* sentry 설정 ([ca3d895](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ca3d895375ece31fdcb7d2ace4e846f5760d4bb4))
* sentry 소스맵 테스트 ([2ecc16e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2ecc16ee3af9de9cca1f929243b282e12ee2a511))
* synchronize panel position across tabs ([033d518](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/033d518cef19c6f9bb26b22c6b13c60dbeb44341))
* **ui:** enhance domain filter visibility and user feedback ([3470bdf](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3470bdfb3c0237c113bd8aca39277842dc321c53))
* unocss + shadcn ([a5750b9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a5750b90b91534e3bd2c8f52fbeb2e2374a837ae))
* upgrade to react 19.2 and migrate to ref-as-prop pattern ([f54c8c6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/f54c8c6a5b5434722b3a9831e2def7a4e0a99cbc))
* 임시로 옵션 페이지 추가 ([1119662](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1119662873284e2a2a9a48c8902dae69e8d6406e))
* 팝업 ui 컴포넌트 및 타입 정의 추가 ([02adea8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/02adea826b19af9d989d230c194122a3ea76e8b6))


### Performance Improvements

* optimize drag performance with RAF and will-change hint ([24dead1](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/24dead1e2ac26924feb3c13e8c7f9ae0da323e3e))
* reduce message timeout from 5s to 2s for faster error feedback ([62ddd2b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/62ddd2b05bab0d738800d6ba48cccee9f989c73d))

## [2.3.2](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.3.1...v2.3.2) (2024-07-26)

### Bug Fixes

- 외부 스크립트 추가할 수 없는 구글 서비스 url들 추가하여 관리 ([abbe731](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/abbe731afe08efa7face1611e0b45ac2c593d8b5))

## [2.3.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.3.0...v2.3.1) (2024-05-13)

### Bug Fixes

- 스크롤 백분율 계산할 때 문서 실제 보이는 뷰포트 높이 고려하도록 수정 ([c24ff10](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c24ff10f6d5a50f4b3cc8a333b71ddf6c6d2a6c3)), closes [#132](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/132)

# [2.3.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.2.1...v2.3.0) (2024-2-25)

### Bug Fixes

- onSelect 이벤트가 발생하더라도 input 포커스 유지하도록 수정 ([36ecd27](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/36ecd27b79f2ea7467f45f9c0b2d455c90f9576e))

### Features

- url로도 검색이 가능하도록 설정 ([0221703](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0221703bc02890a703fb3c837a55cfa9cb0d61d7))

## [2.2.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.2.0...v2.2.1) (2024-2-22)

### Bug Fixes

- 윈도우 환경에서 단축키 텍스트 수정 ([1895890](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/189589010b61d02b313555eaf6f6daebe21228ed))

# [2.2.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.1.2...v2.2.0) (2024-2-21)

### Features

- add support for Edge and Opera platforms ([5aa5c78](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5aa5c78d5b93f197126d739626d2a89b2849fe83))

## [2.1.2](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.1.1...v2.1.2) (2024-02-15)

### Bug Fixes

- chrome ([48fd343](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/48fd34376827539ace3d2d2a8fc62167a87eebb9))
- syncTabIds 반환 타입 수정 ([0b60535](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0b60535d04a4e11347a18bceded78ff14a1da97e))

## [2.1.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.1.0...v2.1.1) (2024-02-15)

### Bug Fixes

- add polyfill for chrome.tabs.query function ([498e913](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/498e913074c9e3e19da36f8b29608e48ab06ef69))
- chrome 네임스페이스로 타입 단언하던 부분 제거 ([4da90c0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4da90c0a2f85c8a666a5637c677b7276fdef0989))
- fix typo in Firefox add-on link ([59b2c8a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/59b2c8aaf96b88d5fa81b733edd766c4b9987e2b))
- update delay values in copyToPlatformDirs and zip plugins ([d383051](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d3830517f5d316ee4f2e981fe8f65683a587c7eb))
- 서버에서 데이터 패칭하지 않음 ([bdc9711](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bdc9711b5fa501b523ee75ab5d1263603e0e7c4c))

# [2.1.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.0.3...v2.1.0) (2024-02-13)

### Bug Fixes

- querySelector 사용 시, 표준 CSS 구문에 포함되지 않는 문자 이스케이프 처리 ([fc5c473](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fc5c4738b4bad8054da08b0ccbdbfdd0b4f1452c))
- 데브툴 보이는 조건 수정 ([6b9c1ca](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6b9c1cad07522238064632fecd1d5857ec54079a))
- 파일 복사할 때 이미지 파일 손상되지 않도록 수정 ([3330444](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3330444a13360b42a74828b3b0067d3aa0ce93e3))

### Features

- add node module utility functions ([3c8a24e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3c8a24e278abfce8ff10045ebec714b4a598b483))
- add support for Firefox version check in background script ([248ec52](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/248ec5210ace4e47d8b9735f09a816732d55068b))
- mv2 대응 & 빌드 프로세스 업데이트 ([a719992](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a719992366d33aa5b54b417922ffc6735f7a3356))
- platform detection logic ([b7f71a4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b7f71a4f9b1c52026ed40ec92b07f41d566fbc40))
- 브라우저별 manifest 구성 파일 생성 ([0ddcd87](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0ddcd87f193d7e577db9a031f6525db57326aac7))
- 빌드 시작 시, 특정 폴더 존재를 보장하는 플러그인 구현 ([bc103e0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bc103e0e6960838f9025f4d152ec067c56d593e3))
- 빌드가 시작되면 특정 경로의 폴더를 제거하는 플러그인 구현 ([9ebc3b3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9ebc3b368efdcd5937fcac7679947a8e6dad34e0))
- 플랫폼별 빌드 결과물 압축 파일 생성 ([e37c5ee](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e37c5ee91f0d75ac0cd86b54b5b816772c6683b3))
- 플랫폼별 빌드 경로로 번들링 파일 복사 후 제거하는 롤업 플러그인 구현 ([5916a08](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5916a08bf23b8eb9838193f6f2c42355a1ddbf84))
- 환경 변수 타입 정의 ([3791ae6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3791ae6d5c546db40fadcba920a4710e6ad60f51))
