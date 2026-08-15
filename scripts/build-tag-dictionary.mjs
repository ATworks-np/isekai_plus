#!/usr/bin/env node
/**
 * Writes data/tags.yaml: the vocabulary, with what each tag means.
 *
 *   node scripts/build-tag-dictionary.mjs
 *
 * The tagger used to be handed a list of 100 bare names, which is not enough to
 * choose between 巨乳, 巨乳剣士 and 巨乳メイド, or between 日常 and 日常系. Names
 * alone also make a run unrepeatable: nothing pins down what the site means by
 * a tag, so two runs of the same work disagree.
 *
 * So the meanings live in a file, in git, and the prompt is built from it. The
 * criteria below are written here; the ids, the counts and the example works
 * come from the database, which is the record of how the site has actually used
 * each tag. Rerun this after adding tags or retagging works.
 *
 * Requires: gcloud auth application-default login
 */

import { readFileSync, writeFileSync, mkdirSync } from 'fs'
import { stringify } from 'yaml'
import { initializeApp, applicationDefault } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const ANIMES_PATH = 'versions/1/animes'
const TAGS_PATH = 'versions/1/tags'
const OUT = 'data/tags.yaml'

/**
 * The four the site is built around come first, and every work is checked
 * against them by name. The rest follow in the order a reader would think of
 * them: where it is set, who is in it, what happens.
 */
const GROUPS = [
  { key: 'isekai', label: '異世界', note: 'このサイトの中心。どの作品も必ず確認する' },
  { key: 'reborn', label: '転生・転移', note: 'このサイトの中心。転生か転移かを取り違えない' },
  { key: 'skill', label: 'スキル・能力', note: 'このサイトの中心。数値や能力の見せ方' },
  { key: 'body', label: '外見（巨乳系ほか）', note: 'このサイトの中心。画像を見て判定する' },
  { key: 'race', label: '種族', note: '' },
  { key: 'role', label: '役割・職業', note: '' },
  { key: 'place', label: '舞台', note: '' },
  { key: 'plot', label: '物語の型', note: '' },
  { key: 'mood', label: '作風', note: '' },
]

/** name -> [group, criteria]. The criteria is what a person would check. */
const MEANINGS = {
  異世界ファンタジー: ['isekai', '剣と魔法の異世界が舞台。転生・転移の有無は問わない'],
  異世界転移: ['reborn', '元の体のまま異世界へ移動する。死んでいない'],
  異世界転生: ['reborn', '死んで別の体に生まれ変わる。転移と取り違えない'],
  異世界召喚: ['reborn', '異世界の側から呼び出される。本人の意思ではない'],
  勇者召喚: ['reborn', '召喚のうち、勇者として召喚された場合'],
  生まれて転生: ['reborn', '赤子から人生をやり直す。前世の記憶を持って生まれる'],
  人以外に転生: ['reborn', '転生先が人間でない。自動販売機、スライム、豚など'],
  前世の記憶: ['reborn', '前世を覚えていて、その知識で行動する'],
  事故死: ['reborn', '転生のきっかけが事故。トラックなど'],
  タイムリープ: ['reborn', '同じ人生の過去に戻る。異世界ではない'],
  不死ループ: ['reborn', '死ぬたびに巻き戻る。死に戻り'],
  悪役令嬢: ['reborn', '乙女ゲームの悪役令嬢に転生する'],
  令嬢主人公: ['role', '主人公が令嬢。転生の有無は問わない'],
  ゲーム内: ['isekai', '舞台がゲームの世界。VRMMOや乙女ゲーム'],
  パラレルワールド: ['isekai', '並行世界。異世界とは別'],

  スキル: ['skill', '習得・付与される能力が名前付きで扱われる'],
  ステータス画面: ['skill', '数値やウィンドウが画面に出る'],
  レベル: ['skill', 'レベルという概念で強さが測られる'],
  固有職: ['skill', '主人公だけの職業・クラス'],
  職業鑑定: ['skill', '職業を鑑定する儀式や制度がある'],
  魔法適性鑑定: ['skill', '魔法の適性を測る儀式や制度がある'],
  加護: ['skill', '神や精霊から与えられた力'],
  マナ: ['skill', '魔力がマナとして扱われる'],
  エーテル: ['skill', '魔力がエーテルとして扱われる'],
  魔法: ['skill', '魔法が使われる。ファンタジー全般ではなく描写があること'],
  補助魔法: ['skill', 'バフや支援の魔法が主人公の軸'],
  魔法工学: ['skill', '魔法を技術・産業として扱う'],
  俺TSUEEE: ['skill', '主人公が圧倒的に強く、それが売り'],
  勘違い最強: ['skill', '本人は自覚がないのに周囲が最強だと勘違いする'],
  能力無し: ['skill', '能力を持たないことが出発点'],
  不死身: ['skill', '死なない、あるいは何度でも蘇る'],
  喋る武器: ['skill', '意思を持つ武器が出る'],
  隠れスキル: ['skill', 'ハズレ扱いの能力が実は強い'],

  巨乳: ['body', '胸の大きなキャラがいる。職業が特定できないとき'],
  巨乳剣士: ['body', '胸の大きなキャラが剣を持って戦う'],
  巨乳メイド: ['body', '胸の大きなキャラがメイド服'],
  巨乳エルフ: ['body', '胸の大きなエルフ'],
  巨乳神官: ['body', '胸の大きなキャラが神官・僧侶'],
  貧乳エルフ: ['body', '胸の小さなエルフ'],
  むちむち太もも: ['body', '太ももを強調した描写がある'],
  見た目幼女: ['body', '外見が幼女。中身は問わない'],
  ケモ耳: ['body', '獣の耳や尻尾を持つキャラがいる'],
  双子: ['body', '双子のキャラがいる'],

  獣人: ['race', '獣人という種族が出る'],
  エルフ: ['race', 'エルフが出る'],
  ダークエルフ: ['race', 'ダークエルフが出る'],
  精霊: ['race', '精霊が出る'],
  魔族: ['race', '魔族が出る'],
  吸血鬼: ['race', '吸血鬼が出る'],
  神: ['race', '神が登場人物として出る'],
  女神: ['race', '女神が登場人物として出る'],
  魔王: ['role', '魔王が出る'],
  魔王の娘: ['role', '魔王の娘が出る'],
  四天王: ['role', '四天王が出る'],

  勇者: ['role', '勇者が出る'],
  勇者パーティー: ['role', '勇者のパーティが話の単位'],
  聖女: ['role', '聖女が出る'],
  聖騎士: ['role', '聖騎士が出る'],
  騎士団: ['role', '騎士団が組織として出る'],
  団長: ['role', '団長が出る'],
  賢者: ['role', '賢者が出る'],
  魔女: ['role', '魔女が出る'],
  暗殺者: ['role', '暗殺者が出る'],
  調教師: ['role', 'テイマー・調教師が出る'],
  アルケミスト: ['role', '錬金術師・薬師が出る'],
  料理: ['role', '料理が話の軸'],
  グルメ: ['role', '食べ歩きや食事そのものが売り'],
  キャンプ: ['role', '野営・キャンプが売り'],
  農家: ['role', '農業が話の軸'],
  商人ギルド: ['role', '商人ギルドが出る'],
  冒険者ギルド: ['role', '冒険者ギルドが出る'],
  領主: ['role', '主人公が領主'],
  国づくり: ['role', '国や町を作る話'],
  王: ['role', '王が出る'],
  王女: ['role', '王女が出る'],
  王子: ['role', '王子が出る'],
  貴族令嬢: ['role', '貴族の令嬢が出る'],
  学生: ['role', '主人公が学生'],
  先生: ['role', '主人公が教える側'],
  英雄: ['role', '英雄と呼ばれる存在が軸'],
  犯罪者主人公: ['role', '主人公が犯罪者'],

  ダンジョン: ['place', 'ダンジョン攻略が話の軸'],
  学園: ['place', '学園が主な舞台'],
  貴族社会: ['place', '貴族社会の力関係が話の軸'],
  中世風: ['place', '中世ヨーロッパ風の文明'],
  現代: ['place', '現代日本が舞台に含まれる'],

  パーティ追放: ['plot', 'パーティを追放されるところから始まる'],
  復讐: ['plot', '復讐が動機'],
  ハーレム: ['plot', '主人公の周りに複数の異性が集まる'],
  恋愛: ['plot', '恋愛が主軸'],
  エロ: ['plot', '性的な描写が売りの一つ'],
  スローライフ: ['plot', 'のんびり暮らすことが目的'],

  日常: ['mood', '事件よりも日々の暮らしを描く'],
  コメディ: ['mood', '笑わせることが主眼'],
  ゆるふわ: ['mood', '緊張感のない柔らかい作風'],
  青春: ['mood', '若者の成長や関係が主眼'],
  ダークファンタジー: ['mood', '陰惨・残酷な描写を含む'],
  ファンタジー: ['mood', '異世界と言い切れないファンタジー。異世界ファンタジーと併用しない'],
}

/** Tags that mean the same thing; the second is folded into the first. */
const ALIASES = {
  日常系: '日常',
  'アルケミスト（薬師）': 'アルケミスト',
  'アルケミスト(薬師)': 'アルケミスト',
}

/** More specific wins: a work drawn with a 巨乳メイド is not also just 巨乳. */
const NARROWER = {
  巨乳: ['巨乳剣士', '巨乳メイド', '巨乳エルフ', '巨乳神官'],
  異世界ファンタジー: [],
  魔法: ['補助魔法', '魔法工学'],
}

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter(line => line.includes('='))
    .map(line => {
      const i = line.indexOf('=')
      return [line.slice(0, i).trim(), line.slice(i + 1).trim().replace(/^["']|["']$/g, '')]
    })
)

initializeApp({
  credential: applicationDefault(),
  projectId: env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
})
const db = getFirestore()

const main = async () => {
  const tagDocs = await db.collection(TAGS_PATH).get()
  const animes = await db.collection(ANIMES_PATH).get()

  const worksByTag = new Map()
  for (const anime of animes.docs) {
    for (const ref of anime.get('tags') ?? []) {
      worksByTag.set(ref.id, [...(worksByTag.get(ref.id) ?? []), anime.get('name')?.ja])
    }
  }

  const entries = []
  const unknown = []
  for (const doc of tagDocs.docs) {
    const name = doc.get('name')?.ja?.trim()
    if (!name) continue
    const canonical = ALIASES[name] ?? name
    const meaning = MEANINGS[canonical]
    const works = worksByTag.get(doc.id) ?? []
    if (!meaning) {
      unknown.push(name)
      continue
    }
    entries.push({
      name,
      id: doc.id,
      group: meaning[0],
      criteria: meaning[1],
      ...(canonical !== name ? { aliasOf: canonical } : {}),
      ...(NARROWER[name]?.length ? { narrower: NARROWER[name] } : {}),
      used: works.length,
      // What the site has actually tagged, which is the real definition.
      examples: works.slice(0, 4),
    })
  }

  entries.sort((a, b) => {
    const order = GROUPS.findIndex(g => g.key === a.group) - GROUPS.findIndex(g => g.key === b.group)
    return order !== 0 ? order : b.used - a.used
  })

  mkdirSync('data', { recursive: true })
  writeFileSync(
    OUT,
    stringify({
      // Bumped whenever the criteria change, so a proposal can say which
      // version of the vocabulary produced it.
      version: 1,
      groups: GROUPS,
      tags: entries,
    })
  )

  console.log(`${OUT} に ${entries.length}件`)
  for (const group of GROUPS) {
    console.log(`  ${group.label}: ${entries.filter(e => e.group === group.key).length}件`)
  }
  if (unknown.length) console.log(`\n定義のないタグ ${unknown.length}件: ${unknown.join('、')}`)
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
