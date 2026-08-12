---
name: season-anime
description: Add a season's isekai anime to isekai_plus from anime.eiga.com. Use when the user asks to add works for a season — "2026夏のアニメ追加して", "2026年春の作品を入れて", "add the 2026 summer season", "今期のアニメ追加" — or to check what a season has that the site is missing.
---

# シーズン作品の追加

anime.eiga.com のシーズン一覧を参照し、**異世界作品だけ**を作品追加 API で登録する。

このサイトは異世界特化。シーズンページには歴史物・日常物・恋愛物も並ぶので、
全件登録してはいけない。

## 1. シーズンを解決する

ユーザーの言う季節を、URL スラッグと `cours` の両方に変換する。

| 季節 | 月 | URL スラッグ | `cours` |
| --- | --- | --- | --- |
| 冬 | 1〜3月 | `winter` | `Q1` |
| 春 | 4〜6月 | `spring` | `Q2` |
| 夏 | 7〜9月 | `summer` | `Q3` |
| 秋 | 10〜12月 | `autumn` | `Q4` |

「2026夏」→ スラッグ `2026-summer`、`cours` は `["2026-Q3"]`。

- **`fall` は 404。`autumn` を使う。**
- `cours` は `YYYY-QN` 形式。`2026年夏` のような和暦表記は既存データに存在しない。
- 「今期」と言われたら今日の日付から季節を出す。現在放送中のシーズンの URL は
  `/program/` にリダイレクトされるが、内容は同じなのでそのまま扱ってよい。

## 2. 一覧を取得する

```bash
node .claude/skills/season-anime/scripts/fetch-season.mjs list 2026-summer
```

`[{ programId, title, url }]` が返る。1シーズン100件前後。

## 3. 異世界作品を選ぶ

タイトルだけで判断がつかないものは `url` の詳細ページを読んで、あらすじで判断する。

**含める**

- 異世界への転生・転移・召喚（「転生」「異世界」「召喚された」）
- 転生者・転移者が主人公の異世界ファンタジー（剣と魔法の世界、ステータス、スキル、
  ギルド、ダンジョン、勇者・魔王）
- 上記の続編（「第2期」「II」「2nd Season」など）
- ゲーム世界・悪役令嬢への転生

**含めない**

- 現代・歴史が舞台で転生要素のないもの
- 異世界要素のない一般的なファンタジー
- 日常系・恋愛・スポーツ・ホラー

判断に迷ったものは除外せず、ユーザーに理由付きで確認する。

## 4. 既存作品と突き合わせる

```bash
curl -s https://animes-mu4s3uqxga-uc.a.run.app/statics
```

`[{ id, name: { ja, en }, cours, tags }]` が返る。`name.ja` の完全一致で照合する。

- **未登録** → 新規追加（手順5）
- **登録済みで、その `cours` を既に持つ** → 何もしない。再実行しても重複しない
- **登録済みだが、その `cours` を持たない** → 継続作品。新規追加せず、
  `cours` に追記する PATCH を投げる

既存データは継続作品を `["2025-Q1","2025-Q2"]` のように1レコードで持つ。
2期・続編としてタイトルが異なるもの（「〜 第2期」「〜 2nd Season」）は別作品として扱う。

## 5. 追加する内容を提示して確認を取る

書き込む前に、追加・更新の一覧をユーザーに見せて承認を取る。本番データへの書き込みで、
誤判定がそのまま公開サイトに出るため。ユーザーが「確認不要」と言った場合は省略してよい。

提示する内容: タイトル / 新規か `cours` 追記か / 異世界と判断した理由（1行）。

## 6. 画像 URL を取得する

承認された作品**だけ**について詳細ページから取得する。全件分を先に取ると
無駄に相手のサーバーを叩くことになる。

```bash
node .claude/skills/season-anime/scripts/fetch-season.mjs image 113254 112415
```

各作品の `og:image`（サイズ無指定の原寸）が返る。

## 7. API に投げる

認証情報は `.env.local`（gitignore 済み）から読む。

```bash
ISEKAI_API_KEY=isk_...
ISEKAI_API_BASE=https://backend001--jp-contents-matome.us-central1.hosted.app
```

キーが未設定なら、管理画面 `/admin` の「API キー」から発行して `.env.local` に
追記するようユーザーに依頼する。**キーの値をチャットに出力しない。**

新規追加:

```bash
curl -X POST "$ISEKAI_API_BASE/api/v1/animes/" \
  -H "X-API-Key: $ISEKAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": { "ja": "タイトル", "en": "タイトル" },
    "cours": ["2026-Q3"],
    "tags": [],
    "imageUrl": "https://media.eiga.com/images/anime/program/113254/photo/xxxx.jpg"
  }'
```

継続作品の `cours` 追記:

```bash
curl -X PATCH "$ISEKAI_API_BASE/api/v1/animes/<id>/" \
  -H "X-API-Key: $ISEKAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "cours": ["2026-Q1", "2026-Q3"] }'
```

`cours` は置換なので、**既存の値をすべて含めた配列**を送る。

### フィールドの決め方

- `name.ja` — 参照元のタイトルをそのまま
- `name.en` — 参照元に英題がないため `name.ja` と同じ値を入れる。API が空文字を
  受け付けないための措置で、正式な英題が判明したら後から PATCH で直す
- `tags` — **現時点では常に空配列**。タグ付けは別途行う方針
- `imageUrl` — 手順6で取得した `og:image`

## 8. 結果を報告する

追加した件数、`cours` を追記した件数、スキップした件数を伝える。
失敗した作品があればタイトルとエラー内容をそのまま出す。黙って落とさない。

## 注意

- 一覧ページ以外は robots.txt で許可されている範囲のみ参照する
  （`/program/` 配下は許可、`/search/` などは禁止）
- 詳細ページの取得は同時4件までに抑えてある。スクリプトを迂回して並列化しない
- 誤って登録した場合は `DELETE $ISEKAI_API_BASE/api/v1/animes/<id>/` で消せる。
  コメントや評価のサブコレクションごと消えるため、既に公開されている作品には使わない
