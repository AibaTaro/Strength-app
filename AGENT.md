# AGENT.md

仕様は [`strength-app-plan.md`](./strength-app-plan.md) を参照すること。このファイルは実装作業者(人間・AIエージェント問わず)向けの最小限の運用メモ。

## コマンド(`app/`ディレクトリで実行)

```bash
npm run dev      # 開発サーバー起動
npm run build    # 型チェック(tsc -b) + 本番ビルド
npm run lint     # ESLint
npm run test     # vitest(ユニットテスト・受入基準の一部を自動検証)
npm run motions  # 種目のやり方GIFを再生成(public/motions/)。動作の定義は tools/motion/motions.ts
npm run test:e2e # Playwright E2E(スマホ幅Chromium。初回のみ `npx playwright install chromium`)
```

## 絶対に守るルール

- ダンベルの重量候補は登録済み16段階 `[3,5,7,9,12,14,16,18,21,23,25,27,30,32,34,36]` に固定する。中間値・範囲外の値を生成しない([equipment.ts](./app/src/domain/equipment.ts)の`stepWeight`以外で重量を動かさない)。
- ダンベルの表示・入力は常に「1個あたりの重量」。使用個数・左右は実績に必ず保存し、負荷量計算で二重計上しない([aggregation.ts](./app/src/domain/aggregation.ts)の`calcSetLoadKg`を使う)。
- 提案・集計・重量調整ロジック(`src/domain/*`)は画面(`src/screens/*`, `src/components/*`)から分離する。画面はロジック層の関数を呼ぶだけにし、判定条件を画面コード内に書かない。
- 年齢・体重・過去の実績から数値を断定・捏造しない。履歴がなければ「初回調整」と明示する。
- ベンチ(STEADY ST123)の角度調整仕様が未確認の間は、角度指定が必要な種目(`requiresBenchAngle: true`)を提案候補に出さない。
- 教材(動画等)は出典・利用条件が確認できたものだけ`materialStatus: "confirmed"`にする。未確認を確認済みと表示しない。
- ID生成は `domain/id.ts` の `newId()` を使う(`crypto.randomUUID`はHTTPのスマホで使えない)。
- E2Eのセレクタは役割名・ラベル(アクセシビリティ)基準。ボタン名やaria-labelを変えるときはe2e/も更新する。
- 種目を追加したら `tools/motion/motions.ts` に動作を追加し `npm run motions` でGIFを生成する(全種目分のGIFがないと`npm run test`が失敗する)。
- やり方アニメーションは参考用。専門家が確認するまで「確認済み」「正しいフォーム」と表示しない(教材の状態は「未確認」のまま)。
- 認証・サーバー保存・複数端末同期は実装しない(今回の対象外)。
- 個人設定・種目データ・提案ロジックはモジュールとして分離した状態を維持する(将来の同期対応に備えるが、同期基盤自体は作らない)。

## 完了の条件

各段階の区切りで、`app/`にて以下がすべて通ること。

```bash
npm run build
npm run lint
npm run test
```

3つとも失敗がない状態でコミットする。UI・保存・提案ロジックを変えたときは `npm run test:e2e` も通すこと。

## ドキュメントの書き方

- 分量は**文字数**で測る(KBではない)。画像・図は増やしてよい。文字を減らし、図(mermaid)・注釈画像・表で見せる。
- 指示語は一目で場所が分かる形にする。「図3の4」「表1」のように、図・表に番号と題を付けて参照する。内部ID(S1など)や「上記」「前述」は使わない。
- 画像・図の側にも番号を表示する(画像は右上に「図N」、注釈は1,2,3…。mermaidは`title: 図N …`)。
- 画面の説明は、番号付き注釈スクリーンショット+同じ番号の表(`npm run docs:shots`で再生成)。
- 1項目は1行。理由・背景は必要なものだけを表の1列に書く。
