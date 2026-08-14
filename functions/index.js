/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
const admin = require('firebase-admin')
admin.initializeApp();

// resource
const { titles } = require('./resource/titles');
const { tags } = require('./resource/tags');
const { animes } = require('./resource/animes');

exports.titles = titles;
exports.tags = tags;
exports.animes = animes;

// トリガーファイルをインポート
const { incrementCommentCount } = require("./triggers/incrementCommentCount");
const { decrementCommentCount } = require("./triggers/decrementCommentCount");

// トリガーをエクスポート
// 評価の集計は PUT /api/v1/animes/:id/seasons/:seasonId/ratings が
// トランザクションで行うため、旧トリガー3本は削除済み。
exports.incrementCommentCount = incrementCommentCount;
exports.decrementCommentCount = decrementCommentCount;

