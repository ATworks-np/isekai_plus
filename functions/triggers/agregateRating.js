const functions = require('firebase-functions');
const admin = require('firebase-admin');
const db = admin.firestore();
const logger = require("firebase-functions/logger");

exports.onRatingCreated = functions.firestore
    .document('versions/{versionId}/animes/{animeId}/ratings/{ratingType}/userRatings/{ratingId}')
    .onCreate(async (snapshot, context) => {
      const newData = snapshot.data(); // 作成されたドキュメントのデータ
      const { versionId, animeId, ratingType } = context.params;

      const ratingDocRef = db.doc(`versions/${versionId}/animes/${animeId}/ratings/${ratingType}`);

      // 集計データを更新
      const updatedAggregate = {
        totalValue: admin.firestore.FieldValue.increment(newData.value),
        count: admin.firestore.FieldValue.increment(1),
      };

      await db.runTransaction(async (transaction) => {
        const ratingDoc = await transaction.get(ratingDocRef);

        if (ratingDoc.exists) {
          // ドキュメントが存在する場合は更新
          transaction.update(ratingDocRef, updatedAggregate);
        } else {
          // ドキュメントが存在しない場合は作成
          transaction.set(ratingDocRef, {
            totalValue: newData.value,
            count: 1,
          });
        }
      });
    });

exports.onRatingUpdated = functions.firestore
    .document('versions/{versionId}/animes/{animeId}/ratings/{ratingType}/userRatings/{ratingId}')
    .onUpdate(async (change, context) => {
      const beforeData = change.before.data(); // 更新前のデータ
      const afterData = change.after.data();   // 更新後のデータ
      const { versionId, animeId, ratingType } = context.params;

      const ratingDocRef = db.doc(`versions/${versionId}/animes/${animeId}/ratings/${ratingType}`);

      // `value` フィールドの変更を検知
      const beforeValue = beforeData.value || 0;
      const afterValue = afterData.value || 0;
      const valueDifference = afterValue - beforeValue;

      if(valueDifference === 0) return;

      // 集計データを更新
      const updatedAggregate = {
        totalValue: admin.firestore.FieldValue.increment(valueDifference),
      };
      await db.runTransaction(async (transaction) => {
        transaction.update(ratingDocRef, updatedAggregate);
      });
    });

exports.onRankingAggregationWrite = functions.firestore
    .document('versions/{versionId}/animes/{animeId}/ratings/{ratingType}')
    .onWrite(async (change, context) => {
      const beforeData = change.before.data(); // 更新前のデータ
      const afterData = change.after.data();   // 更新後のデータ
      const { versionId, animeId, ratingType } = context.params;

      const animeDocRef = db.doc(`versions/${versionId}/animes/${animeId}`);

      if(afterData.count === 0) return;

      const afterValue = afterData.totalValue || 0;

      // 集計データを更新
      const updatedAggregate = {
        [ratingType+'Rating']: afterValue / afterData.count,
      };
      await db.runTransaction(async (transaction) => {
        transaction.update(animeDocRef, updatedAggregate);
      });
    });
