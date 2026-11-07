---
paths:
  - ".claude/settings.json"
  - ".claude/settings.local.json"
  - ".claude/hooks/**"
---

# 権限の設定（deny・フック）に関するルール

このリポジトリでは、Claude に任せる操作と、人が行う操作を分けている。`.claude/settings.json` の `permissions.deny`（Claude が実行できない操作の一覧）とフックは、この線引きを仕組みで守るためのもの。deny やフックを足す・外すときは、この線引きに当てて決める。

## 線引きの考え方

次の順に当てて、禁止するか許可するかを決める。

1. 削除・権限の変更・コミット・push は禁止する
1. 取り消せない操作のうち、間違えたときに深刻なもの（マージ・承認・リリース・ワークフローの実行など）は禁止する
1. それ以外は許可する

| 禁止する操作 | 理由 |
| --- | --- |
| 削除 | 消したものは履歴を追えず、Claude に任せて席を外していると、消えたことに気づけないため |
| 権限の変更 | 間違えると、ほかの人やほかのサービスにまで影響が広がるため |
| コミット | 履歴に残す内容は、人が最後に確かめて決めるため。Claude がコミットすると共同作成者の行が付くことがあり、push した後は履歴を書き換えないと消せない |
| push | ほかの人へ共有するタイミングは、人が決めるため |

Issue・PR・コメント・ブランチの作成は許可している。意図しない内容ができても、消せば戻せるため。止めると、それを使うスキルが動かなくなる。

## 許可する操作と禁止する操作

| 対象 | 許可する | 禁止する |
| --- | --- | --- |
| 手元のファイル | 読み取り・作成・編集 | 削除、秘匿ファイル（`.env` など）の読み取り |
| Git | ブランチ・タグの作成、`git fetch`、`git add` | コミット、push、`git remote`、ブランチ・タグ・stash の削除、`.git/` の直接の書き換え |
| Issue・PR | 作成、コメント、本文・ラベル・担当者の更新、クローズ | 削除、マージ、レビュー（承認） |
| GitHub のそのほか | 読み取り | リリース、ワークフローの実行（コメント・ラベルで起動するものを含む）、リポジトリの作成・設定変更・削除、secrets・variables・鍵・ログインの変更 |
| 外部ツール | 読み取り | リモートへの反映・取り込み（`clasp push` など）、ログイン |
| データベース | 手元の開発用の DB の読み書き | 共有・本番の DB への書き込み |
| MCP のツール | 読み取り | 秘密の読み出し（ブラウザの保存領域・ログイン状態を保存したファイルなど） |

- `git remote` は、読み取りも止めている。変更のサブコマンドを並べると、抜けが出やすいため。リモートの URL は `gh repo view` で確かめる
- `gh release`・`gh ssh-key`・`gh gpg-key` も、同じ理由で読み取り（`view`・`list`）まで止めている。別名（`gh release new`）や、オプションを前に置く形（`gh release -R <リポジトリ> create`）で抜けが出やすいため。読み取りは `gh api` で行う（例：`gh api repos/{owner}/{repo}/releases/latest`・`gh api user/keys`）
- 外部ツールの禁止は、deny に入れていない。使うツールが決まったら、deny に足す。Terraform と clasp は、`/project:terraform`・`/project:gas` が配るフックで止める
- `attribution` の `commit`・`pr` を空文字にし、コミットと PR の本文に Claude の署名行を付けない。コミットの禁止を外しても、Claude の名前が履歴に残らないようにするため

## deny を足す・外す場合

- 足すときも外すときも、上の「線引きの考え方」に当てて決める
- 外すと、Claude もその操作をできるようになる。削除・コミット・push の deny を外す前に、利用者に確かめる
- GitHub Actions で動く Claude App（Issue のコメントなどで動く bot）に作業ブランチへのコミット・push を任せるときも、このファイルの deny は外さない。ワークフローが、ランナーの中だけで `git commit`・`git push` の deny を外す。マージ・承認・リリースは、bot に任せず人が行う。人が頼んで動き、結果を PR で人が確かめる仕組みのため
- 実行前の確認（許可プロンプト）を減らしたいだけなら、deny は変えず、`.claude/settings.local.json` の `permissions.allow` に足す
- 秘匿ファイルの deny（`Read(./.env)` など）は、このリポジトリの秘匿ファイルの置き場所に合わせて足す
- Terraform の秘匿ファイル（変数の値・state など）の deny は、`/project:terraform` が足す。clasp の認証情報の deny は、`/project:gas` が足す
- deny は、ルールの形に当たるコマンドしか止められない（例：`bash -c 'rm …'` は止まらない）。deny で止まらない操作も、この線引きに従う
- `Bash(...)` の規則は、PowerShell のツールには効かない。そのため、`git`・`gh` の deny は `PowerShell(...)` の形でも同じ数だけ置く。削除のコマンドは別名（`rm`・`del`・`rmdir`・`rd`・`ri`・`erase`・`Remove-Item`）も置く。足す・外すときは、`Bash(...)` と `PowerShell(...)` の組でそろえる
- `Bash(...)` の規則は、`Monitor`（コマンドを裏で動かし続けるツール）にも効く。`Monitor` のための deny は足さなくてよい
- コメントやラベルで動くワークフロー（`/deploy` などの起動語）があれば、起動語を含む `gh pr comment`・`gh issue comment`・`gh api` を deny に足す。ワークフローの実行と同じく、間違えると深刻なため
- MCP のツールで秘密を読めるなら、そのツール名（`mcp__<サーバー>__<ツール>`）を deny に足す。`Read` の deny は MCP のツールには効かないため
- 共有・本番の DB に繋ぐなら、接続の既定を読み取り専用にする（例：PostgreSQL は `env` の `PGOPTIONS` に `-c default_transaction_read_only=on`）。deny はコマンドの形しか見ず、SQL の中身では止められないため

## 読ませたくないファイルがある場合

- 大きな生成物（自動生成のコード・図など）は、deny ではなく `permissions.ask` に `Read(...)` を足す。勝手に読まれてコンテキスト（Claude が一度に扱える量）を埋めることがなく、要るときは人が許して読めるため

## フックを配線する場合

- コマンドを見るフック（PreToolUse）は、`matcher` を `Bash|PowerShell|Monitor` にする。足りないと、PowerShell のツールや `Monitor` で打ったコマンドを見逃すため
- ガードは、判定できないとき（`jq` が無いなど）に止める側へ倒す（承認に回す・止める）。2 以外の終了コードで失敗すると、操作がそのまま進むため。`onFailure: "block"` は使わない。フックが起動できない環境で、すべてのコマンドが止まるため
- フックは `bash` で動くため、Git Bash の無い Windows では動かない。フックで止まらない操作も、上の線引きに従う
- `guard-git-write.sh` は、`git commit`・`git push` と、`gh` での Issue・PR などの作成・更新・クローズ・マージ・削除を止める。既定では `settings.json` に登録していない
- 登録すると、Issue・PR の作成・更新も止まり、それを使うスキル（`/aidd:issue-start` など）が途中で止まる。登録するのは、Issue・PR の操作を人が行うと決めたリポジトリだけにする
- `guard-destructive.sh` は、破壊的なコマンドを見つけて承認を求める。このプロジェクト固有の破壊的な操作は、`patterns` に足す。`patterns` は大文字小文字を区別せずに当てる。PowerShell は区別しないため
- `post-edit-lint.sh` は、編集したファイルに `lefthook.yml` の `claude-edit` をかける。`lefthook run` は既定で `.git/` の下を書き換えるため、`--no-auto-install` を付けて呼ぶ。外さない
- `guard-terraform.sh`（`/project:terraform` が配る）は、Claude が Terraform でインフラや state を変えるコマンドを止める。反映は人が行うため
- `guard-clasp.sh`（`/project:gas` が配る）は、Claude が clasp で Apps Script 側へ反映・取り込み・認証をするコマンド（`push`・`pull`・`login` など）を止める。反映は人が行うため
