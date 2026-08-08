# ac-test

AtCoder の問題ページから以下を自動取得する `cargo-compete` 補助ツールです。

- サンプル入出力 → `testcases/<alias>.yml`
- Level 1 の境界値 / stress 入力 → `testcases/generated/<alias>/*.txt`

## 配置

通常は `cargo-compete` のコンテスト群と同じ親ディレクトリに置きます。

```text
atcoder/
├─ ac-test/
├─ abc467/
├─ abc468/
└─ ...
```

この配置なら保存先 root はデフォルトの `../` でよいため、設定不要です。

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

AtCoder の問題ページを開くと自動で localhost の bridge に送信します。

右下の表示例:

```text
ac-test: 3 samples + 5 stress
```

通常の sample は従来どおり:

```text
abc467/testcases/a.yml
```

Level 1 の生成入力は:

```text
abc467/testcases/generated/a/
├─ min.txt
├─ near-min.txt
├─ near-max.txt
├─ max.txt
└─ random-max.txt
```

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

乱数シードは固定なので、同じ問題なら再現可能です。

## 対応しない場合

文字列、グラフ、順列、二次元配列、複雑な相互制約など、Level 1 で有効入力だと保証できない場合は stress input を生成しません。

その場合でも sample YAML は通常どおり保存され、右下は:

```text
ac-test: samples saved / stress unsupported
```

となります。

ブラウザの Console には理由も表示します。

## TLE / 実行時間チェック

コンテストディレクトリから `stress.ps1` を使えます。

```powershell
cd ../abc467
../ac-test/stress.ps1 a
```

`Cargo.toml` の `cargo-compete` metadata から alias `a` に対応する bin 名を自動取得し、release build したうえで生成ケースをすべて流します。

例:

```text
ac-test stress: a -> abc467-a
local threshold: 2,000 ms (x1)
building release...

Case        Status TimeMs Exit
----        ------ ------ ----
max         OK      154.2    0
min         OK        3.1    0
near-max    OK      149.8    0
near-min    OK        3.0    0
random-max  OK      171.5    0
```

ローカル実行時間と AtCoder の実行環境は一致しないので、`OVER` / `TIMEOUT` は「TLEの可能性が高い」という警告として扱ってください。

少し余裕を持たせたい場合:

```powershell
../ac-test/stress.ps1 a -LimitMultiplier 1.5
```

## Bridge

- `127.0.0.1:27121` のみに bind
- AtCoder へ追加リクエストは送らない
- 表示中の問題文 DOM だけを解析
- 保存先コンテストが存在しない場合は勝手に作らずエラー
