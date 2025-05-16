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
const { onRatingCreated } = require("./triggers/agregateRating");
const { onRatingUpdated } = require("./triggers/agregateRating");
const { onRankingAggregationWrite } = require("./triggers/agregateRating");

// トリガーをエクスポート
exports.incrementCommentCount = incrementCommentCount;
exports.decrementCommentCount = decrementCommentCount;
exports.onRatingCreated = onRatingCreated;
exports.onRatingUpdated = onRatingUpdated;
exports.onRankingAggregationWrite = onRankingAggregationWrite;

