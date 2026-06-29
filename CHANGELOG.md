# [2.13.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.12.0...v2.13.0) (2026-06-29)


### Bug Fixes

* centralize contextual hint guards ([5a8ec83](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5a8ec83a13676256e952d0a4776f5271809ac474))
* clear pending hints on tab removal ([6173b82](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6173b82c0175a3cf78284cabc37d2bd355e91c1f))
* consume URL sync hints after navigation ([56f2592](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/56f2592fd8b423325dc7e5bb595b704e393bd47f))
* consume URL sync settings token once ([ce81767](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ce81767adf763fdf272cf3304697b14f8d039597))
* guard pending contextual hint dismissal ([508c6c4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/508c6c463ddd7c59205f4006d587202e97f633b6))
* keep URL sync hints during sync restart ([9209123](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/92091230bbe9c1909080e2c11db7f99edc3f3add))
* preserve contextual hints during toast cleanup ([c354656](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c3546560c57d108479ed6ccf680dbdf66ccb9e4b))
* relax manual hint threshold ([1e27108](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1e27108df118dc60854961da9443be2aec017fd2))
* sentence-case contextual hint translations ([d3784ba](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d3784ba8b0792a1adc73d1cf2153efa5626a408e))
* simplify URL sync hint queue mapping ([b831fae](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b831fae7db8f8bb744384a81ef85ecb11b78cdd7))
* stabilize suggestion toast sizing ([80b6d52](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/80b6d52aef1df9167beb93708c2995e6b5193acc))
* store contextual hint dismissals per hint ([9401f22](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9401f224a2f69a5cbbe8b0a62769240c7afc81f0))
* validate contextual hint scroll metrics ([cb06d19](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/cb06d1978de06dcbe76ee297685f88599e1df474))


### Features

* add contextual hint helpers ([80d28ae](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/80d28aeae5216858b1d5d3011d6059265de0b34f))
* add contextual hint types ([376d6a4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/376d6a4a3a946f386968da87fa4b8f3894beceee))
* add dismissed contextual hint storage ([319ff5a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/319ff5adf29cfa90ed99649b65d73eaa63509d33))
* add manual adjustment hint overlay ([6c30555](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6c3055522dde0139a0430756b96e6323feee55fc))
* add pending contextual hint protocol ([e363cbc](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e363cbcf10cfd936c560318fc413fb1693a44224))
* localize add-tab sync copy in Chinese ([8e8930b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8e8930b6bc4e65c1b5d74b777b7fb3999835c0de))
* localize add-tab sync copy in English ([71c4ca4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/71c4ca45bcd270cd6aa9192aa78416bfe7b490f0))
* localize add-tab sync copy in French ([7396c8c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7396c8cbc49a64673a3f3638a4b5b6bb6fff068e))
* localize add-tab sync copy in German ([1c86981](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1c869818c2bbf357640a702c5b885131018ee1c8))
* localize add-tab sync copy in Hindi ([2c143a3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2c143a37ddd393432d7a3a04d1d7e5d3e19edf39))
* localize add-tab sync copy in Japanese ([0c6a3ef](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0c6a3ef2f76f79c4e67654ffa5f791a44199e973))
* localize add-tab sync copy in Korean ([6879024](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6879024b0f3c68ea197a9e37dfbd9c225f3d1bf3))
* localize add-tab sync copy in Spanish ([5e583d8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5e583d86120bb47b2cedf12009103b98683eed7b))
* localize add-tab sync copy in Traditional Chinese ([8f39596](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8f39596a65d5b3d3121108d5029bc29ac25419cd))
* localize manual hint in Chinese ([bea6bea](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bea6bea1aca9e9809372d79ed0816acdbeb0e263))
* localize manual hint in English ([fff9640](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fff96403644a8dc7a114124882f9045f0dbc2473))
* localize manual hint in French ([816fb91](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/816fb91467983889b5e53dd1b9fe3573d13143e7))
* localize manual hint in German ([eaa06dc](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/eaa06dc377d46baf1dee2224877c75ff831c4671))
* localize manual hint in Hindi ([d7c3a16](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d7c3a169e5bc36c9adc26065b8cf616d0cb3f6c0))
* localize manual hint in Japanese ([421be73](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/421be73f300a3ff95174eb6ba63e4876092de504))
* localize manual hint in Korean ([2077320](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/20773208b2b2d4817fa8ea237c3858d647088772))
* localize manual hint in Spanish ([3a98df9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3a98df969883a67bf0a149e07fc2ea126154878e))
* localize URL sync hint in Chinese ([263456d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/263456d04afca246417312e8845df5b140c82bef))
* localize URL sync hint in English ([81f2bdc](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/81f2bdc61437252c4ce734ca645ed5c1671c4fcf))
* localize URL sync hint in French ([f54fb3c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/f54fb3cf316935ad542761a1951dc31002274f92))
* localize URL sync hint in German ([ccd4d4a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ccd4d4a5db4b0bdd023d8d2ce017ca9a90d184d1))
* localize URL sync hint in Hindi ([4a0b558](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4a0b558d3fff64af1dca418b35dddb5dd9757c94))
* localize URL sync hint in Japanese ([84679d3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/84679d3af5a1fae83564f4f1e8783adec1064a49))
* localize URL sync hint in Korean ([94d6058](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/94d6058cf5a651b9d4d9aae24a1496615dbdf8c2))
* localize URL sync hint in Spanish ([069e2be](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/069e2be4380abc1113c93d77da6789e7e72813e2))
* localize URL sync hint in Traditional Chinese ([679cd60](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/679cd607266c72728059dc60dd2f62e2a1ad206e))
* open URL sync settings from panel events ([c557f77](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c557f77fd2fb03cae4b56ab51911a849484c177c))
* queue URL sync contextual hints ([df7ab4c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/df7ab4c90c14b8a14b61047953d24db981566483))
* render add-tab current sync copy ([3809bfd](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3809bfd6f25a619f4d1aac7a101d00526b0eb576))
* render manual adjustment contextual hints ([f0d87ed](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/f0d87ed46cd576cf9555bda83112f162f2087ce8))
* render URL sync contextual hint actions ([ac13b51](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ac13b51a386df52059afe6b8e86055bc886c28eb))
* store pending URL sync hints by tab ([384cd83](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/384cd83be1469551c6e35be054418add1760b84e))
* trigger manual adjustment contextual hint ([0eae127](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0eae1272537e5d72ecef8f514266d1638d996c34))

# [2.12.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.11.0...v2.12.0) (2026-06-28)


### Bug Fixes

* add instant programmatic scroll helper ([cf9cd31](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/cf9cd313002b87ba91fc6c02d6b3e21afdeed739))
* add privacy logging validator ([8a4ae65](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8a4ae65e7006c544ef42ee4ec661b6bc32425689))
* add URL sync save failure notice copy ([8c29939](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8c29939cf4b3eaf6bd5c1ecf83d78778104e07b4))
* avoid false URL sync mode repair state ([465051f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/465051ff8727f7cd07e926137c552d333f17a764))
* avoid stale popup URL sync state ([33d24d6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/33d24d63f17b04be9284db122fbc6c5de3124a35))
* block URL sync mode changes while toggling ([4ab929f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4ab929ff040da64085d1975a621acd5f4950d3c9))
* coalesce programmatic scroll targets ([ea46605](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ea46605b0ac97b07ce43244a6046bd25ed341715))
* cover URL sync callback throws ([a121a46](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a121a4628cb9c01e3e1c10c35bca3e7c7a098d39))
* distinguish URL sync mode repair failures ([50a9761](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/50a97611bab8be06d02d1df1662020b962c40311))
* group popup URL sync start controls ([a3c9a03](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a3c9a038948b7a0bd3560e936bea5f7560cc94ff))
* handle URL sync repair failures in content ([8c91ff2](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8c91ff25f4bdc4e08eee7a4fe969db73e9baa515))
* harden privacy logging alias detection ([fbbf98a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fbbf98a938c3f7f340b06cb286d7e998a1474a12))
* harden privacy logging rules ([408f369](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/408f36947015cf93425dbd576faab309dd659a35))
* harden URL sync settings UI ([917df53](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/917df530920721bc9bdb76fcea14feb51d93dff3))
* **i18n:** clarify English same-page suggestion copy ([dd2f114](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/dd2f11471bd8785037a26bfd0f5e8711f1990b5e))
* **i18n:** clarify Korean same-page suggestion copy ([f2bf693](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/f2bf693b6f5fe7fd5f77ecac9338e66c8fca3c7e))
* **i18n:** clarify URL sync page change copy ([a9b3017](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a9b3017ab9dde643d59574e81e86616d114054bf))
* **i18n:** clarify URL sync setting failure notices ([e80bbda](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e80bbda32d635c6ead5195b11df56adebe9e16ba))
* inspect dynamic privacy log expressions ([35d6281](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/35d6281d8491e52afccf252b6849bbfafbd677b8))
* inspect nested privacy logging metadata ([51d0208](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/51d02082c44f2b3d75012eac1583da4295f17500))
* keep auto-sync state truthful after failed joins ([eae6bdc](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/eae6bdcc3cc343a1d578a2aadfdf07b19ecfd14f))
* keep popup URL sync state after save failure ([1734b01](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1734b01b47996d3e09319cb86fead82a87632e1d))
* keep URL sync editor open on false mode saves ([ed2b253](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ed2b253f8d5083fb7c730a8541d80d6f9c19badc))
* narrow privacy logging expression detection ([fe482f9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fe482f98ffdabf1c8f406f940e887956cb01329a))
* preserve scroll behavior priority ([e23369a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e23369acd42e9178cd7f7a99a15a2d564fab02ef))
* prevent popup URL sync settings clipping ([c5c18b9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c5c18b9abdfc42ded7c60df801cb0a3926129dcf))
* remove URL sync language helper copy ([5864a5f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5864a5f8be7653f6e2a2e86904ef423e697ad544))
* report URL sync storage save failures ([69a54f0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/69a54f03d0fdb18b70b01a38f3e60765a085a4bb))
* resolve privacy logging aliases ([d53c0ed](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d53c0edb156598fa2dcccc6f2f1f27732aecf0da))
* respect privacy logging shadow bindings ([b86132e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b86132e4d926cade99ccd529ef0da65e7996df4c))
* return URL sync mode save results ([303b473](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/303b4735e62c4543402104b76ad9befc2ba94f69))
* sanitize background handler logs ([752d869](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/752d86965a1a03324572cc9aacda5576ef4f4475))
* sanitize background state logs ([c848538](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c848538d8deb67ec826fe1fb5759b91814fd4e02))
* sanitize content script logs ([2a65be6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2a65be678d59ab16ca44c5ac9a04c47835201c83))
* schedule instant scroll sync targets ([3463115](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/34631150d9647d9173c3dccd308a0a19920c0501))
* scope privacy logging aliases ([c907abc](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c907abcc0343376ed6f81d639c2df29aefb77fba))
* stabilize auto-sync suggestion handoff ([a1fad12](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a1fad1240ff32f955745008df9204e836e24282e))
* sync open popup URL settings from storage ([15b6010](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/15b601040a088b8ffe6f576bc501ad3e2f1985a8))
* traverse nested privacy logging expressions ([95aa9b5](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/95aa9b5e2c705a7ac32fe25f2a0109a0f8226ce3))
* update content panel from repaired URL sync mode ([6f68d1e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6f68d1e973f00c6bd94ee19bce79e0592589077f))
* validate URL sync enabled storage ([d12321e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d12321efeed42c64204dc2bbc08e8fcc6ad6a650))


### Features

* add compact URL sync settings variant ([511675f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/511675f79808e4e8eaa618fc9b0dac96ebd1d0f7))
* add URL sync mode protocol ([5314d28](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5314d2826dc2237ef080413ab683d6af6b2b4452))
* add URL sync mode type boundary ([837ef02](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/837ef021fda3fb545f35b563cab4f17090cae58a))
* add URL sync settings UI ([bbca873](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bbca873a475c5296dee10f3d8953a96b6c47e80f))
* apply URL sync mode in content scripts ([01efe18](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/01efe18fbec4be0abd05a103455c61440b5d37c1))
* compact URL sync controls in popup ([be10fd5](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/be10fd55e8bd0290c54870c284357eac97290c0f))
* expose popup URL sync mode state ([a49eb4e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a49eb4e995732ddc7c8ec7906f37d2abe76413e5))
* persist URL sync mode ([8587650](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8587650950fb0a3eee0a694b619e6194ec1b901b))
* relay URL sync mode changes ([0a60e40](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0a60e404461d68c29c6b006434ed91fc888da5ee))
* resolve URL sync modes ([e1d2506](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e1d2506dc22981ffd543d3d6bfd27dbf96007408))
* show URL sync settings in popup ([ced7cfb](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ced7cfb85d492ef2c67127689b4d7ad51493b679))
* wire URL sync settings into content panel ([6538862](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6538862f231d2354f73486cb11ed220d5f17e303))

# [2.11.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.10.0...v2.11.0) (2026-06-26)


### Bug Fixes

* avoid misleading local file access guidance ([ea5f85f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ea5f85f71e4f5f88095a5064a4ccc0718c2f9e02))
* block about URLs across browsers ([d8878d1](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d8878d10e12390f3166a1c35feb87c9e5722bf9c))
* block local Word documents from sync ([3345763](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3345763ea7b5ddb83225dc452251514d32780442))
* **i18n:** align local file access messages ([c591a15](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c591a156f744afe1c980d438710e1499b99e8bca))
* log file access probe failures ([eed12c8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/eed12c8984718022aa7cc1d35a1c4a4a8d1a2ab2))
* scope file access guidance to failed file tabs ([0707622](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0707622d46047d0364c9b7d4fdadabda33cbb43e))


### Features

* allow manual sync on local file URLs ([b37161d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b37161da5b40a3bf0a75b0afe022963515dde648))
* allow manual sync on local file URLs ([de288a8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/de288a81c8aaaa81d9130b997de94c1537f8d388))
* detect local file access state ([a0965dd](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a0965dd1ae3a584069e8ab360c5f28904c7341de))
* explain local file access failures ([49fe3df](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/49fe3df7a310f8912bcea58147f53e4479c31730))
* guide users to enable local file access ([9e9c76d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9e9c76dffb2ab8453af0e18614ae4d80228d817e))


### Performance Improvements

* parallelize tab discovery file access checks ([175d89b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/175d89bc3c9c2eaa0cd3900b5b7f4e150ab58357))

# [2.10.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.9.1...v2.10.0) (2026-05-15)


### Bug Fixes

* add command item leading indicator ([6bb644e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6bb644e2a848f2cbcc99be3d065f52cf7b1fb65a))
* add spring motion transition helper ([82e9188](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/82e9188ddddc74f8328e6f6b3f00d286afbb3256))
* aggregate translated add-tab metadata ([cf34f5a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/cf34f5a1d9f0ebafe66bd1fd63a84f043813e8a0))
* align Korean josa formatter quoting ([b6efdc8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b6efdc8adfda2086d7405364f52cf7b4d1b4838b))
* allow translated metadata request failures ([568ab15](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/568ab153eaca4ec02577a5cc8eb979846cc374cf))
* animate command item indicator movement ([7d1e7b7](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7d1e7b77ed524138cce809f9e046dc6a60a942a2))
* animate keyboard command indicator movement ([13182be](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/13182be9ae3cb32c61b01c4a039383dec4eee018))
* avoid refresh lock during translated probes ([0ed76dd](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0ed76ddce1b9f4d4d55cc12a772f5c62d21d5ae1))
* avoid translated update lock contention ([75eb6f5](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/75eb6f58e7f799c4e5824634f96c8b9f1919e5dd))
* bound translated candidate metadata probes ([bf30966](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bf309664ead3011baf2f6b49a3f7fea76dd1da7d))
* centralize auto sync group tab removal ([6df640a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6df640ad4faf3aab577a75e3ee07e4af06b53f1e))
* choose Korean josa before quoting ([189ef83](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/189ef83c2185cc9cb3ea5aa895134fd906934dc6))
* guard translated candidate group updates ([6ca6c66](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6ca6c6637ad82d8c7ce056b55eff499bafa707f0))
* **i18n:** add translated add-tab copy ([e31327d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e31327d9e48d613fa57aecd444ad81e95dbb95c9))
* **i18n:** apply Korean josa to add-tab titles ([aab03f0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/aab03f00a626e2925136ce50f6f25dc545020bcb))
* **i18n:** apply Korean josa to remove labels ([929bec9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/929bec9c031b9d6307b5cc24b73dc39c9138dcb4))
* ignore blank translated metadata links ([6561539](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6561539281f5bf48e50c792f5086d8c75c256d1c))
* include auto sync match metadata in status ([5ebee91](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5ebee91fb5a3014f71a194227303201fd625cbb2))
* **landing:** correct supported languages count from 10 to 9 ([#369](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/369)) ([d350a22](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d350a224fd7cedd243529215c076eacda4ecba11))
* **landing:** update pnpm and approve build scripts ([60b465a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/60b465a8522ed617d7c6534b8a528bf1e08abdc9))
* **landing:** upgrade actions in deploy-landing workflow ([8f3b1d5](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8f3b1d566f281ddbba22d754e11da9ea66d4cb46))
* **landing:** upgrade actions in release and store-stats workflows ([5beed48](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5beed480b5b657a56d76ebcaa8219144f6230d2c))
* make command item hover highlight visible ([2a6ff6f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2a6ff6f02dde4c9ff169416ada656700ca8f7714))
* match active translated slugs by metadata ([278887b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/278887b092b9ce972f7688b755c027a2957eb1d7))
* narrow translated metadata matching ([2065d48](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2065d486b66017da713c3e114cfca5061cb86dfa))
* pass tab id when refreshing group metadata ([c2c85ad](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c2c85ad4398b5c7f454e38f877969d6d0baabf67))
* preserve command selection on disabled hover ([455db07](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/455db076fe687c39b46506183a9c9356bd28b3df))
* preserve full candidate reprobe groups ([cdac8d5](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/cdac8d507e4fedbc72adcdbe0eaaf71771ba3248))
* preserve locale carriers in alternate matching ([05cda25](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/05cda256089ddf111e0cd98f95bf9ca1a3bed7ce))
* preserve non-locale language query values ([5cb9deb](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5cb9deb71496c82dc5d3b46c70bf0ccb02ec0e9a))
* preserve source identity query in translated URL sync ([dc224c9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/dc224c97044bf5f1d5d11cf2ebaade47357d0714))
* preserve target locale carrier without source locale ([d551d0d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d551d0d0682f3652b09d24047fb673da011e8ee5))
* preserve translated add-tab metadata ([40ad234](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/40ad234dd50cf594bd56df19b66ed7327bc9e0f7))
* preserve translated candidate tab membership ([d23f849](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d23f849650f0584d13f8b9a48936bd8465bc98f0))
* preserve www host in auto sync page keys ([e4c0580](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e4c0580e3f6988e6a69887fa7e2251da611e5ac3))
* recompute auto sync metadata from tab urls ([271827f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/271827f061df7e13d516ed30bd39dbc6e6f47dde))
* refresh metadata on same-key tab updates ([6adaf66](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6adaf667eaa1c181f8e30ec3a3664f0f0bec1c8a))
* refresh translated auto sync group metadata ([9a6fb48](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9a6fb48db00869335cf6726588f77583ba9ae81d))
* refresh translated candidates during init ([a90681b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a90681b0c9b632dc84eb61e9340e91863fc4a5c8))
* refresh translated singleton candidate groups ([733fd0f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/733fd0fee2c400395bbd1e641bc8e2cb7975e87b))
* reject stale no-candidate translated probes ([d14f042](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d14f042f926d74a7e730f4ac45150a88caf997ba))
* reject stale translated metadata responses ([77e8931](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/77e8931acb0b6edc8cd54196bb968c62bc42628c))
* skip full translated candidate groups ([be6cf70](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/be6cf70ba7e0b8ac6ee2dbf0d2f3e65fbfc0d132))
* suppress translated active sync suggestions ([7693d2d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7693d2dfa3419c00a2a8f5d2ed99576066015664))
* tune command indicator motion ([ce16b79](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ce16b792a8e69c06b9a80138f7643750a6d8ee90))
* upgrade translated auto sync group metadata ([f4a332b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/f4a332b76e6fab1dbb1898a25c2539d944b26cc8))
* use group removal helper during lifecycle init ([0c01ead](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0c01ead097ec2792762876c9a2c3ab007b54cde9))
* use spring motion for command indicator ([34cd34d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/34cd34d20c34949a92bdf7d5ea0c5b2dfe005081))
* use translated add-tab suggestion copy ([41dc701](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/41dc70105e91d9863fe36a7e7bdbcb967295729b))
* use translated page keys in tab events ([a24f0a8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a24f0a87e8ce188ca097a2963b9d2c8c1c093944))


### Features

* add French translated suggestion copy ([725e454](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/725e454d7d02de7fe5763169a16e689588c05336))
* add German translated suggestion copy ([11474aa](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/11474aade2a67d901ba9449f9759d071af7df268))
* add Hindi translated suggestion copy ([32f0759](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/32f0759b68dfeac6ebb2b3afeb7b77fa6547717c))
* add Japanese translated suggestion copy ([06ddd2b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/06ddd2bf83c5cf78911677e81d92a31104720cb1))
* add Korean josa title formatter ([d3e5d30](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d3e5d304b1bb2b0aeaac6431b830842de4376bba))
* add Korean translated suggestion copy ([c7483e9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c7483e98450d9990de68434779c0761f5e4dbced))
* add Simplified Chinese translated suggestion copy ([f01ff44](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/f01ff44382a55ed1df4579f91ede157df6c90776))
* add Spanish translated suggestion copy ([b285b87](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b285b87989914851ff453581b882c2c06a4f001d))
* add Traditional Chinese translated suggestion copy ([e12e856](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e12e8564bf403d71fa16b77229997917bbc7bf1b))
* add translated page candidate matching ([cd0644c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/cd0644cb95f59334c688e0cad182c8fdecf97c0e))
* add translated page sync message metadata ([96aec88](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/96aec88c583b3cc63982fa6c541607e8babd4cf5))
* add translated page URL utilities ([08a71f2](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/08a71f26e2d086a12942765bf5fa07f6d031eb67))
* collect translated page metadata ([339daf5](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/339daf5159bc6ea941c9acce3a69153401360c66))
* detect translated tabs for active sync ([bfd4cb1](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bfd4cb1e3444208541df4f6da1ac3955bc66e399))
* export translated page URL utilities ([8cd6ea8](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8cd6ea833c4b9b657f7040e5845f099528e52d0e))
* expose translated page metadata handler ([011fe44](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/011fe44e2b270dfb056fcef8bbd2ca6bc8a540c7))
* group translated pages for auto sync ([90b8d55](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/90b8d5552fb6317de3226743926a319fed97342a))
* include add-tab suggestion match metadata ([23c7769](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/23c7769e9e20ec2af3e0f1ca6a11d42c70c18edf))
* include translated suggestion metadata ([cc279c7](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/cc279c7f20104f0a12551c75464496991ba7db55))
* join translated slug auto sync groups ([9e2aa20](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9e2aa2066e973a3d686272e56ad2b372d8b54679))
* route locale sync through translated page utilities ([6785ed9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6785ed9111bf1d6a1aa5ac489386810715a6856e))
* show translated page sync suggestions ([5bb823d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5bb823d84f2513f3891ff2be744e7f4a4dc687a1))

## [2.9.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.9.0...v2.9.1) (2026-03-15)


### Bug Fixes

* add data-testid to scroll container for robust test queries ([d471906](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d471906ff7ccf2b2f939c8e0245d6799a1e06865))
* **landing:** add fail-open timeout for i18n-loading and log hydration errors ([1e78def](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1e78defb964bfd43cc142b6d25f99f0923214aac))
* **landing:** complete sitemap hreflang for all supported locales ([fb6a92f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fb6a92fde96f03ebab597f35ec2b51e068d87fd5))
* **landing:** eliminate hero section layout shift on sync toggle ([#357](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/357)) ([514eefa](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/514eefa875d9b65febea86710c6c9210f3da6b3c))
* **landing:** enrich analytics events with position, user browser, and state data ([a4c5af5](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a4c5af5655d913dec0ec7bdc69eb91b9aa70eaf4))
* **landing:** fix keyboard accessibility and header layout shift ([#358](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/358)) ([c7040ae](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c7040ae15d3cace5a94d69386b643a3898ac1f26))
* **landing:** guard blocking scripts against localStorage access failures ([e0fefea](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e0fefea14c7bfbbf69916b5507ed4ac78e3ea496))
* **landing:** handle LANDING_BASE prefix in prerender static server ([75aa24f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/75aa24fd240dc2a7988430e4d7471dff74eb365b))
* **landing:** pass LANDING_BASE env to prerender step in deploy workflow ([a6f107f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a6f107f48b7dce75f753005b666ea79908d83fb0))
* **landing:** prevent dark theme FOUC and respect system theme changes ([e856a61](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e856a61eebff26e4a9fdc5b544e095444080895b))
* **landing:** prevent English content flash for non-English users during hydration ([e172b7e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e172b7e0e7ec204da145f8da27d201aeb213355b))
* **landing:** use union type for InstallButtons position prop ([7d9c873](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7d9c873d0dc5af17f0ed0b604c6ecd01bff70514))
* resolve scroll and overflow issues in excluded domains dialog ([#366](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/366)) ([274ed11](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/274ed11d60eb284c0aed76359bbd4ec435bdaa7a))


### Features

* **landing:** add de, ru, it, vi, id, pl, tr, zh_TW translations ([8ee07a4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8ee07a4c3c1994936eab31f88eba284a74fec7e1))
* **landing:** add GSC verification and enhance meta tags ([ee68b28](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ee68b28d5c147a8493ee3e86ddf2a877e93a26dd))
* **landing:** add hreflang meta tags for en and ko ([312b8d3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/312b8d39eb6b83f6626f67cd719215f2e9e243bc))
* **landing:** add noscript fallback for non-JS crawlers ([d13762e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d13762e9800154cafebd2ef8f92e451beb314df8))
* **landing:** add Playwright-based prerender for SEO ([a440060](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a4400606f40b85b170b1b7bda6aae1681b6f9587))
* **landing:** add resource hints for Umami analytics ([3a0f847](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3a0f847f0f0c265aae920090bb2367df40984200))
* **landing:** add sitemap.xml and robots.txt ([24a9b95](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/24a9b95e0512a6108bf8e11f02b0f2d0fff39812))
* **landing:** add Umami analytics tracking to footer links ([bee7c9e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bee7c9e91e9a816d99e01e461153bb48c6461345))
* **landing:** automate store stats for JSON-LD aggregateRating ([#359](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/359)) ([92d085d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/92d085de6ebd533719047f6dabf92a9af6a9d66d))
* **landing:** enhance JSON-LD structured data and expand FAQ ([85c9b87](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/85c9b8741901e65ef7bc91efe9245a223e5cc38e)), closes [hi#intent](https://github.com/hi/issues/intent)
* **landing:** enhance JSON-LD with ratings, features, and FAQ schema ([311ea2f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/311ea2fc0b1d6c89610cad94571af1369e1beffa))
* **landing:** expand i18n to 10 languages and convert toggle to dropdown ([c2ac8dd](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c2ac8ddf9bb9950bdefa66afbdc859802450c6d5))
* **landing:** implement extension landing page ([#349](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/349)) ([88b076a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/88b076a9bdf6b8ffc872381eb72794a0a86fc4c9))
* **landing:** smooth scroll sync, manual offset demo, and platform-aware text ([#351](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/351)) ([6228587](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/62285871162129923b1416efa9f152c8178e328b)), closes [#352](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/352)
* **landing:** update languages badge to 10 and add all hreflang tags ([77f35b1](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/77f35b13731099011168dc00302c9c2e41853f7e))

## [2.9.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.9.0...v2.9.1) (2026-03-13)


### Bug Fixes

* **landing:** add fail-open timeout for i18n-loading and log hydration errors ([1e78def](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1e78defb964bfd43cc142b6d25f99f0923214aac))
* **landing:** complete sitemap hreflang for all supported locales ([fb6a92f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/fb6a92fde96f03ebab597f35ec2b51e068d87fd5))
* **landing:** eliminate hero section layout shift on sync toggle ([#357](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/357)) ([514eefa](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/514eefa875d9b65febea86710c6c9210f3da6b3c))
* **landing:** enrich analytics events with position, user browser, and state data ([a4c5af5](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a4c5af5655d913dec0ec7bdc69eb91b9aa70eaf4))
* **landing:** fix keyboard accessibility and header layout shift ([#358](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/358)) ([c7040ae](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c7040ae15d3cace5a94d69386b643a3898ac1f26))
* **landing:** guard blocking scripts against localStorage access failures ([e0fefea](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e0fefea14c7bfbbf69916b5507ed4ac78e3ea496))
* **landing:** handle LANDING_BASE prefix in prerender static server ([75aa24f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/75aa24fd240dc2a7988430e4d7471dff74eb365b))
* **landing:** pass LANDING_BASE env to prerender step in deploy workflow ([a6f107f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a6f107f48b7dce75f753005b666ea79908d83fb0))
* **landing:** prevent dark theme FOUC and respect system theme changes ([e856a61](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e856a61eebff26e4a9fdc5b544e095444080895b))
* **landing:** prevent English content flash for non-English users during hydration ([e172b7e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e172b7e0e7ec204da145f8da27d201aeb213355b))
* **landing:** use union type for InstallButtons position prop ([7d9c873](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7d9c873d0dc5af17f0ed0b604c6ecd01bff70514))
* resolve scroll and overflow issues in excluded domains dialog ([#366](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/366)) ([274ed11](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/274ed11d60eb284c0aed76359bbd4ec435bdaa7a))


### Features

* **landing:** add de, ru, it, vi, id, pl, tr, zh_TW translations ([8ee07a4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8ee07a4c3c1994936eab31f88eba284a74fec7e1))
* **landing:** add GSC verification and enhance meta tags ([ee68b28](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ee68b28d5c147a8493ee3e86ddf2a877e93a26dd))
* **landing:** add hreflang meta tags for en and ko ([312b8d3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/312b8d39eb6b83f6626f67cd719215f2e9e243bc))
* **landing:** add noscript fallback for non-JS crawlers ([d13762e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d13762e9800154cafebd2ef8f92e451beb314df8))
* **landing:** add Playwright-based prerender for SEO ([a440060](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/a4400606f40b85b170b1b7bda6aae1681b6f9587))
* **landing:** add resource hints for Umami analytics ([3a0f847](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3a0f847f0f0c265aae920090bb2367df40984200))
* **landing:** add sitemap.xml and robots.txt ([24a9b95](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/24a9b95e0512a6108bf8e11f02b0f2d0fff39812))
* **landing:** add Umami analytics tracking to footer links ([bee7c9e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/bee7c9e91e9a816d99e01e461153bb48c6461345))
* **landing:** automate store stats for JSON-LD aggregateRating ([#359](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/359)) ([92d085d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/92d085de6ebd533719047f6dabf92a9af6a9d66d))
* **landing:** enhance JSON-LD structured data and expand FAQ ([85c9b87](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/85c9b8741901e65ef7bc91efe9245a223e5cc38e)), closes [hi#intent](https://github.com/hi/issues/intent)
* **landing:** enhance JSON-LD with ratings, features, and FAQ schema ([311ea2f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/311ea2fc0b1d6c89610cad94571af1369e1beffa))
* **landing:** expand i18n to 10 languages and convert toggle to dropdown ([c2ac8dd](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c2ac8ddf9bb9950bdefa66afbdc859802450c6d5))
* **landing:** implement extension landing page ([#349](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/349)) ([88b076a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/88b076a9bdf6b8ffc872381eb72794a0a86fc4c9))
* **landing:** smooth scroll sync, manual offset demo, and platform-aware text ([#351](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/351)) ([6228587](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/62285871162129923b1416efa9f152c8178e328b)), closes [#352](https://github.com/jaem1n207/synchronize-tab-scrolling/issues/352)
* **landing:** update languages badge to 10 and add all hreflang tags ([77f35b1](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/77f35b13731099011168dc00302c9c2e41853f7e))

# [2.9.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.8.3...v2.9.0) (2026-03-10)


### Bug Fixes

* **auto-sync:** stop existing sync before starting new one from suggestion ([71b84d6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/71b84d6122bbe95215428d8cd575df8d0aaf84f3))
* **background:** add deduplication for add-tab suggestion in onUpdated ([e8cbc49](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e8cbc493c59efdad6d55fa334b22d68cba1cafcc))
* **background:** add syncState check in showSyncSuggestion ([6b4af95](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6b4af956d8b2288381742645ecfdcf76940ba52c))
* **background:** await restoreSyncState before initializeAutoSync ([7c32a5b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7c32a5bda7b3a0b213f2df6e4147cb7f5a18f45a))
* **background:** clean up suggestion state on sync start and stop ([604f6ec](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/604f6ec1b7b1c0fe6bf2358f5c8b7f2ce869bd9d))
* **background:** guard onUpdated against showing suggestions for synced tabs ([d915b82](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d915b82c396acf99468b54cbe009be8f42bb885c))
* **dx:** suppress ESLint warnings for ignored skill files ([788b83f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/788b83fcaf73970a47cbb8ef136bceab9599a8b6))
* **panel:** use per-tab sessionStorage and remove cross-tab broadcast ([b18dd52](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b18dd52ac3abfb63d668826c3809bfa64f1186cc))
* **popup:** allow Enter to remove selected domain and fix dialog rounded corners ([93862b6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/93862b667ca34c901383d8fffae30c26e5adea14))
* **popup:** restore search input focus when closing excluded domains dialog ([28cf37e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/28cf37e15f61594f0ec94781c44c5227d4f83e4c))
* **release:** disable AMO release notes and reorder publish plugins ([9db1e1a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9db1e1a16f76228f118a20c4283e606ac067e86c))
* **release:** skip Chrome upload for v2.9.0 re-release ([b6600e3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b6600e3f8cdc3f0d169214302a9faf087bef7816))
* **scroll-sync:** prevent false disconnect status during idle periods ([c3386a0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c3386a0b40d06db41ff188c6f318630ed2ec1557))
* **scroll-sync:** widen programmatic scroll grace period to prevent feedback loops ([c9a96ec](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c9a96ecb62eb7d9e113117175e7a156ea3483208))


### Features

* **auto-sync:** include hasExistingSync context in sync suggestion messages ([8611488](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/861148801eaeb823a685e0e5c5fa790c2174bf97))
* **background:** add suggestion snooze in-memory state ([9a88384](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9a883849d1d72d9e80c56b6715f11ba9c7ec5663))
* **background:** add suggestion snooze in-memory state ([ee2bcf4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ee2bcf44bc9ed463f8f98f1bc1db5597b62c3c45))
* **background:** check domain snooze before showing sync suggestions ([0ae22b0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0ae22b02e66568027118c261f4a37435595ba486))
* **background:** check domain snooze before showing sync suggestions ([c7ae142](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c7ae14226b1619145dc1d888851db42793710cef))
* **background:** integrate permanent domain exclusions into auto-sync ([1b2946a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1b2946a06aae5ddd414f94b8d42407e998636adf))
* **background:** integrate snooze with auto-sync lifecycle ([c80111a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c80111a6947db81d4ebf5ba8125895f6ed49042c))
* **background:** integrate snooze with auto-sync lifecycle ([85a5fc3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/85a5fc3213942580cf93739b5b5e452f76b468ab))
* **contentScripts:** distinguish explicit dismiss from auto-dismiss in toast ([5fe5116](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5fe5116d619edb864a61e9dfddf757def6b0e58f))
* **contentScripts:** distinguish explicit dismiss from auto-dismiss in toast ([55bc0a0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/55bc0a080b782495cfab7daa3c9ba3878e8a5bd0))
* **contentScripts:** forward snooze flag in suggestion toast message handlers ([2d34202](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2d34202ef61f3f00a8ebbe513fa86f308bb968e6))
* **contentScripts:** forward snooze flag in suggestion toast message handlers ([4060dc3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4060dc38e28719a2529b773cf528acdaf2a3feb7))
* **i18n:** add domain exclusion management translations ([2980361](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2980361ba01fe32792f8a5a0a31518287e2ae3f5))
* **i18n:** add existing sync warning and replace button keys for all 9 locales ([16fb828](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/16fb8282503d611107e0c2946ce29b796a5c7274))
* **i18n:** add missing domain exclusion management translations ([6bdf95d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6bdf95dfb19c337373c3c14c18b03bf215df4f2c))
* **lib:** add extractDomainFromUrl utility for domain-level snooze ([851b5c2](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/851b5c23e1146e7087655e4df9d42a545ef92a94))
* **lib:** add extractDomainFromUrl utility for domain-level snooze ([44b6d0e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/44b6d0eca3dafaba8f588dd7033beff88220ffbc))
* **lib:** add suggestion snooze storage functions ([7506a7c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7506a7c5f81e8985e31adc1bb6f30b4033153ad9))
* **lib:** add suggestion snooze storage functions ([8faa954](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8faa954bc13c68112b16f4455ff0dcb99f5d5696))
* **panel:** persist drag position across page reloads ([aa5c2e6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/aa5c2e611773a4eaa2313a88ba16951fb76364b4))
* **popup:** add domain exclusion management UI ([e33c851](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e33c851661432f125132fd0357c51df90d26a291))
* **popup:** add keyboard navigation to excluded domains list ([c21a1aa](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c21a1aa5343124a78411091492780078fdbe6354))
* **popup:** add real-time domain validation preview ([ade6b73](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ade6b739632616675919351ea64a03e41652fbe5))
* **popup:** add two-stage Enter confirmation for domain removal ([c008a1e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c008a1e20afcf26fb68f25bb517ac8d4d75397f9))
* **storage:** add panel position persistence functions ([3275b76](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3275b7699efca17089109a02bcdd932e73512bb1))
* **storage:** add permanent domain exclusion storage and types ([450ee90](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/450ee90015d43ccb56b9333c8afbd3c9437a3c59))
* **toast:** add "don't show again" option to suggestion toasts ([670752e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/670752e4e04e2770159a584c24622f207b6a0cc1))
* **toast:** show existing sync warning and replace button in suggestion toast ([1a10ceb](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1a10ceb53e28ec7533148addc9f224120bcfb6dc))
* **types:** add hasExistingSync context to SyncSuggestionMessage ([b894285](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b894285709fcd3e30b30f44a3bde5a0c8a47acea))
* **types:** add snooze flag to suggestion response messages ([e949e61](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e949e61563495cf44f74a3c13ad871118ae29f82))
* **types:** add snooze flag to suggestion response messages ([e01e123](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e01e12307855ade5b992dd3c4b2704bf81fb08d4))


### Performance Improvements

* **scroll-sync:** cache manual scroll offset to eliminate async storage reads ([757de90](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/757de90733e8b0b5bfd6c4b5887db614ad936647))

# [2.9.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.8.3...v2.9.0) (2026-03-10)


### Bug Fixes

* **auto-sync:** stop existing sync before starting new one from suggestion ([71b84d6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/71b84d6122bbe95215428d8cd575df8d0aaf84f3))
* **background:** add deduplication for add-tab suggestion in onUpdated ([e8cbc49](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e8cbc493c59efdad6d55fa334b22d68cba1cafcc))
* **background:** add syncState check in showSyncSuggestion ([6b4af95](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6b4af956d8b2288381742645ecfdcf76940ba52c))
* **background:** await restoreSyncState before initializeAutoSync ([7c32a5b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7c32a5bda7b3a0b213f2df6e4147cb7f5a18f45a))
* **background:** clean up suggestion state on sync start and stop ([604f6ec](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/604f6ec1b7b1c0fe6bf2358f5c8b7f2ce869bd9d))
* **background:** guard onUpdated against showing suggestions for synced tabs ([d915b82](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d915b82c396acf99468b54cbe009be8f42bb885c))
* **dx:** suppress ESLint warnings for ignored skill files ([788b83f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/788b83fcaf73970a47cbb8ef136bceab9599a8b6))
* **panel:** use per-tab sessionStorage and remove cross-tab broadcast ([b18dd52](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b18dd52ac3abfb63d668826c3809bfa64f1186cc))
* **popup:** allow Enter to remove selected domain and fix dialog rounded corners ([93862b6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/93862b667ca34c901383d8fffae30c26e5adea14))
* **popup:** restore search input focus when closing excluded domains dialog ([28cf37e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/28cf37e15f61594f0ec94781c44c5227d4f83e4c))
* **release:** disable AMO release notes and reorder publish plugins ([9db1e1a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9db1e1a16f76228f118a20c4283e606ac067e86c))
* **scroll-sync:** prevent false disconnect status during idle periods ([c3386a0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c3386a0b40d06db41ff188c6f318630ed2ec1557))
* **scroll-sync:** widen programmatic scroll grace period to prevent feedback loops ([c9a96ec](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c9a96ecb62eb7d9e113117175e7a156ea3483208))


### Features

* **auto-sync:** include hasExistingSync context in sync suggestion messages ([8611488](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/861148801eaeb823a685e0e5c5fa790c2174bf97))
* **background:** add suggestion snooze in-memory state ([9a88384](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9a883849d1d72d9e80c56b6715f11ba9c7ec5663))
* **background:** add suggestion snooze in-memory state ([ee2bcf4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ee2bcf44bc9ed463f8f98f1bc1db5597b62c3c45))
* **background:** check domain snooze before showing sync suggestions ([0ae22b0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0ae22b02e66568027118c261f4a37435595ba486))
* **background:** check domain snooze before showing sync suggestions ([c7ae142](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c7ae14226b1619145dc1d888851db42793710cef))
* **background:** integrate permanent domain exclusions into auto-sync ([1b2946a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1b2946a06aae5ddd414f94b8d42407e998636adf))
* **background:** integrate snooze with auto-sync lifecycle ([c80111a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c80111a6947db81d4ebf5ba8125895f6ed49042c))
* **background:** integrate snooze with auto-sync lifecycle ([85a5fc3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/85a5fc3213942580cf93739b5b5e452f76b468ab))
* **contentScripts:** distinguish explicit dismiss from auto-dismiss in toast ([5fe5116](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5fe5116d619edb864a61e9dfddf757def6b0e58f))
* **contentScripts:** distinguish explicit dismiss from auto-dismiss in toast ([55bc0a0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/55bc0a080b782495cfab7daa3c9ba3878e8a5bd0))
* **contentScripts:** forward snooze flag in suggestion toast message handlers ([2d34202](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2d34202ef61f3f00a8ebbe513fa86f308bb968e6))
* **contentScripts:** forward snooze flag in suggestion toast message handlers ([4060dc3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4060dc38e28719a2529b773cf528acdaf2a3feb7))
* **i18n:** add domain exclusion management translations ([2980361](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2980361ba01fe32792f8a5a0a31518287e2ae3f5))
* **i18n:** add existing sync warning and replace button keys for all 9 locales ([16fb828](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/16fb8282503d611107e0c2946ce29b796a5c7274))
* **i18n:** add missing domain exclusion management translations ([6bdf95d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6bdf95dfb19c337373c3c14c18b03bf215df4f2c))
* **lib:** add extractDomainFromUrl utility for domain-level snooze ([851b5c2](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/851b5c23e1146e7087655e4df9d42a545ef92a94))
* **lib:** add extractDomainFromUrl utility for domain-level snooze ([44b6d0e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/44b6d0eca3dafaba8f588dd7033beff88220ffbc))
* **lib:** add suggestion snooze storage functions ([7506a7c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7506a7c5f81e8985e31adc1bb6f30b4033153ad9))
* **lib:** add suggestion snooze storage functions ([8faa954](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8faa954bc13c68112b16f4455ff0dcb99f5d5696))
* **panel:** persist drag position across page reloads ([aa5c2e6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/aa5c2e611773a4eaa2313a88ba16951fb76364b4))
* **popup:** add domain exclusion management UI ([e33c851](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e33c851661432f125132fd0357c51df90d26a291))
* **popup:** add keyboard navigation to excluded domains list ([c21a1aa](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c21a1aa5343124a78411091492780078fdbe6354))
* **popup:** add real-time domain validation preview ([ade6b73](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ade6b739632616675919351ea64a03e41652fbe5))
* **popup:** add two-stage Enter confirmation for domain removal ([c008a1e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c008a1e20afcf26fb68f25bb517ac8d4d75397f9))
* **storage:** add panel position persistence functions ([3275b76](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3275b7699efca17089109a02bcdd932e73512bb1))
* **storage:** add permanent domain exclusion storage and types ([450ee90](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/450ee90015d43ccb56b9333c8afbd3c9437a3c59))
* **toast:** add "don't show again" option to suggestion toasts ([670752e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/670752e4e04e2770159a584c24622f207b6a0cc1))
* **toast:** show existing sync warning and replace button in suggestion toast ([1a10ceb](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1a10ceb53e28ec7533148addc9f224120bcfb6dc))
* **types:** add hasExistingSync context to SyncSuggestionMessage ([b894285](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b894285709fcd3e30b30f44a3bde5a0c8a47acea))
* **types:** add snooze flag to suggestion response messages ([e949e61](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e949e61563495cf44f74a3c13ad871118ae29f82))
* **types:** add snooze flag to suggestion response messages ([e01e123](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e01e12307855ade5b992dd3c4b2704bf81fb08d4))


### Performance Improvements

* **scroll-sync:** cache manual scroll offset to eliminate async storage reads ([757de90](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/757de90733e8b0b5bfd6c4b5887db614ad936647))

# [2.9.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.8.3...v2.9.0) (2026-03-10)


### Bug Fixes

* **auto-sync:** stop existing sync before starting new one from suggestion ([71b84d6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/71b84d6122bbe95215428d8cd575df8d0aaf84f3))
* **background:** add deduplication for add-tab suggestion in onUpdated ([e8cbc49](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e8cbc493c59efdad6d55fa334b22d68cba1cafcc))
* **background:** add syncState check in showSyncSuggestion ([6b4af95](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6b4af956d8b2288381742645ecfdcf76940ba52c))
* **background:** await restoreSyncState before initializeAutoSync ([7c32a5b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7c32a5bda7b3a0b213f2df6e4147cb7f5a18f45a))
* **background:** clean up suggestion state on sync start and stop ([604f6ec](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/604f6ec1b7b1c0fe6bf2358f5c8b7f2ce869bd9d))
* **background:** guard onUpdated against showing suggestions for synced tabs ([d915b82](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/d915b82c396acf99468b54cbe009be8f42bb885c))
* **dx:** suppress ESLint warnings for ignored skill files ([788b83f](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/788b83fcaf73970a47cbb8ef136bceab9599a8b6))
* **panel:** use per-tab sessionStorage and remove cross-tab broadcast ([b18dd52](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b18dd52ac3abfb63d668826c3809bfa64f1186cc))
* **popup:** allow Enter to remove selected domain and fix dialog rounded corners ([93862b6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/93862b667ca34c901383d8fffae30c26e5adea14))
* **popup:** restore search input focus when closing excluded domains dialog ([28cf37e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/28cf37e15f61594f0ec94781c44c5227d4f83e4c))
* **scroll-sync:** prevent false disconnect status during idle periods ([c3386a0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c3386a0b40d06db41ff188c6f318630ed2ec1557))
* **scroll-sync:** widen programmatic scroll grace period to prevent feedback loops ([c9a96ec](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c9a96ecb62eb7d9e113117175e7a156ea3483208))


### Features

* **auto-sync:** include hasExistingSync context in sync suggestion messages ([8611488](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/861148801eaeb823a685e0e5c5fa790c2174bf97))
* **background:** add suggestion snooze in-memory state ([9a88384](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/9a883849d1d72d9e80c56b6715f11ba9c7ec5663))
* **background:** add suggestion snooze in-memory state ([ee2bcf4](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ee2bcf44bc9ed463f8f98f1bc1db5597b62c3c45))
* **background:** check domain snooze before showing sync suggestions ([0ae22b0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/0ae22b02e66568027118c261f4a37435595ba486))
* **background:** check domain snooze before showing sync suggestions ([c7ae142](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c7ae14226b1619145dc1d888851db42793710cef))
* **background:** integrate permanent domain exclusions into auto-sync ([1b2946a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1b2946a06aae5ddd414f94b8d42407e998636adf))
* **background:** integrate snooze with auto-sync lifecycle ([c80111a](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c80111a6947db81d4ebf5ba8125895f6ed49042c))
* **background:** integrate snooze with auto-sync lifecycle ([85a5fc3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/85a5fc3213942580cf93739b5b5e452f76b468ab))
* **contentScripts:** distinguish explicit dismiss from auto-dismiss in toast ([5fe5116](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5fe5116d619edb864a61e9dfddf757def6b0e58f))
* **contentScripts:** distinguish explicit dismiss from auto-dismiss in toast ([55bc0a0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/55bc0a080b782495cfab7daa3c9ba3878e8a5bd0))
* **contentScripts:** forward snooze flag in suggestion toast message handlers ([2d34202](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2d34202ef61f3f00a8ebbe513fa86f308bb968e6))
* **contentScripts:** forward snooze flag in suggestion toast message handlers ([4060dc3](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/4060dc38e28719a2529b773cf528acdaf2a3feb7))
* **i18n:** add domain exclusion management translations ([2980361](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/2980361ba01fe32792f8a5a0a31518287e2ae3f5))
* **i18n:** add existing sync warning and replace button keys for all 9 locales ([16fb828](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/16fb8282503d611107e0c2946ce29b796a5c7274))
* **i18n:** add missing domain exclusion management translations ([6bdf95d](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/6bdf95dfb19c337373c3c14c18b03bf215df4f2c))
* **lib:** add extractDomainFromUrl utility for domain-level snooze ([851b5c2](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/851b5c23e1146e7087655e4df9d42a545ef92a94))
* **lib:** add extractDomainFromUrl utility for domain-level snooze ([44b6d0e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/44b6d0eca3dafaba8f588dd7033beff88220ffbc))
* **lib:** add suggestion snooze storage functions ([7506a7c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/7506a7c5f81e8985e31adc1bb6f30b4033153ad9))
* **lib:** add suggestion snooze storage functions ([8faa954](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/8faa954bc13c68112b16f4455ff0dcb99f5d5696))
* **panel:** persist drag position across page reloads ([aa5c2e6](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/aa5c2e611773a4eaa2313a88ba16951fb76364b4))
* **popup:** add domain exclusion management UI ([e33c851](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e33c851661432f125132fd0357c51df90d26a291))
* **popup:** add keyboard navigation to excluded domains list ([c21a1aa](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c21a1aa5343124a78411091492780078fdbe6354))
* **popup:** add real-time domain validation preview ([ade6b73](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/ade6b739632616675919351ea64a03e41652fbe5))
* **popup:** add two-stage Enter confirmation for domain removal ([c008a1e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/c008a1e20afcf26fb68f25bb517ac8d4d75397f9))
* **storage:** add panel position persistence functions ([3275b76](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3275b7699efca17089109a02bcdd932e73512bb1))
* **storage:** add permanent domain exclusion storage and types ([450ee90](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/450ee90015d43ccb56b9333c8afbd3c9437a3c59))
* **toast:** add "don't show again" option to suggestion toasts ([670752e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/670752e4e04e2770159a584c24622f207b6a0cc1))
* **toast:** show existing sync warning and replace button in suggestion toast ([1a10ceb](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/1a10ceb53e28ec7533148addc9f224120bcfb6dc))
* **types:** add hasExistingSync context to SyncSuggestionMessage ([b894285](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/b894285709fcd3e30b30f44a3bde5a0c8a47acea))
* **types:** add snooze flag to suggestion response messages ([e949e61](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e949e61563495cf44f74a3c13ad871118ae29f82))
* **types:** add snooze flag to suggestion response messages ([e01e123](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/e01e12307855ade5b992dd3c4b2704bf81fb08d4))


### Performance Improvements

* **scroll-sync:** cache manual scroll offset to eliminate async storage reads ([757de90](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/757de90733e8b0b5bfd6c4b5887db614ad936647))

## [2.8.3](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.8.2...v2.8.3) (2026-01-10)


### Bug Fixes

* update manifest to include package type and adjust web accessible resources for Firefox compatibility ([45ec8f9](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/45ec8f9a59e65dc8c0c5c6e9e736c4b6478a959a))

## [2.8.2](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.8.1...v2.8.2) (2026-01-10)


### Bug Fixes

* update control key representation in SyncControlPanel to use platform-specific values from useModifierKey hook ([cef461b](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/cef461bf1c47b79454175e5683256dd8b43180c9))

## [2.8.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.8.0...v2.8.1) (2026-01-08)


### Bug Fixes

* replace select all and clear all handlers with a unified toggle all tabs handler in ActionsMenu and ScrollSyncPopup ([8665906](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/866590615ad7515faf393fa761e257cdadfed64b))

# [2.8.0](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.7.4...v2.8.0) (2026-01-07)


### Features

* implement locale-aware URL synchronization and add tests for locale utilities ([36bc7a0](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/36bc7a07cf81c85f36b81b0fbfe2e59efabe87cf))

## [2.7.4](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.7.3...v2.7.4) (2025-12-17)


### Bug Fixes

* firefox support and modify manifest for compatibility ([3f2c10c](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/3f2c10c52d60c4b8525660162ee1d9acf8fb94c1))

## [2.7.3](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.7.2...v2.7.3) (2025-12-17)


### Bug Fixes

* remove 'activeTab' permission from manifest ([dfe9ca1](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/dfe9ca1d07543be4d94f0c168b2ae10d7cf2f4a3))

## [2.7.2](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.7.1...v2.7.2) (2025-12-17)


### Bug Fixes

* update icon paths in manifest for consistency ([5ab5304](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/5ab530498f6e3988c6c65fb6d8119b47c00577c8))

## [2.7.1](https://github.com/jaem1n207/synchronize-tab-scrolling/compare/v2.7.0...v2.7.1) (2025-12-17)


### Bug Fixes

* correct icon paths and shorten description for chrome web store ([766043e](https://github.com/jaem1n207/synchronize-tab-scrolling/commit/766043e7b878834307c4f86a0583609359ef856a))

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
