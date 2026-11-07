# 環境構築

## 動かし方

```bash
npm install
npm run dev
```

ブラウザで表示された URL（既定は `http://localhost:5173/`）を開く。

## 編集後の Lint・整形

Claude が `.js`・`.mjs`・`.css` を編集すると、フック（`.claude/hooks/post-edit-lint.sh`）が [`lefthook.yml`](../../lefthook.yml) の `claude-edit` を動かす。整形は `oxfmt`、Lint は `oxlint` で、設定は [`.oxfmtrc.json`](../../.oxfmtrc.json) と [`.oxlintrc.json`](../../.oxlintrc.json) に置く。

- 前提：`bash`・`jq`・`lefthook`（1.6.11 以降）が PATH にあること。無いと、フックは何もしない
- 全体の検査：`npm run lint`（警告も失敗にする）と `npm run format:check`。整形の対象は、フックと同じ `.js`・`.mjs`・`.css` だけ
- 全体の整形：`npm run format`（複数のファイルを書き換えるため、単独のコミットに分ける）
- コミットメッセージの検査（commitlint）は、人が `lefthook install` を実行した後のコミットから動く

## テスト

方針と、層ごとの役割は [テスト戦略](../strategies/test-strategy.md) にある。テストは `tests/` に置く。

```text
tests/
├── unit/          # 単体テスト（Vitest）
├── integration/   # 結合テスト（Vitest）
├── e2e/           # E2E テスト（Playwright）
├── helpers/       # 共通の部品（タスクの複製・時間を進める関数・index.html の読み込み）
└── setup.js       # canvas の代用品
```

| コマンド | 内容 |
| --- | --- |
| `npm test` | 単体・結合テストを 1 回流す（5 秒ほど） |
| `npm run test:watch` | ファイルを保存するたびに、関係するテストを流す |
| `npm run test:coverage` | カバレッジを測り、`vitest.config.js` の下限を下回ると失敗にする。HTML のレポートは `coverage/` に出る |
| `npm run test:e2e` | 実際の Chrome で画面を操作する（1 分半ほど） |

- 前提（E2E）：Google Chrome が入っていること。Playwright は、ブラウザ本体を取得せず、手元の Chrome（`channel: 'chrome'`）を使う
- 開発サーバーは、E2E が起動する。すでに `npm run dev` で起動していれば、そのサーバー（5173 番）を使う
- 3D の描画は、GPU が無くても動くソフトウェア描画（SwiftShader）にしている。1 fps ほどしか出ないため、E2E では運搬やカメラの移動を、ページの中で早送りする
- `window.__app` は、開発サーバーのときだけ公開される。ビルドした画面には含まれない
- 生成物（`coverage/`・`test-results/`・`playwright-report/`）は、Git・Lint・整形の対象外
