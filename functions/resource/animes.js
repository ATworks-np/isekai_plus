const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");
const db = admin.firestore();
const {onRequest} = require("firebase-functions/v2/https");

const caches = {};

const app = express();

app.use(cors({
  origin: '*', // 許可するオリジン
  methods: ['GET', 'OPTIONS'], // 許可するメソッド
  allowedHeaders: ['Authorization', 'Content-Type'], // 許可するヘッダー
}));

app.get("/", async (req, res) => {
  const { clear} = req.query;
  if(clear == '38FEF305540D4A528BB053A5C1293C83') delete caches['titles'];
  try {
    if(!('titles' in caches)){
      const animesCollectionRef = db.collection('versions/1/animes');
      const titles = [];
      animesCollectionRef.get().then((querySnapshot) => {
        querySnapshot.docs.forEach((doc) => {
          const docDate = doc.data();
          const data = {
            id: doc.id,
            name: docDate.name,
            cours: docDate.cours,
            commentCount: docDate.commentCount,
            tags: docDate.tags.map(tag => tag.path),
            ratings: {
              story: docDate.storyRating || 0,
              character: docDate.characterRating || 0,
              animation: docDate.animationRating || 0,
              message: docDate.messageRating || 0,
              worldview: docDate.worldviewRating || 0,
            },
            rating: ((docDate.storyRating || 0) + (docDate.characterRating || 0) + (docDate.animationRating || 0) + (docDate.messageRating || 0) + (docDate.worldviewRating || 0))/5,
          }
          titles.push(data);
        });
        caches['titles'] = {'data': titles};
        res.status(200).json(caches['titles']['data']);
      });
    }else{
      res.status(200).json(caches['titles']['data']);
    }

  } catch (error) {
    console.error('Error fetching animes:', error);
    // res.status(500).json({ error: 'Error fetching anime', message: error?.message });
    res.status(500)
  }
});

const ratingKeys = ['story', 'character', 'animation', 'worldview', 'message']

app.get("/:id/my_ratings", async (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).send('Unauthorized: Missing or invalid token');
    return;
  }

  const idToken = authHeader.split('Bearer ')[1];
  const animeId = req.params.id;

  try {
    // トークンを検証して uid を取得
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const promiseRatings = ratingKeys.map(async (ratingKey) => {
      const ratingDocRef = db.collection(`versions/1/animes/${animeId}/ratings/${ratingKey}/userRatings`).doc(uid);
      const docSnap = await ratingDocRef.get();
      if (!docSnap.exists) {
        return 0;
      }

      return docSnap.data().value
    })

    const ratingValues = await Promise.all(promiseRatings);

    const result = ratingKeys.reduce((acc, key, index) => {
      acc[key] = ratingValues[index];
      return acc;
    }, {});

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching animes:', error);
    res.status(500)
  }
});

app.get("/:id/statics", async (req, res) => {
  const { id } = req.params;

  try {
    const animesCollectionRef = db.collection('versions/1/animes');
    const docRef = animesCollectionRef.doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      return res.status(404).json({ error: 'Anime not found' });
    }

    const docData = docSnap.data();

    const data = {
      id: docSnap.id,
      name: docData.name,
      cours: docData.cours,
      tags: (docData.tags || []).map(tag => tag.path), // tagsが未定義でも安全に処理
    };

    return res.json(data);
  } catch (error) {
    console.error('Error fetching anime:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});


app.get("/statics", async (req, res) => {
  try {
    const animesCollectionRef = db.collection('versions/1/animes');
    const snapshot = await animesCollectionRef.get();

    const data = snapshot.docs.map(doc => {
      const docData = doc.data();
      return {
        id: doc.id,
        name: docData.name,
        cours: docData.cours,
        tags: (docData.tags || []).map(tag => tag.path), // tags安全処理
      };
    });

    return res.json(data);
  } catch (error) {
    console.error('Error fetching animes:', error);
    return res.status(500).json({ error: 'Failed to fetch animes' });
  }
});


app.get("/ids", async (req, res) => {
  try {
    const animesCollectionRef = db.collection('versions/1/animes');
    const snapshot = await animesCollectionRef.get();

    const ids = snapshot.docs.map(doc => doc.id);

    res.json({ ids }); // → { "ids": ["id1", "id2", "id3"] }
  } catch (error) {
    console.error('Error fetching ids:', error);
    res.status(500).json({ error: 'Failed to fetch ids' });
  }
})


exports.animes = onRequest(app);