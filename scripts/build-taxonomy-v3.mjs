#!/usr/bin/env node
/**
 * Writes the proposed taxonomy to data/taxonomy-v3.yaml. Proposal only — it
 * reads the live dictionary and usage, and writes a file. Nothing is sent back.
 *
 *   node scripts/build-taxonomy-v3.mjs
 *
 * Three things change from v2.
 *
 * The nine groups become seven axes, chosen so that every axis answers a
 * question a reader actually asks: how they got there, how power works, what
 * the lead does for a living, what situation they are in, what furniture the
 * world has, who is on screen, and how it feels. The old `role` group held all
 * four of the last kinds at once — 農家 next to 騎士団 next to 王女 — which is
 * why it had 31 entries and no shape.
 *
 * Criteria are rewritten against a test that can be checked rather than judged:
 * a character counts when they appear on the key visual or the official site's
 * character page. "胸の大きなキャラがいる" is true of most of the catalogue and
 * decides nothing; "…がキービジュアルか公式のキャラクター紹介にいる" can be
 * confirmed, cited, and disagreed with.
 *
 * 異世界ファンタジー and ファンタジー stop being tags. They are on 43 and 10
 * works and say only that the work belongs on this site, which every work does.
 * The distinction they were carrying — フリーレン is fantasy without anyone
 * being reincarnated — moves to a `scope` field on the work.
 */

import { readFileSync, writeFileSync } from 'fs'

const SOURCE = process.argv[2] ?? '.cache/tagdump.json'
const OUT = 'data/taxonomy-v3.yaml'

const AXES = [
  { key: 'arrival', label: '世界への来方', required: true,
    note: 'どうやってその世界に来たか。全作品が判定対象' },
  { key: 'power', label: '力・世界のルール', required: false,
    note: '強さがどう決まるか。数値・技能・魔法の扱い' },
  { key: 'profession', label: '主要人物の生業', required: false,
    note: '何をして生きているか。身分ではなく生業' },
  { key: 'circumstance', label: '境遇・物語の駆動', required: true,
    note: '何が主人公を動かすか。題材もここ' },
  { key: 'world', label: '世界の部品', required: false,
    note: '舞台に繰り返し出てくる仕組み・組織・場所' },
  { key: 'character', label: 'キャラクター', required: false,
    note: '外見・種族・肩書き・関係。キービジュアルとキャラ紹介で判定' },
  { key: 'mood', label: '手触り', required: true,
    note: 'どう感じるか。構成要素ではないので類似度では軽く扱う' },
]

/**
 * axis, slug, and kind for each tag, keyed by its current Japanese name.
 *
 * kind decides how much weight the tag carries when two works are compared.
 * `atomic` is one property; `compound` names two at once (巨乳剣士 is 巨乳 and
 * 剣士), and counting it at full weight scores the same likeness twice;
 * `descriptor` is flavour that says little about what a work resembles.
 */
const MAP = {
  // ── arrival ────────────────────────────────────────────────────────────
  異世界転生: ['arrival', 'isekai-reincarnation', 'atomic'],
  前世の記憶: ['arrival', 'past-life-memory', 'atomic'],
  異世界転移: ['arrival', 'isekai-transport', 'atomic'],
  生まれて転生: ['arrival', 'reborn-as-infant', 'atomic'],
  異世界召喚: ['arrival', 'isekai-summoned', 'atomic'],
  人以外に転生: ['arrival', 'reborn-nonhuman', 'atomic'],
  勇者召喚: ['arrival', 'summoned-as-hero', 'atomic'],
  事故死: ['arrival', 'death-by-accident', 'descriptor'],
  タイムリープ: ['arrival', 'time-loop', 'atomic'],
  不死ループ: ['arrival', 'death-loop', 'atomic'],
  パラレルワールド: ['arrival', 'parallel-world', 'atomic'],

  // ── power ──────────────────────────────────────────────────────────────
  魔法: ['power', 'magic', 'atomic'],
  スキル: ['power', 'skills', 'atomic'],
  ステータス画面: ['power', 'status-screen', 'atomic'],
  固有職: ['power', 'unique-class', 'atomic'],
  マナ: ['power', 'mana', 'atomic'],
  補助魔法: ['power', 'support-magic', 'atomic'],
  不死身: ['power', 'immortal', 'atomic'],
  レベル: ['power', 'levels', 'atomic'],
  職業鑑定: ['power', 'appraisal-rite', 'atomic'],
  隠れスキル: ['power', 'hidden-skill', 'atomic'],
  加護: ['power', 'divine-blessing', 'atomic'],

  // ── profession ─────────────────────────────────────────────────────────
  学生: ['profession', 'student', 'atomic'],
  魔女: ['profession', 'witch', 'atomic'],
  聖女: ['profession', 'saint', 'atomic'],
  'アルケミスト（薬師）': ['profession', 'alchemist', 'atomic'],
  暗殺者: ['profession', 'assassin', 'atomic'],
  領主: ['profession', 'lord', 'atomic'],
  調教師: ['profession', 'tamer', 'atomic'],
  農家: ['profession', 'farmer', 'atomic'],
  賢者: ['profession', 'sage', 'atomic'],
  先生: ['profession', 'teacher', 'atomic'],

  // ── circumstance ───────────────────────────────────────────────────────
  悪役令嬢: ['circumstance', 'villainess', 'atomic'],
  俺TSUEEE: ['circumstance', 'overpowered', 'atomic'],
  勘違い最強: ['circumstance', 'misunderstood-strength', 'atomic'],
  能力無し: ['circumstance', 'powerless-start', 'atomic'],
  犯罪者主人公: ['circumstance', 'criminal-lead', 'atomic'],
  パーティ追放: ['circumstance', 'party-exile', 'atomic'],
  復讐: ['circumstance', 'revenge', 'atomic'],
  スローライフ: ['circumstance', 'slow-life', 'atomic'],
  恋愛: ['circumstance', 'romance', 'atomic'],
  国づくり: ['circumstance', 'nation-building', 'atomic'],
  料理: ['circumstance', 'cooking', 'atomic'],
  グルメ: ['circumstance', 'gourmet', 'atomic'],
  キャンプ: ['circumstance', 'camping', 'atomic'],

  // ── world ──────────────────────────────────────────────────────────────
  ダンジョン: ['world', 'dungeon', 'atomic'],
  冒険者ギルド: ['world', 'adventurers-guild', 'atomic'],
  学園: ['world', 'academy', 'atomic'],
  現代: ['world', 'modern-world', 'atomic'],
  中世風: ['world', 'medieval', 'atomic'],
  貴族社会: ['world', 'noble-society', 'atomic'],
  ゲーム内: ['world', 'game-world', 'atomic'],
  魔法工学: ['world', 'magitech', 'atomic'],
  勇者パーティー: ['world', 'hero-party', 'atomic'],
  騎士団: ['world', 'knight-order', 'atomic'],
  商人ギルド: ['world', 'merchant-guild', 'atomic'],

  // ── character ──────────────────────────────────────────────────────────
  巨乳: ['character', 'busty', 'atomic'],
  巨乳剣士: ['character', 'busty-swordswoman', 'compound'],
  巨乳メイド: ['character', 'busty-maid', 'compound'],
  巨乳エルフ: ['character', 'busty-elf', 'compound'],
  巨乳神官: ['character', 'busty-cleric', 'compound'],
  貧乳エルフ: ['character', 'flat-elf', 'compound'],
  ケモ耳: ['character', 'animal-ears', 'atomic'],
  見た目幼女: ['character', 'child-appearance', 'atomic'],
  むちむち太もも: ['character', 'thick-thighs', 'atomic'],
  双子: ['character', 'twins', 'atomic'],
  ハーレム: ['character', 'harem', 'atomic'],
  神: ['character', 'deity', 'atomic'],
  エルフ: ['character', 'elf', 'atomic'],
  ダークエルフ: ['character', 'dark-elf', 'atomic'],
  獣人: ['character', 'beastfolk', 'atomic'],
  魔族: ['character', 'demonfolk', 'atomic'],
  精霊: ['character', 'spirit', 'atomic'],
  吸血鬼: ['character', 'vampire', 'atomic'],
  貴族令嬢: ['character', 'noble-lady', 'atomic'],
  王女: ['character', 'princess', 'atomic'],
  王子: ['character', 'prince', 'atomic'],
  王: ['character', 'king', 'atomic'],
  勇者: ['character', 'hero', 'atomic'],
  英雄: ['character', 'acclaimed-hero', 'descriptor'],
  聖騎士: ['character', 'paladin', 'descriptor'],
  団長: ['character', 'commander', 'descriptor'],
  魔王: ['character', 'demon-lord', 'atomic'],
  魔王の娘: ['character', 'demon-lord-daughter', 'compound'],
  四天王: ['character', 'four-generals', 'descriptor'],
  喋る武器: ['character', 'talking-weapon', 'atomic'],

  // ── mood ───────────────────────────────────────────────────────────────
  ゆるふわ: ['mood', 'gentle', 'descriptor'],
  ダークファンタジー: ['mood', 'dark', 'descriptor'],
  日常: ['mood', 'slice-of-life', 'descriptor'],
  コメディ: ['mood', 'comedy', 'descriptor'],
  青春: ['mood', 'coming-of-age', 'descriptor'],
  エロ: ['mood', 'ecchi', 'descriptor'],
}

/** Names that stop being tags, with what replaces them. */
const RETIRED = {
  異世界ファンタジー: 'scope フィールドへ。43作品に付いており、このサイトに載っている、以上のことを言っていない',
  ファンタジー: 'scope フィールドへ。異世界ファンタジーとの使い分けが曖昧なまま10作品に付いている',
}

/** Names folded into another tag, which keeps the works. */
const MERGED = {
  エーテル: 'マナ',
  魔法適性鑑定: '職業鑑定',
  令嬢主人公: '貴族令嬢',
  女神: '神',
  日常系: '日常',
}

/**
 * The criteria a tag is judged by, written so two people reading it about the
 * same work reach the same answer. Character axes name where to look; the rest
 * ask whether the thing is load-bearing rather than merely present.
 */
const CRITERIA = {
  character: name =>
    `${name}が、キービジュアルまたは公式サイトのキャラクター紹介に出てくる人物にいる`,
  profession: name => `キービジュアルまたは公式のキャラクター紹介に出る人物が、${name}を生業にしている`,
  power: name => `${name}が作中の力の仕組みとして繰り返し描かれる。一度出るだけでは付けない`,
  world: name => `${name}が舞台の一部として繰り返し出る。名前が一度出るだけでは付けない`,
  arrival: name => `${name}が物語の始まり方である`,
  circumstance: name => `${name}が主人公を動かしている、または話の題材そのもの`,
  mood: name => `作品全体が${name}として読める`,
}

const quote = s => `"${String(s).replace(/"/g, '\\"')}"`

const main = () => {
  const rows = JSON.parse(readFileSync(SOURCE, 'utf8'))
  const byName = Object.fromEntries(rows.map(r => [r.ja, r]))

  const unmapped = rows.filter(r => !MAP[r.ja] && !RETIRED[r.ja] && !MERGED[r.ja])
  if (unmapped.length) {
    console.log('未割り当て:', unmapped.map(r => `${r.ja}(${r.n})`).join(' / '))
  }

  const lines = [
    'version: 3',
    '',
    '# 作品がこのサイトのどこに属するか。タグではなくフィールド。',
    '# 異世界ファンタジーというタグが43作品に付いていた状態を置き換える。',
    'scope:',
    '  - key: isekai',
    '    label: 異世界もの',
    '    note: 転生・転移・召喚のいずれかで異世界に来る',
    '  - key: native-fantasy',
    '    label: 現地ファンタジー',
    '    note: 異世界だが、誰も転生していない。葬送のフリーレンなど',
    '  - key: game-fantasy',
    '    label: ゲーム世界',
    '    note: 舞台がゲームの中。VRMMO、乙女ゲーム',
    '  - key: modern-fantasy',
    '    label: 現代ファンタジー',
    '    note: 現代が舞台で、異世界要素が入り込む',
    '',
    'axes:',
  ]

  for (const axis of AXES) {
    lines.push(`  - key: ${axis.key}`)
    lines.push(`    label: ${axis.label}`)
    lines.push(`    required: ${axis.required}`)
    lines.push(`    note: ${quote(axis.note)}`)
  }

  lines.push('')
  lines.push('# 必須の軸は「タグを必ず1つ付ける」ではなく「必ず判定する」。')
  lines.push('# 該当なしと未確認を区別できないと、埋め忘れが永久に見えない。')
  lines.push('tags:')

  for (const axis of AXES) {
    const inAxis = rows
      .filter(r => MAP[r.ja]?.[0] === axis.key)
      .sort((a, b) => b.n - a.n)
    lines.push('')
    lines.push(`  # ── ${axis.label} (${inAxis.length}) ──`)
    for (const row of inAxis) {
      const [, slug, kind] = MAP[row.ja]
      lines.push(`  - name: ${row.ja}`)
      lines.push(`    slug: ${slug}`)
      lines.push(`    id: ${row.id}`)
      lines.push(`    axis: ${axis.key}`)
      lines.push(`    kind: ${kind}`)
      lines.push(`    used: ${row.n}`)
      lines.push(`    criteria: ${quote(CRITERIA[axis.key](row.ja))}`)
      if (row.en) lines.push(`    en: ${row.en}`)
      const absorbed = Object.entries(MERGED).filter(([, into]) => into === row.ja)
      if (absorbed.length) {
        lines.push(`    absorbs: [${absorbed.map(([from]) => from).join(', ')}]`)
      }
    }
  }

  lines.push('')
  lines.push('# タグをやめるもの。作品側の scope が引き継ぐ。')
  lines.push('retired:')
  for (const [name, why] of Object.entries(RETIRED)) {
    lines.push(`  - name: ${name}`)
    lines.push(`    used: ${byName[name]?.n ?? 0}`)
    lines.push(`    reason: ${quote(why)}`)
  }

  lines.push('')
  lines.push('# 別のタグに畳むもの。付いている作品は畳んだ先へ移す。')
  lines.push('merged:')
  for (const [from, into] of Object.entries(MERGED)) {
    lines.push(`  - from: ${from}`)
    lines.push(`    into: ${into}`)
    lines.push(`    used: ${byName[from]?.n ?? 0}`)
  }

  lines.push('')
  lines.push('# 複合タグは分解せず、原子タグも併せて付ける。')
  lines.push('# 巨乳剣士 の19作品には 巨乳 と 剣士 も付けて、')
  lines.push('# 「巨乳 かつ 剣士」の検索から漏れないようにする。')
  lines.push('compound_expansion:')
  lines.push('  - compound: 巨乳剣士')
  lines.push('    atoms: [巨乳, 剣士]')
  lines.push('  - compound: 巨乳メイド')
  lines.push('    atoms: [巨乳, メイド]')
  lines.push('  - compound: 巨乳エルフ')
  lines.push('    atoms: [巨乳, エルフ]')
  lines.push('  - compound: 巨乳神官')
  lines.push('    atoms: [巨乳, 神官]')
  lines.push('  - compound: 貧乳エルフ')
  lines.push('    atoms: [エルフ]')
  lines.push('  - compound: 魔王の娘')
  lines.push('    atoms: [魔王]')
  lines.push('')
  lines.push('# 分解のために新しく要るタグ。いまの語彙に無い。')
  lines.push('new_tags:')
  for (const [name, axis, slug] of [
    ['剣士', 'profession', 'swordsman'],
    ['メイド', 'profession', 'maid'],
    ['神官', 'profession', 'cleric'],
    ['冒険者', 'profession', 'adventurer'],
    ['商人', 'profession', 'merchant'],
    ['鍛冶師', 'profession', 'blacksmith'],
    ['騎士', 'profession', 'knight'],
    ['魔法使い', 'profession', 'mage'],
  ]) {
    lines.push(`  - name: ${name}`)
    lines.push(`    slug: ${slug}`)
    lines.push(`    axis: ${axis}`)
    lines.push(`    criteria: ${quote(CRITERIA[axis](name))}`)
  }

  writeFileSync(OUT, lines.join('\n') + '\n')

  const counts = AXES.map(a => `${a.label} ${rows.filter(r => MAP[r.ja]?.[0] === a.key).length}`)
  console.log(counts.join(' / '))
  console.log(`廃止 ${Object.keys(RETIRED).length} / 統合 ${Object.keys(MERGED).length}`)
  console.log(`→ ${OUT}`)
}

main()
