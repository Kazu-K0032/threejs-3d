import { defineConfig } from 'vitest/config';

// テストピラミッドの下の 2 層（単体・結合）を Vitest で動かす。E2E は Playwright（playwright.config.js）で動かす
export default defineConfig({
  test: {
    environment: 'happy-dom',
    setupFiles: ['tests/setup.js'],
    include: ['tests/unit/**/*.test.js', 'tests/integration/**/*.test.js'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      // WebGL のレンダラーを作る 2 ファイルは Node では動かないため、E2E で確かめる
      exclude: ['src/main.js', 'src/scene/stage.js'],
      reporter: ['text', 'html'],
      // 完了の基準（docs/strategies/test-strategy.md）。測った値（命令 99.7%・分岐 94.7%）から、少し余裕を持たせている
      thresholds: { statements: 95, branches: 85, functions: 95, lines: 95 },
    },
  },
});
