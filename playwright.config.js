import { defineConfig } from '@playwright/test';

// テストピラミッドの最上層（E2E）。手元の Chrome を使い、ブラウザ本体は取得しない。
// 3D の描画には WebGL が要るため、GPU が無い環境でも動くソフトウェア描画（SwiftShader）を許可する。
// ソフトウェア描画は 1 fps ほどなので、待ち時間を長めに取る
export default defineConfig({
  testDir: 'tests/e2e',
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    channel: 'chrome',
    viewport: { width: 1440, height: 900 },
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'npm run dev -- --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
});
