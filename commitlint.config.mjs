// Conventional Commits 準拠のコミットメッセージ検証設定。
// Ref: https://commitlint.js.org/reference/rules-configuration.html
// ルール設定: 0=off, 1=warn, 2=error
// Ref: https://commitlint.js.org/reference/rules-configuration.html#rules-configuration

export default {
  // config-conventional のデフォルトルール一式を土台にし、下の rules で個別に上書きする。
  // Ref: https://github.com/conventional-changelog/commitlint/blob/master/@commitlint/config-conventional/README.md
  extends: ['@commitlint/config-conventional'],
  // 各ルールの定義は公式リファレンスを参照。
  // Ref: https://commitlint.js.org/reference/rules.html
  rules: {
    // 許可する type を明示列挙し、表記揺れ（chorxe 等のタイポ）を弾く。
    // 例に挙げたタイポを、スペルチェック（cspell）の検出から外す。cspell:ignore chorxe
    // 値の意味はコミット規約（aidd プラグインの `/aidd:commit` が参照する commit-rule）が SSOT。
    'type-enum': [
      2,
      'always',
      [
        'feat',
        'fix',
        'docs',
        'style',
        'refactor',
        'perf',
        'test',
        'chore',
      ],
    ],
    // 件名は日本語で書くため、英語前提のケース（小文字始まり等）チェックを無効化する。
    'subject-case': [0],
    // 日本語は 1 文字の情報量が多いため、デフォルト連動の header-max-length(100) と揃えて 100 文字を上限にする。
    // Ref: https://commitlint.js.org/reference/rules.html#subject-max-length
    'subject-max-length': [2, 'always', 100],
    // scope に日本語・大文字を許すため、ケースチェックを無効化する。
    // Ref: https://commitlint.js.org/reference/rules.html#scope-case
    'scope-case': [0],
    // scope は任意（付けても付けなくてもよい）。空でもエラーにしない。
    // Ref: https://commitlint.js.org/reference/rules.html#scope-empty
    'scope-empty': [0],
  },
};
