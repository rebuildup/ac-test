# ac-test

AtCoder の問題ページにあるサンプル入出力を、`cargo-compete` の
`testcases/<task>.yml` へ自動保存します。

## 配置

`ac-test` を `cargo compete new` で作るコンテストディレクトリと同じ階層に置くのを基本とします。

```text
atcoder/
├─ ac-test/
├─ abc467/
├─ abc468/
└─ ...
```

この配置なら保存先ルートは `ac-test` から見て `../` なので、パス設定は不要です。

```text
AtCoder problem page
        │
        │ GM_xmlhttpRequest
        ▼
http://127.0.0.1:27121
        │
        ▼
../<contest>/testcases/<alias>.yml
```

たとえば `abc467_a` を開くと:

```text
../abc467/testcases/a.yml
```

が生成・更新されます。

## 1. 起動

`ac-test` ディレクトリでそのまま起動します。

```powershell
cargo run --release
```

デフォルトでは `../` をコンテストのルートとして使います。

通常と違う配置にした場合だけ `--root` を指定できます。相対パスで構いません。

```powershell
cargo run --release -- --root ../../contests
```

ポートのデフォルトは `27121` です。変更する場合:

```powershell
cargo run --release -- --port 27122
```

その場合は `ac-test.user.js` の `ENDPOINT` も同じポートへ変更してください。

### 動作確認

```powershell
Invoke-WebRequest http://127.0.0.1:27121/health
```

`ok` が返れば起動済みです。

## 2. Tampermonkey

`ac-test.user.js` を Tampermonkey の新規スクリプトへ貼り付けて保存します。

対象ページ:

```text
https://atcoder.jp/contests/*/tasks/*
```

問題ページを開くと自動的にサンプルを送信します。右下の表示で状態を確認できます。

- `cargo: 3 samples saved` — 保存成功
- `cargo: bridge offline` — `ac-test` が起動していない
- `cargo: samples not found` — サンプルをDOMから取得できなかった

状態表示をクリックすると再送できます。

## 3. cargo-compete

たとえば:

```powershell
cd ../abc467
cargo compete test a
```

問題ページを開いた時点で `testcases/a.yml` が生成・更新されているため、手動でYAMLを書く必要はありません。

## 生成するYAML

```yaml
# https://atcoder.jp/contests/abcXXX/tasks/abcXXX_a
---
type: Batch
timelimit: 2s
match: Lines

cases:
  - name: sample1
    in: |
      ...
    out: |
      ...

extend: []
```

## オプション

```text
--root <path>   コンテスト群のルート。省略時は ../
--port <port>   localhost のポート。省略時は 27121
```

`--root=../../contests`、`--port=27122` の形式でも指定できます。

## 仕様

- `127.0.0.1` のみに bind します。
- 日本語の `入力例/出力例` と英語の `Sample Input/Sample Output` を認識します。
- 同じ番号の日本語・英語サンプルは同じ `sampleN` として扱います。
- `abc467_a` のような task id は `a.yml` に変換します。
- 対象コンテストのディレクトリが存在しない場合は勝手に作らずエラーにします。
- 出力比較は現在 `match: Lines` 固定です。
- AtCoderへ追加のHTTPリクエストは送りません。表示中の問題文DOMだけを読み取ります。
