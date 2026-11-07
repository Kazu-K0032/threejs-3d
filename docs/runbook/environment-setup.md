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
