#!/usr/bin/env bash
# PostToolUse hook: Edit / Write 後に、編集したファイルへプロジェクトの Lint・整形をかける。
# どのツールを使うかは lefthook.yml の claude-edit に書き、このフックは lefthook を呼ぶだけにする。
# ツールはプロジェクトごとに違うため、フックにはツール名を書かない。
# 整形のツールはファイルを書き換え、Lint のツールは問題があれば失敗で終える。失敗した結果だけを Claude へ返す（ブロックしない）。
# PostToolUse では、exit 0 の素の stdout・stderr は Claude に渡らない（debug ログに残るだけ）ため、JSON で返す。
#
# カスタマイズ方針:
#   - ツールは lefthook.yml の claude-edit に足す。このフックは変えない。
#   - TARGET_PREFIX に検査対象のパス接頭辞を指定する。全体を対象にするなら "" のまま。

set -euo pipefail

# --- プロジェクト固有の設定 ---------------------------------------------
TARGET_PREFIX=""
# ------------------------------------------------------------------------

report=""

# ためた報告を Claude へ返して終了する
finish() {
  if [ -n "$report" ]; then
    jq -n --arg ctx "$report" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $ctx}}'
  fi
  exit 0
}

input=$(cat)
file_path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // empty')
[ -z "$file_path" ] && exit 0

# 絶対パスが渡された場合はリポジトリルートからの相対パスに変換する。
# Windows（Git Bash）では C:\... の形で渡り、git も C:/... の形で返すため、区切りを / にそろえてから比べる
repo_root="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
file_path="${file_path//\\//}"
case "$file_path" in
  "$repo_root"/*) file_path="${file_path#"$repo_root"/}" ;;
  # リポジトリ外のファイル（~/.claude 配下など）は、このリポジトリの設定で検査しない
  /* | [A-Za-z]:/*) exit 0 ;;
esac

# 対象外のパスは何もしない
if [ -n "$TARGET_PREFIX" ] && ! printf '%s' "$file_path" | grep -q "^$TARGET_PREFIX"; then
  exit 0
fi

# 生成物・依存パッケージは検査しない
if printf '%s' "$file_path" | grep -qE '(^|/)(node_modules|vendor|dist|build)/'; then
  exit 0
fi

# --- lefthook（プロジェクトの Lint・整形） --------------------------------

# 設定・claude-edit の定義・lefthook のどれかが無ければ、黙って終える（環境差で毎回警告を出さない）
config=""
for name in lefthook.yml lefthook.yaml .lefthook.yml .lefthook.yaml; do
  if [ -f "$repo_root/$name" ]; then
    config="$repo_root/$name"
    break
  fi
done
[ -n "$config" ] || exit 0
grep -q '^claude-edit:' "$config" || exit 0

if command -v lefthook >/dev/null 2>&1; then
  lefthook="lefthook"
elif [ -x "$repo_root/node_modules/.bin/lefthook" ]; then
  lefthook="$repo_root/node_modules/.bin/lefthook"
else
  exit 0
fi

# lefthook run は既定で、設定の変化を見て .git/ の下を書き換える（フックの入れ直し）。
# .git/ の書き換えは人が行うため、--no-auto-install で止める。出力は、失敗したコマンドとその出力だけにする
if ! result=$(cd "$repo_root" && LEFTHOOK_OUTPUT=failure,execution_out "$lefthook" run claude-edit --no-auto-install --file "$file_path" 2>&1); then
  report+="⚠️  lefthook claude-edit: $file_path"$'\n'"$result"$'\n'
fi

finish
