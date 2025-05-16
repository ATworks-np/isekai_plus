const functions = require("firebase-functions");
const admin = require('firebase-admin')
const db = admin.firestore();

// サブコレクションにドキュメントが追加された際のトリガー
exports.incrementCommentCount = functions.firestore
    .document("versions/1/animes/{animeId}/comments/{commentId}")
    .onCreate(async (snapshot, context) => {
      const { animeId } = context.params;

      // 親ドキュメントの参照
      const animeDocRef = db.collection("versions/1/animes").doc(animeId);

      // commentCount をインクリメント
      await animeDocRef.update({
        commentCount: admin.firestore.FieldValue.increment(1),
      });

      console.log(`commentCount incremented for animeId: ${animeId}`);
    });