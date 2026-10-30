import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const base = '/sand-bucket/';
const buildId = randomUUID();

function offline(): Plugin {
  return {
    name: 'offline-game',
    apply: 'build',
    transformIndexHtml() {
      return [{ tag: 'meta', attrs: { name: 'sand-bucket-build', content: buildId }, injectTo: 'head' }];
    },
    generateBundle(_, bundle) {
      const publicFiles = ['icon.svg', 'icon-192.png', 'icon-512.png', 'manifest.webmanifest'];
      const files = [...new Set(['index.html', ...Object.keys(bundle), ...publicFiles])];
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: readFileSync(new URL('./scripts/service-worker.js', import.meta.url), 'utf8')
          .replace('__OFFLINE_CONFIG__', JSON.stringify({ BUILD_ID: buildId, BASE: base, FILES: files.map(file => base + file) })),
      });
    },
  };
}

export default defineConfig({ base, define: { __BUILD_ID__: JSON.stringify(buildId) }, plugins: [offline()] });
