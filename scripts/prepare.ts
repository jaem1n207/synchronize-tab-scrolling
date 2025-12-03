// generate stub index.html files for dev entry
import { execSync } from 'node:child_process';

import chokidar from 'chokidar';
import { transform } from 'esbuild';
import fs from 'fs-extra';

import { isDev, log, port, r } from './utils';

/**
 * Stub index.html to use Vite in development
 */
async function stubIndexHtml() {
  const views = ['popup'];

  for (const view of views) {
    await fs.ensureDir(r(`extension/dist/${view}`));
    let data = await fs.readFile(r(`src/${view}/index.html`), 'utf-8');
    data = data
      .replace(
        '</head>',
        '<script type="module" src="/dist/refreshPreamble.js"></script><script type="module" src="/dist/themeSync.js"></script><script type="module" src="/dist/dynamicLoadScript.js"></script></head>',
      )
      .replace('"./main.tsx"', `"http://localhost:${port}/${view}/main.tsx"`)
      .replace('<div id="app"></div>', '<div id="app">Vite server did not start</div>');
    await fs.writeFile(r(`extension/dist/${view}/index.html`), data, 'utf-8');
    log('PRE', `stub ${view}`);
  }
}

async function copyLocaleFolder() {
  await fs.copy(r('src/shared/i18n/_locales'), r('extension/_locales'));
  log('PRE', 'copy _locales');
}

// This enables hot module reloading
async function writeRefreshPreamble() {
  const data = `
    import RefreshRuntime from "http://localhost:${port}/@react-refresh";
    RefreshRuntime.injectIntoGlobalHook(window);
    window.$RefreshReg$ = () => {};
    window.$RefreshSig$ = () => (type) => type;
    window.__vite_plugin_react_preamble_installed__ = true;
  `;

  await fs.ensureDir(r('extension/dist'));
  const { code } = await transform(data, { minify: true });
  await fs.writeFile(r('extension/dist/refreshPreamble.js'), code, 'utf-8');
}

async function writeThemeSyncScript() {
  const data = `
    var e = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    var themeItem = localStorage.getItem('theme');
    var t = themeItem ? JSON.parse(themeItem).state.theme : 'system';
    if ('dark' === t || (e && 'light' !== t)) {
      document.documentElement.classList.toggle('dark', true);
    }

    var DEFAULT_CONFIG = { theme: 'neutral', radius: 0.5 };
    var configItem = localStorage.getItem('config');
    var config = configItem ? JSON.parse(configItem) : DEFAULT_CONFIG;
    var { theme, radius } = config;
    document.body.classList.add(\`theme-\${theme}\`);
    document.body.style.setProperty('--radius', \`\${radius}rem\`);
  `;

  await fs.ensureDir(r('extension/dist'));
  const { code } = await transform(data, { minify: true });
  await fs.writeFile(r('extension/dist/themeSync.js'), code, 'utf-8');
  log('PRE', 'write theme settings script');
}

async function dynamicLoadScript() {
  const data = `
    const QUERY = '(prefers-reduced-motion: reduce)';
    const prefersReducedMotionQuery = window.matchMedia(QUERY);
    
    const handleReduceMotionChange = async () => {
      if (prefersReducedMotionQuery.matches) {
        await import('/dist/prefersReducedMotion.js');
      }
    };
    
    handleReduceMotionChange();

    prefersReducedMotionQuery.addEventListener('change', handleReduceMotionChange);
  `;
  await fs.ensureDir(r('extension/dist'));
  const { code } = await transform(data, { minify: true });
  await fs.writeFile(r('extension/dist/dynamicLoadScript.js'), code, 'utf-8');
  log('PRE', 'write dynamic load script');
}

async function writePrefersReducedMotionScript() {
  const data = `
    const handleReduceMotionChange = () => {
      const QUERY = '(prefers-reduced-motion: reduce)';
      const prefersReducedMotionQuery = window.matchMedia(QUERY);
      let styleElement = null;
    
      const applyStyles = () => {
        if (styleElement) return;
        styleElement = document.createElement('style');
        styleElement.textContent = \`* {-webkit-animation-duration: 0.01ms !important;animation-duration: 0.01ms !important;-webkit-animation-iteration-count: 1 !important;animation-iteration-count: 1 !important;-webkit-transition-duration: 0.01ms !important;-o-transition-duration: 0.01ms !important;transition-duration: 0.01ms !important;scroll-behavior: auto !important;}\`;
        document.head.appendChild(styleElement);
      };
    
      const removeStyles = () => {
        if (!styleElement) return;
        document.head.removeChild(styleElement);
        styleElement = null;
      };
    
      const toggleReduceMotion = (event) => {
        if (event.matches) {
          applyStyles();
        } else {
          removeStyles();
        }
      };
    
      prefersReducedMotionQuery.matches && applyStyles();
    
      prefersReducedMotionQuery.addEventListener('change', toggleReduceMotion);
    };
    
    handleReduceMotionChange();
  `;

  await fs.ensureDir(r('extension/dist'));
  const { code } = await transform(data, { minify: true });
  await fs.writeFile(r('extension/dist/prefersReducedMotion.js'), code, 'utf-8');
  log('PRE', 'write prefers reduced motion script');
}

function writeManifest() {
  execSync('npx esno ./scripts/manifest.ts', { stdio: 'inherit' });
}

writeManifest();
copyLocaleFolder();
dynamicLoadScript();
writeThemeSyncScript();
writePrefersReducedMotionScript();

if (isDev) {
  writeRefreshPreamble();
  stubIndexHtml();
  chokidar.watch(r('src/**/*.html')).on('change', () => {
    stubIndexHtml();
  });
  chokidar.watch([r('src/manifest.ts'), r('package.json')]).on('change', () => {
    writeManifest();
  });
}
