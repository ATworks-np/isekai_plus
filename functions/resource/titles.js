const admin = require("firebase-admin");
const db = admin.firestore();
const {onRequest} = require("firebase-functions/v2/https");
const caches = {};

exports.titles = onRequest(async  (request, response) => {
  response.set('Access-Control-Allow-Headers', '*')
  response.set('Access-Control-Allow-Origin', '*')
  response.set('Access-Control-Allow-Methods', 'GET')
  const { clear} = request.query;
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
              storyRating: docDate.storyRatings
                  ? docDate.storyRatings.total / docDate.storyRatings.count
                  : 0,
              characterRating: docDate.characterRatings
                  ? docDate.characterRatings.total / docDate.characterRatings.count
                  : 0,
              animationRating: docDate.animationRatings
                  ? docDate.animationRatings.total / docDate.animationRatings.count
                  : 0,
              messageRating: docDate.messageRatings
                  ? docDate.messageRatings.total / docDate.messageRatings.count
                  : 0,
              worldviewRating: docDate.worldviewRatings
                  ? docDate.worldviewRatings.total / docDate.worldviewRatings.count
                  : 0,
            }
          }
          titles.push(data);
        });
        caches['titles'] = {'data': titles};
        response.status(200).json(caches['titles']['data']);
      });
    }else{
      response.status(200).json(caches['titles']['data']);
    }

  } catch (error) {
    console.error('Error fetching animes:', error);
    // response.status(500).json({ error: 'Error fetching anime', message: error?.message });
    response.status(500)
  }
})