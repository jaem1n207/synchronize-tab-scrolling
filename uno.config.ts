import unocssPresetWind4 from '@unocss/preset-wind4';
import {
  defineConfig,
  presetAttributify,
  presetIcons,
  transformerDirectives,
  type Preset,
} from 'unocss';
import { presetAnimations } from 'unocss-preset-animations';
import { builtinColors, presetShadcn } from 'unocss-preset-shadcn';

export default defineConfig({
  presets: [
    unocssPresetWind4({
      preflights: {
        reset: true,
      },
    }) as Preset,
    presetAttributify(),
    presetIcons(),
    presetAnimations(),
    presetShadcn(builtinColors.map((c) => ({ color: c }))),
  ],
  rules: [
    // timing function credit: https://www.joshwcomeau.com/animation/css-transitions/#custom-curves-7
    [
      /**
       * @example
       * ```html
       * <div class="animate-ease-out"></div>
       * ```
       */
      /^animate-(ease-out|ease-in-out|ease-in|ease)$/,
      (match) => {
        const timing = {
          'ease-out': 'cubic-bezier(0.215, 0.61, 0.355, 1)',
          'ease-in': 'cubic-bezier(0.75, 0, 1, 1)',
          'ease-in-out': 'cubic-bezier(0.645, 0.045, 0.355, 1)',
          ease: 'cubic-bezier(0.44, 0.21, 0, 1)',
        }[match[1]];

        return {
          'animation-timing-function': timing,
        };
      },
    ],
    [
      /**
       * @example
       * ```html
       * <div class="z-header"></div>
       * ```
       */
      /^z-(header|tooltip)$/,
      (match) => {
        const z = {
          header: 50,
          tooltip: 100,
        }[match[1]];

        return {
          'z-index': z,
        };
      },
      {
        autocomplete: 'z-(header|tooltip)',
      },
    ],
    [
      /**
       * @example
       * ```html
       * <div className="p-0-4-6-2"></div>
       * ```
       */
      /^(p|m)-(\d+)-(\d+)?-?(\d+|auto)?-?(\d+|auto)?$/,
      (match) => {
        const [, PaddingOrMargin, t, r, b, l] = match as [
          unknown,
          'p' | 'm',
          number,
          number,
          number | 'auto',
          number | 'auto',
        ];

        const isPadding = PaddingOrMargin === 'm' ? false : (true as boolean);

        const List: string[] = [];
        for (const e of [t, r, b, l].filter(Boolean)) {
          if (!e || e === 'auto') {
            List.push('auto');
          } else List.push(`${Number(e) / 4}rem`);
        }

        return isPadding ? { padding: List.join(' ') } : { margin: List.join(' ') };
      },
      { autocomplete: 'p|m-<num>-<num>-<num>-<num>' },
    ],
    [
      /**
       * @example
       * ```html
       * <div className="flex|1|0|120px">flex grow shrink basis flex: 1 0 7.5rem;</div>
       * ```
       */
      /^flex\|([0-9])\|([0-9])\|?([a-z0-9%]{2,})?$/,
      (match) => {
        const [, grow, shrink] = match as [unknown, number, number];
        let basis = match[3];

        if (Number(basis) && !basis.includes('%')) {
          basis &&= `${Number(basis) / 4}rem`;
        }
        basis ??= 'auto';

        return {
          flex: `${grow} ${shrink} ${basis}`,
        };
      },
    ],
  ],
  transformers: [transformerDirectives()],
});
