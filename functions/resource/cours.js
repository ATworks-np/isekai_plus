const admin = require("firebase-admin");
const db = admin.firestore();

const ANIMES_PATH = 'versions/1/animes';

/**
 * Which cours each work aired in, keyed by anime id.
 *
 * A work no longer stores its own cours: they belong to the seasons beneath it,
 * and the copy on the parent drifted from them. One collection group query
 * covers every work, so a list endpoint pays for it once rather than reading a
 * subcollection per row.
 */
const coursByAnime = async () => {
  const snapshot = await db.collectionGroup('seasons').get();
  const byAnime = new Map();

  snapshot.docs.forEach((doc) => {
    const anime = doc.ref.parent.parent;
    // The query matches any subcollection called seasons; only the ones under
    // the animes collection belong to a work.
    if (!anime || anime.parent.path !== ANIMES_PATH) return;
    const cours = byAnime.get(anime.id) || new Set();
    (doc.get('cours') || []).forEach((cour) => cours.add(cour));
    byAnime.set(anime.id, cours);
  });

  return new Map([...byAnime].map(([id, cours]) => [id, [...cours].sort()]));
};

/** The same for a single work, when the caller only wants one. */
const coursOf = async (animeId) => {
  const snapshot = await db.collection(`${ANIMES_PATH}/${animeId}/seasons`).get();
  const cours = new Set();
  snapshot.docs.forEach((doc) => (doc.get('cours') || []).forEach((cour) => cours.add(cour)));
  return [...cours].sort();
};

module.exports = { coursByAnime, coursOf };
