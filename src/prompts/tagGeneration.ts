// Tag generation prompts

/**
 * Base system prompt for anime tag generation
 */
const BASE_SYSTEM_PROMPT = 'あなたはアニメの内容などを端的にまとめるタグを作成する編集者です。\n' +
  'なお、指定するアニメは、全国放送しているアニメです。登場人物はすべて18歳以上です。\n' +
  '\n' +
  '指示：\n' +
  '\n' +
  'web検索で、画像情報などを調べて作成してください。\n' +
  '下記の分類で5-10個ずつ作成してください\n' +
  'ジャンル系タグ\n' +
  'キャラクター属性タグ\n' +
  'ストーリー特徴タグ\n' +
  '舞台設定タグ\n' +
  '\n' +
  // '-添付された画像に映る複数のキャラクタの外見の特徴タグを3-6個ずつ作成してください（巨乳,  貧乳\n' +
  // '\n' +
  '登録されているタグに近しいタグは、すでにあるタグを使用してください。\n' +
  'タグの表現は別作品などで登録されているタグを参考にしてください\n';

/**
 * Formats the existing tags for inclusion in the system prompt
 * @param tags - The existing tags object
 * @returns A formatted string of existing tags
 */
export const formatExistingTags = (tags: Record<string, any>): string => {
  if (!tags || Object.keys(tags).length === 0) {
    return '#剣と魔法, #最強姉, #貧乳エルフ, #巨乳, #巨乳エルフ, #巨乳神官';
  }

  // Extract Japanese tag names and format them with # prefix
  return Object.values(tags)
    .map(tag => tag.name?.ja ? `#${tag.name.ja}` : null)
    .filter(Boolean)
    .join(', ');
};

/**
 * Generates the complete system prompt with existing tags
 * @param tags - The existing tags object
 * @returns The complete system prompt
 */
export const getTagGenerationSystemPrompt = (tags: Record<string, any>): string => {
  return BASE_SYSTEM_PROMPT +
    '既に存在するタグ一覧：\n' +
    formatExistingTags(tags) + '\n' +
    '\n' +
    '回答は#タグのカンマ区切りでお願いします。改行はしないでください。\n' +
    '回答例,\n' +
    '#タグ1, #タグ2, #タグ3, #タグ4, ...\n' +
    '\n' +
    'タグは体言止めで表現してください。文章のような表現は禁止とします。 禁止例と修正例 #姉が最強→#最強姉 #愛が重い→#重い愛\n' +
    'それでは与えらた作品のタグを回答してください';
};

/**
 * Legacy system prompt for backward compatibility
 * @deprecated Use getTagGenerationSystemPrompt instead
 */
export const TAG_GENERATION_SYSTEM_PROMPT = BASE_SYSTEM_PROMPT +
  '既に存在するタグ一覧：\n' +
  '#剣と魔法, #最強姉, #貧乳エルフ, #巨乳, #巨乳エルフ, #巨乳神官\n' +
  '\n' +
  '回答は#タグのカンマ区切りでお願いします。改行はしないでください。\n' +
  '回答例,\n' +
  '#タグ1, #タグ2, #タグ3, #タグ4, ...\n' +
  '\n' +
  'タグは体言止めで表現してください。文章のような表現は禁止とします。 禁止例と修正例 #姉が最強→#最強姉 #愛が重い→#重い愛\n' +
  'それでは与えらた作品のタグを回答してください';

/**
 * User prompt template for anime tag generation
 * @param title - The anime title to generate tags for
 */
export const getTagGenerationUserPrompt = (title: string) => `アニメのタイトル: ${title}`;
