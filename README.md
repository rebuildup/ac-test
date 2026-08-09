# ac-test

AtCoder の問題ページからテストケースを取得・生成し、`cargo-compete` の `testcases/<alias>.yml` にまとめて保存する補助ツールです。

- サンプル入出力を自動取得
- Level 1 の境界値 / stress 入力を自動生成
- すべて同じ `a.yml` の `cases:` に保存
- `cargo compete test a` 1回でまとめて実行

## 配置

通常は `cargo-compete` のコンテスト群と同じ親ディレクトリに置きます。

```text
atcoder/
├─ ac-test/
├─ abc467/
├─ abc468/
└─ ...
```

この配置なら保存先 root はデフォルトの `../` なので設定不要です。

## 起動

```powershell
cd ac-test
cargo run --release
```

必要な場合だけ root を変更できます。

```powershell
cargo run --release -- --root ../../contests
```

## Tampermonkey

`ac-test.user.js` を Tampermonkey に登録してください。

AtCoder の問題ページを開くと、表示中の問題文 DOM からサンプル・制約・入力形式を読み取り、localhost の bridge に送信します。

成功時の右下表示例:

```text
ac-test: 3 samples + 5 stress
```

生成先は1ファイルだけです。

```text
abc467/testcases/a.yml
```

例:

```yaml
---
type: Batch
timelimit: 2s
match: Lines

cases:
  - name: sample1
    in: |
      3
      1 2 3
    out: |
      6

  - name: generated-min
    in: |
      1
      1

  - name: generated-max
    in: |
      200000
      ...

extend: []
```

`generated-*` のケースでは `out` を意図的に省略します。`cargo-compete` の `Case.out` は optional なので、正解出力が分からない自動生成入力でも実行できます。これにより生成ケースでは出力比較を行わず、主に TLE・RE・panic などを確認できます。

## テスト

通常どおり1コマンドです。

```powershell
cargo compete test a
```

これで以下をまとめて実行します。

- `sample1`, `sample2`, ...: 正解出力と比較
- `generated-min`: 最小境界
- `generated-near-min`: 最小境界 + 1
- `generated-near-max`: 最大境界 - 1
- `generated-max`: 最大境界
- `generated-random-max`: 構造サイズ最大 + 範囲内疑似乱数

## Level 1 が解釈する入力

現在は、安全に機械生成しやすい以下に限定しています。

### 整数スカラー

```text
N M
```

```text
1 <= N <= 200000
1 <= M <= 1000000000
```

### 一次元整数配列

```text
N
A_1 A_2 ... A_N
```

```text
1 <= N <= 200000
1 <= A_i <= N
```

`A_i <= N` のような、別のスカラー変数に依存する上限にも対応します。

### 生成パターン

- `min`: 全変数を最小境界
- `near-min`: `min + 1`
- `near-max`: `max - 1`
- `max`: 全変数を最大境界
- `random-max`: 配列長などの構造サイズは最大、要素値は範囲内で疑似乱数

乱数シードは固定なので同じ問題なら再現可能です。

## 対応しない場合

文字列、グラフ、順列、二次元配列、複雑な相互制約など、Level 1 で有効入力だと保証できない場合は生成ケースを追加しません。

その場合でもサンプルは通常どおり `a.yml` に保存され、右下に:

```text
ac-test: samples saved / stress unsupported
```

と表示します。ブラウザの Console にはスキップ理由も表示します。

## Bridge

- `127.0.0.1:27121` のみに bind
- AtCoder へ追加リクエストは送らない
- 表示中の問題文 DOM だけを解析
- 保存先コンテストが存在しない場合は勝手に作らずエラー
