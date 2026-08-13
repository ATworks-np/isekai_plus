---
name: season-anime
description: Add a season's isekai anime to isekai_plus from animatetimes.com. Use when the user asks to add works for a season — "2026夏のアニメ追加して", "2026年春の作品を入れて", "add the 2026 summer season", "今期のアニメ追加" — or to check what a season has that the site is missing.
---

# シーズン作品の追加

animatetimes.com のクール別一覧を参照し、**異世界作品だけ**を作品追加 API で登録する。

このサイトは異世界特化。シーズンページには歴史物・日常物・恋愛物も並ぶので、
全件登録してはいけない。

## 1. データはリポジトリ内にある

走査済みの生データが `data/` にある。**まず既存データを使う。**

```
data/seasons.yaml            2016-Q1〜2027-Q1 のクール一覧とページURL
data/works/<cour>.yaml       そのクールの全作品（3154件、45クール分）
```

作品ごとに以下が入っている。

| フィールド | 内容 |
| --- | --- |
| `title` / `workTagId` | 作品名と animatetimes の作品ID |
| `seriesTitle` / `seriesTagId` | シリーズ名とシリーズID（**続編のみ**付く） |
| `format` | `TVアニメ` / `配信` / `劇場版アニメ` など |
| `cours` | 放送クール。2クール放送は `["2021-Q1","2021-Q4"]` |
| `thumbnail` | `{ url, width, height }` |
| `synopsis` | あらすじ |
| `fields` | サイトのテーブル全項目そのまま |

データが古い場合のみ再取得する。

```bash
node .claude/skills/season-anime/scripts/fetch-animatetimes.mjs 2026-Q3        # 1クール
node .claude/skills/season-anime/scripts/fetch-animatetimes.mjs --all          # 全クール再取得
node .claude/skills/season-anime/scripts/crawl-season-index.mjs                # クール一覧の更新
```

## 2. シーズンを解決する

| 季節 | 月 | `cours` |
| --- | --- | --- |
| 冬 | 1〜3月 | `Q1` |
| 春 | 4〜6月 | `Q2` |
| 夏 | 7〜9月 | `Q3` |
| 秋 | 10〜12月 | `Q4` |

「2026夏」→ `2026-Q3` → `data/works/2026-Q3.yaml`。
「今期」と言われたら今日の日付から出す。

## 3. 除外するもの

`format` と `title` で機械的に落とす。

- `format` が `劇場版アニメ` / `配信`（配信限定作品）
- `title` に `再放送` `総集編` `新編集版` `特別編` `ダイジェスト`

## 4. 異世界作品を選ぶ

`synopsis` があるので、タイトルで判断がつかないものはあらすじを読む。

**含める**

- 異世界への転生・転移・召喚
- 転生者・転移者が主人公の異世界ファンタジー（ステータス、スキル、
  ギルド、ダンジョン、勇者・魔王）
- 上記の続編
- ゲーム世界・悪役令嬢への転生

**含めない**

- 現代・歴史が舞台で転生要素のないもの
- 異世界要素のない一般的なファンタジー
- 日常系・恋愛・スポーツ・ホラー

判断に迷ったものは除外せず、ユーザーに理由付きで確認する。

## 5. 既存作品と突き合わせる

**`metadata.animatetimes.workTagId` で照合する。** DB の全作品に付いており、
タイトルの表記ゆれに影響されない。

```bash
curl -s https://animes-mu4s3uqxga-uc.a.run.app/statics   # 一覧（metadata は含まない）
```

`metadata` は読み取り API に出ないため、照合は Admin SDK で直接読むか、
`scripts/match-animatetimes.mjs` を使う。

- **workTagId が一致する作品がある** → 登録済み。何もしない
- **同じシリーズの別作品がある**（`seriesTagId` が一致、または既存作品の
  `workTagId` が新作品の `seriesTagId` と一致）→ 新規レコードを作らず、
  既存レコードに**期を追加**する（手順7）
- **どちらでもない** → 新規レコード（手順6）

シリーズIDは続編にしか付かない。1期同士の紐付けはタイトル照合になる。

## 6. 新規レコードを作る

```bash
curl -X POST "$ISEKAI_API_BASE/api/v1/animes/" \
  -H "X-API-Key: $ISEKAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": { "ja": "タイトル", "en": "タイトル" },
    "cours": ["2026-Q3"],
    "tags": [],
    "imageUrl": "https://img2.animatetimes.com/...jpg",
    "metadata": { "animatetimes": { "workTagId": 25337, "seriesTagId": 12169 } }
  }'
```

第1期が自動で作られる。`cours` はそのまま期にも入る。

### フィールドの決め方

- `name.ja` — `seriesTitle` があればそれ、なければ `title`。レコードは
  シリーズを表すので、「〜 4th season」のような期固有の名前は付けない
- `name.en` — 英題がないので `name.ja` と同じ値
- `cours` — YAML の `cours` をそのまま
- `tags` — **常に空配列**。タグ付けは別途
- `imageUrl` — `thumbnail.url`
- `metadata` — `workTagId` は必須、`seriesTagId` は取れた場合のみ

## 7. 既存シリーズに期を追加する

```bash
curl -X POST "$ISEKAI_API_BASE/api/v1/animes/<id>/seasons/" \
  -H "X-API-Key: $ISEKAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "order": 2, "label": "第2期", "cours": ["2026-Q3"] }'
```

`order` はシリーズ内で一意。既存の期を `GET /api/v1/animes/<id>/seasons/` で
確認してから決める。

シリーズの `cours` にも追記する（置換なので既存の値を全部含めて送る）。

```bash
curl -X PATCH "$ISEKAI_API_BASE/api/v1/animes/<id>/" \
  -H "X-API-Key: $ISEKAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "cours": ["2024-Q2","2026-Q3"] }'
```

### スピンオフ

本編の期ではない側の物語（転スラ日記、この素晴らしい世界に爆焔を！）は
`第N期` の採番から外し、`label` に作品名を入れる。判断がつかないものは
ユーザーに確認する。副題だけの続編（マッシュル 神覚者候補選抜試験編）は
**期として扱う**ので、混同しない。

## 8. 追加する内容を提示して確認を取る

書き込む前に、追加・更新の一覧をユーザーに見せて承認を取る。本番データへの
書き込みで、誤判定がそのまま公開サイトに出るため。ユーザーが「確認不要」と
言った場合は省略してよい。

提示する内容: タイトル / 新規か期追加か / 異世界と判断した理由（1行）。

## 9. 認証情報

`.env.local`（gitignore 済み）から読む。

```bash
ISEKAI_API_KEY=isk_...
ISEKAI_API_BASE=https://ani-mato.net
```

未設定なら、管理画面 `/admin` の「API キー」から発行して `.env.local` に
追記するようユーザーに依頼する。**キーの値をチャットに出力しない。**

## 10. 結果を報告する

新規追加、期追加、スキップの件数を伝える。失敗した作品はタイトルと
エラー内容をそのまま出す。黙って落とさない。

## 注意

- 誤って登録した場合は `DELETE $ISEKAI_API_BASE/api/v1/animes/<id>/` で消せる。
  コメントや評価のサブコレクションごと消えるため、既に公開されている作品には
  使わない
- 期だけ消す場合は `DELETE $ISEKAI_API_BASE/api/v1/animes/<id>/seasons/<seasonId>/`
