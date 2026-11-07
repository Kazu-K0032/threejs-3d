---
status: "提案中"
date: 2026-11-07
type: "新規の選定・方針"
---

# ADR 2026-11-07: lint-and-format-tools: Lint に oxlint、整形に oxfmt を使う

編集のたびに Claude が自動で整形と Lint を動かす仕組み（`lefthook.yml` の `claude-edit`）に載せるツールを決める必要があった。JavaScript の既存の設定ファイルは無く、整形と Lint を 1 つで扱う Biome、oxlint と oxfmt、Prettier と ESLint を候補に比べた。

Lint に oxlint、整形に oxfmt を使うと決めた。選んだ理由は、[利用者が選んだ理由を書く。会話では述べられていないため、空けてある]。Lint が警告でも失敗にできることは、公式の文書で確かめてある。この仕組みは、失敗した結果だけを Claude に返すため、警告で終了コードが 0 以外になることが要る。

> Ensure warnings produce a non-zero exit code（警告があれば、終了コードを 0 以外にする）

引用: [oxlint の CLI](https://oxc.rs/docs/guide/usage/linter/cli.html)（`--deny-warnings`）

導入時に推奨した Biome と、Prettier と ESLint は採らなかった。[見送った理由を書く。会話では述べられていないため、空けてある]。oxfmt は 0.77.0 で 1.0 未満であり、公式の文書から安定度を確認できていない。この点は受け入れた。版の範囲は `^0.77.0` で、0.x のため 0.77 系に限られる。
