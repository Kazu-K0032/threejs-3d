#!/usr/bin/env bash
# PreToolUse hook: 破壊的コマンドを検出し承認をエスカレーションする。
# データ消失・課金影響・履歴破壊を伴う操作を対象にする。
# rm・git clean・git push --force は settings.json の deny でも止めているが、deny はルールの形に
# 当たるコマンドしか止めず、bash -c などを経由した実行は止まらない。そのため、ここでも検出する。
# Bash・PowerShell・Monitor のツールから呼ぶ（settings.json の matcher）。どれもコマンドは tool_input.command に入る。
# Monitor はコマンドを裏で動かし続けるツールで、Bash と同じシェルで動く。WebSocket を見張る形にはコマンドが無く、素通りさせる。
#
# カスタマイズ方針:
#   プロジェクト固有の破壊的操作（クラウド CLI の delete 系・本番ホストへの SSH 等）は
#   下部の patterns 配列に追記する。判定は grep -iE の正規表現で行う。
#   当てる先は、引用符・バッククォート・\ を取り除いたコマンドにする。パターンには引用符を書かない。
#   PowerShell はコマンド名・オプションの大文字小文字を区別しないため、大文字小文字を区別せずに判定する。

# エラーで即座に止めるための厳格モード
set -euo pipefail

# 判定できないときは、承認に回す。exit 2 以外で失敗すると、Claude Code は操作をそのまま進めるため。
# jq が無くても返せるよう、JSON は printf で組む
ask_fallback() {
  printf '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"ask","permissionDecisionReason":"guard-destructive.sh: %s。削除・変更される対象を列挙し、実データを含まないか確認してから承認すること。"}}\n' "$1"
  exit 0
}
trap 'ask_fallback "判定の途中で失敗した"' ERR

# 渡された JSON からコマンド文字列を取り出し、コマンドが無ければ即座に素通りさせる。
# jq が無いと取り出せないため、JSON 全体に patterns を当て、当たったものだけ承認に回す。全コマンドで承認を求めると、確かめずに承認する癖がつくため。
# JSON の中では改行・タブが \n・\t と書かれ、直後の語とつながるため、空白に戻してから当てる
input=$(cat)
if command -v jq >/dev/null 2>&1; then
  command=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
  [ -z "$command" ] && exit 0
else
  command=$(printf '%s' "$input" | sed 's/\\[nrt]/ /g')
fi

# 照合には、引用符・バッククォート・\ を取り除いた文字列を使う。rm "-rf"・"rm" -rf・r\m のように、シェルが同じ語にする形も検出するため
normalized=$(printf '%s' "$command" | tr -d "\"'\`\\\\")
# git とサブコマンドの間に置けるオプション（-C <場所>・-c <設定>・--git-dir=<場所>・--no-pager など）を除く。
# git -C . restore のように挟むと、git restore の形のパターンに当たらず、確認なしで通るため
normalized=$(printf '%s' "$normalized" | sed -E 's/(^|[^[:alnum:]_-])[Gg][Ii][Tt](([[:space:]]+(-C|-c|--git-dir|--work-tree|--namespace|--config-env)([[:space:]]+|=)[^[:space:];&|]+)|([[:space:]]+(-p|-P|--paginate|--no-pager|--bare|--no-replace-objects|--no-optional-locks|--literal-pathspecs|--glob-pathspecs|--noglob-pathspecs|--icase-pathspecs)))+([[:space:]]|$)/\1git\8/g')

patterns=(
# -r・-R・-f（--recursive・--force）のどれかが付いた rm。再帰削除・強制削除はファイル復元ができない
# オプションはファイル名の後ろにも置けるため、同じコマンドの中（; & | の手前まで）を探す
'(^|[^[:alnum:]_-])rm[[:space:]]+([^;&|]*[[:space:]])?(-[a-zA-Z]*[rRf][a-zA-Z]*|--recursive|--force)([[:space:]]|$)'
# PowerShell の Remove-Item と、その別名（ri・del・erase・rd・rmdir）に -Recurse・-Force が付いたもの。
# PowerShell はオプションを先頭の数文字に略せる（-r・-fo など）ため、略した形も含める。-Recurse:$true の形も当たる
# 略した形の recu・forc は辞書に無い語のため、PR のスペルチェック（cspell）が誤字として出す。検出から外す。cspell:ignore recu forc
'(^|[^[:alnum:]_-])(remove-item|ri|del|erase|rd|rmdir)[[:space:]]+([^;&|]*[[:space:]])?-(r|re|rec|recu|recur|recurs|recurse|fo|for|forc|force)([[:space:]:]|$)'
# ステージング・ワーキングツリーをコミットに強制リセットする。未コミット変更が消える
'git[[:space:]]+reset[[:space:]]+--hard'
# 未コミットの変更を作業ツリーから戻す。消した変更は履歴に残らず、戻せない。
# ブランチを切り替えるだけの checkout・switch は当てない。ファイル名だけを渡す形（git checkout a.txt）はブランチ名と見分けられず、当たらない。
# restore は --staged だけの形（ステージから外すだけ）も当たる
'git[[:space:]]+checkout[[:space:]]+([^;&|]*[[:space:]])?(--|\.|-[a-zA-Z]*f[a-zA-Z]*|--force)([[:space:]]|$)'
'git[[:space:]]+switch[[:space:]]+([^;&|]*[[:space:]])?(-[a-zA-Z]*f[a-zA-Z]*|--force|--discard-changes)([[:space:]]|$)'
'git[[:space:]]+restore([[:space:]]|$)'
# Git の設定を書き換える。core.hooksPath などで、フックを外せる。Edit(./.git/**) の deny は git コマンドに効かないため、ここで見る。
# 値を書く形（キーと値の 2 つを渡す）と、消す・足す・開いて直すオプションに当てる。読むだけの形（git config user.name）は当てない
'git[[:space:]]+config([[:space:]]+-[^[:space:];&|]+)*[[:space:]]+[^-[:space:];&|][^[:space:];&|]*[[:space:]]+[^-[:space:];&|]'
'git[[:space:]]+config[[:space:]]+([^;&|]*[[:space:]])?(--unset|--unset-all|--add|--replace-all|--edit|-e|--rename-section|--remove-section)([[:space:]]|$)'
# 未追跡ファイルを強制削除する。-f で復元できないファイルが消える
'git[[:space:]]+clean[[:space:]]+-[a-zA-Z]*f'
# リモートブランチを強制上書きする。他者のコミットや履歴が失われる
'git[[:space:]]+push[[:space:]].*(--force|--force-with-lease|-f)'
)

for p in "${patterns[@]}"; do
if printf '%s' "$normalized" | grep -qiE "$p"; then
    command -v jq >/dev/null 2>&1 || ask_fallback "jq が無く、コマンドを取り出せなかった。破壊的な操作の可能性がある"
    jq -n --arg cmd "$command" '{
    hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: ("破壊的操作の可能性: " + $cmd + "\n削除・変更される対象を列挙し、実データ（本番環境・データベース等）を含まないか確認してから承認すること。")
    }
    }'
    exit 0
fi
done
exit 0
