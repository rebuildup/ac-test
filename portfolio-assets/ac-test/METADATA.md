# Portfolio assets — ac-test

## main.png（主画像）

- 種別: main（主画像）
- パス: `portfolio-assets/ac-test/main.png`
- 寸法: 3200×1800 px（16:9、@2x レンダリング）
- alt: `ac-test のポートフォリオ主画像。AtCoder の問題ページで Tampermonkey ユーザースクリプトがサンプルを取得し、Rust 製ブリッジが testcases/a.yml を生成、cargo compete test で 3 件すべて Accepted になるまでの流れを示す図。`
- caption: `AtCoder の問題ページからサンプルを自動取得し、cargo-compete の testcases/a.yml に保存。cargo compete test で全ケース Accepted を確認。`
- 撮影対象版/SHA: ac-test `master` @ `926e6968f393404dd555b79265be23490008be28`（version 0.1.0、`cargo build --release` 成果物）
- 内容の真正性: 画像内のテキストはすべて実実行の出力。
  - バッジ画像は実際の `ac-test.user.js` を実ページ DOM（実 AtCoder HTML + 実 KaTeX レンダリング）上で実行した際の `#ac-test-status` 要素の実スクリーンショット（Playwright/Chrome, deviceScaleFactor=3）。
  - `testcases/a.yml` はブリッジ `POST /testcases` が実際に書き出したファイルそのもの。
  - `cargo compete test a` の出力は cargo-compete 0.10.7 による実実行結果（3/3 Accepted）。
- 再現手順:
  1. `cargo build --release` で `target/release/ac-test` をビルド。
  2. コンテストパッケージディレクトリ（`Cargo.toml` + `src/bin/a.rs` + `compete.toml` は親ディレクトリに `cargo compete init atcoder` で生成）で `target/release/ac-test` を起動（既定 root `..`、port 27121）。
  3. `https://atcoder.jp/contests/abc460/tasks/abc460_a` の HTML を取得し、ヘッドレス Chrome で実ページとしてロード、`ac-test.user.js`（メタデータヘッダ除去）を注入。`GM_xmlhttpRequest` のみ `page.exposeFunction` 経由で Node の fetch にブリッジする（Tampermonkey の特権 XHR と同等。CORS/PNA 迂回のみで製品コードは無改変）。
  4. 生成された `testcases/a.yml` を `cat`、同ディレクトリで `cargo compete test a` を実行。
  5. 画像は実出力を HTML に転記し headless Chrome `--force-device-scale-factor=2 --window-size=1600,900` で PNG 化。
- 既知の制限（正直な記録）: 現行の公開版 AtCoder ページでは KaTeX auto-render が `<var>` を再帰的に描画するため、stress/境界値ケース生成は `no bounds for NNN` 等で unsupported となり `generated: 0`。サンプル取得・YAML 生成・テスト実行は正常。バッジ画像にもこの実際の状態が写っている。stress 生成の不具合は別 Issue として報告予定。
- 権利・公開境界: AtCoder の問題文・サンプルは公開データ。画像は公開版の実行結果のみで、個人情報・非公開情報・秘密情報を含まない。リポジトリは public、ライセンス未記載（既定の公開範囲に従う）。

## supplement-badge.png（補足）

- 種別: supplement（補足）
- パス: `portfolio-assets/ac-test/supplement-badge.png`
- 寸法: 816×87 px（@3x）
- alt: `ac-test の Tampermonkey バッジ実画面。「ac-test: samples saved / stress unsupported」と表示。`
- caption: `問題ページ右下に表示される ac-test バッジの実スクリーンショット（abc460_a）。`
- 出典: main.png と同一の実行セッションで `#ac-test-status` 要素を `element.screenshot` で取得。
- 権利・公開境界: 同上。公開ページ上の公開 UI のみ。
