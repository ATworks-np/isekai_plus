const admin = require("firebase-admin");
const db = admin.firestore();
const {onRequest} = require("firebase-functions/v2/https");
const caches = {};

exports.tags = onRequest(async  (request, response) => {
  response.set('Access-Control-Allow-Headers', '*')
  response.set('Access-Control-Allow-Origin', '*')
  response.set('Access-Control-Allow-Methods', 'GET')
  const { clear} = request.query;
  if(clear == '38FEF305540D4A528BB053A5C1293C83') delete caches['data'];
  try {
    if(!('tags' in caches)){
      const animesCollectionRef = db.collection('versions/1/tags');
      const data = [];
      animesCollectionRef.get().then((querySnapshot) => {
        querySnapshot.docs.forEach((doc) => {
          const docDate = doc.data();
          const datum = {
            id: doc.id,
            path: doc.ref.path,
            name: docDate.name,
          }
          data.push(datum);
        });
        caches['data'] = data;
        response.status(200).json(caches['data']);
      });
    }else{
      response.status(200).json(caches['data']);
    }

  } catch (error) {
    console.error('Error fetching tags:', error);
    // response.status(500).json({ error: 'Error fetching anime', message: error?.message });
    response.status(500)
  }
})