const functions = require("firebase-functions");
const admin = require("firebase-admin");
const db = admin.firestore();

exports.decrementCommentCount = functions.firestore
    .document("versions/1/animes/{animeId}/comments/{commentId}")
    .onDelete(async (snapshot, context) => {
      const { animeId } = context.params;

      // 親ドキュメントの参照
      const animeDocRef = db.collection("versions/1/animes").doc(animeId);

      // commentCount をデクリメント
      try {
        await animeDocRef.update({
          commentCount: admin.firestore.FieldValue.increment(-1),
        });
        console.log(`commentCount decremented for animeId: ${animeId}`);
      } catch (error) {
        console.error("Error decrementing commentCount:", error);
      }
    });