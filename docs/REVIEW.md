# コードレビューの入口

公開される `dist/` がそのまま実行時のソースです。ビルド生成物への置き換えや外部CDNへの依存はありません。Node.jsでのチェックにも追加パッケージのインストールは不要です。

## ローカルで確認する

```bash
git clone https://github.com/studio-yebisu/musewonder-arcade.git
cd musewonder-arcade
npm run check
npm test
python -m http.server 8000 --directory dist
```

ブラウザで http://localhost:8000/ を開きます。`arcadeDebug.getSnapshot()` は読み取り専用で、現在のゲーム、状態、スコア、HP等を確認できます。

## ファイルと責務

| ファイル | 確認する処理 |
| --- | --- |
| [`dist/main.js`](../dist/main.js) | 一覧・準備・プレイ・一時停止・結果の遷移、入力解除、HUD、ページ非表示時の停止 |
| [`dist/core/input.js`](../dist/core/input.js) | キー入力の保持・解除、座標と当たり判定の共通関数 |
| [`dist/core/runtime.js`](../dist/core/runtime.js) | Canvasの描画倍率、実寸と縦横比、スマホでの操作ボタン配置 |
| [`dist/core/storage.js`](../dist/core/storage.js) | ベストスコアとサウンド設定、保存不可時のメモリへの切り替え |
| [`dist/core/audio.js`](../dist/core/audio.js) | 初回操作でのAudioContext作成、ミュート、効果音、停止・再開 |
| [`dist/games/block-stack.js`](../dist/games/block-stack.js) | 7種バッグ、回転と壁補正、ライン消去、ホールド、天井判定 |
| [`dist/games/prism-break.js`](../dist/games/prism-break.js) | 円と矩形の衝突、球の小刻み更新、パドル反射、ライフと3ステージ |
| [`dist/games/star-drift.js`](../dist/games/star-drift.js) | 敵と弾の寿命、撃破の一度だけの加点、被弾の無敵時間、ボス勝利 |
| [`dist/games/midnight-run.js`](../dist/games/midnight-run.js) | 道路投影、加速とカーブ、衝突の減速・減点、追い抜き、ゴールと時間切れ |

ゲームは `reset / update / draw / handlePressed / touchAction / handlePointer / clearInput / hud / getSnapshot` を提供し、共通画面と `hooks` を介して接続します。ゲームのルールは各エンジンに、画面遷移と入力の寿命は `main.js` に置いています。

## 検証と範囲

[`tests/mechanics.test.mjs`](../tests/mechanics.test.mjs) は盤面・反射・当たり判定・ホールド等のルールに加え、マウスからキーボードへの切り替え、一時停止の入力解除、多重撃破の防止、レースの減点保持を確認します。

[`tests/audio-storage.test.mjs`](../tests/audio-storage.test.mjs) は初回サウンドON、保存済みミュートの保持、保存不可時の継続、ユーザー操作前に音声コンテキストを作らないことを確認します。Node.jsの音声テストはWebAudioの呼び出しを検証するモックであり、ブラウザでの音声再生確認と併用します。

初版では公開URLで4ゲームの開始・操作・一時停止を確認し、360×640の画面で縦横比と操作ボタンの収まりを確認しました。ゲーム単体の追加セッションでは、リセット、敗北後の停止、ブロック崩し全3ステージ、レースのゴールと時間切れを確認しています。40秒動画は各ゲーム10秒の自動プレイで、元のゲームの物理処理・スコア・HPを使います。

自動テストは画面の見た目、ゲームバランス、全端末での体験を保証するものではありません。公開CIの結果とコードを入口に、実際のブラウザで操作して確認してください。問題を見つけた場合は、ゲーム名・操作・画面サイズ・再現手順を添えてIssueを作成できます。
