const admin = require("firebase-admin");
const db = admin.firestore();

const ANIMES_PATH = 'versions/1/animes';

/**
 * What the seasons say about each work, keyed by anime id: the cours it aired
 * in and how many ratings it has received.
 *
 * A work no longer stores its own cours — they belong to the seasons beneath
 * it, and the copy on the parent drifted from them. The rating count lives
 * there too, one per season, and the structured data on a work page needs the
 * total. One collection group query covers every work, so a list endpoint pays
 * for it once rather than reading a subcollection per row.
 */
const statsByAnime = async () => {
  const snapshot = await db.collectionGroup('seasons').get();
  const byAnime = new Map();

  snapshot.docs.forEach((doc) => {
    const anime = doc.ref.parent.parent;
    // The query matches any subcollection called seasons; only the ones under
    // the animes collection belong to a work.
    if (!anime || anime.parent.path !== ANIMES_PATH) return;
    const stats = byAnime.get(anime.id) || {cours: new Set(), ratingCount: 0};
    (doc.get('cours') || []).forEach((cour) => stats.cours.add(cour));
    stats.ratingCount += doc.get('ratingCount') || 0;
    byAnime.set(anime.id, stats);
  });

  return new Map(
      [...byAnime].map(([id, stats]) => [
        id,
        {cours: [...stats.cours].sort(), ratingCount: stats.ratingCount},
      ])
  );
};

/** The same for a single work, when the caller only wants one. */
const statsOf = async (animeId) => {
  const snapshot = await db.collection(`${ANIMES_PATH}/${animeId}/seasons`).get();
  const cours = new Set();
  let ratingCount = 0;
  snapshot.docs.forEach((doc) => {
    (doc.get('cours') || []).forEach((cour) => cours.add(cour));
    ratingCount += doc.get('ratingCount') || 0;
  });
  return {cours: [...cours].sort(), ratingCount};
};

module.exports = {statsByAnime, statsOf};
