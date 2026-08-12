This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

### OpenAI API Key Setup

This project uses the OpenAI API for automatic tag generation. To use this feature:

1. Get an API key from [OpenAI](https://platform.openai.com/api-keys)
2. Create a `.env.local` file in the root directory
3. Add your API key to the file:
   ```
   NEXT_PUBLIC_OPENAI_API_KEY=your_openai_api_key_here
   ```

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## 作品追加 API

外部から作品を登録・更新・削除するための API です。App Hosting 上の Next.js Route Handler
として動き、Firebase Admin SDK で Firestore と Storage を直接操作します。

### 認証

管理画面（`/admin`）の「API キー」から発行したキーを `X-API-Key` ヘッダーで送ります。
キーは発行時に一度だけ表示され、Firestore には SHA-256 ハッシュしか保存されません。
紛失した場合は失効させて再発行してください。

```
X-API-Key: isk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### エンドポイント

| メソッド | パス | 内容 |
| --- | --- | --- |
| POST | `/api/v1/animes/` | 作品を追加 |
| PATCH | `/api/v1/animes/{id}/` | 作品を部分更新 |
| DELETE | `/api/v1/animes/{id}/` | 作品とサブコレクション・サムネイルを削除 |

`tags` には既に存在するタグの ID（または `versions/1/tags/xxx` 形式のパス）を渡します。
未登録のタグ名を渡すと 400 になります。タグの新規作成は管理画面から行ってください。

`imageUrl` を渡すとサーバーが画像を取得し、jpg と webp に変換して
`thumbnail/{id}.{jpg,webp}` に保存します。https の公開ホストのみ許可されます。

### 例

```bash
curl -X POST https://<your-domain>/api/v1/animes/ \
  -H "X-API-Key: $ISEKAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": { "ja": "作品名", "en": "Title" },
    "cours": ["2025年秋"],
    "tags": ["tagId1", "tagId2"],
    "imageUrl": "https://example.com/thumbnail.jpg"
  }'
```

```bash
curl -X PATCH https://<your-domain>/api/v1/animes/<id>/ \
  -H "X-API-Key: $ISEKAI_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{ "cours": ["2025年秋", "2026年冬"] }'
```

PATCH は渡したフィールドだけを更新します。評価集計とコメント数は Firestore トリガーが
管理しているため、更新しても保持されます。

### ローカルで動かす場合

Route Handler は Admin SDK を使うため、App Hosting 以外では認証情報が必要です。

```bash
gcloud auth application-default login
```

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
