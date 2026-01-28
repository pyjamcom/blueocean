const assert = require("assert");

function requireFields(obj, fields) {
  fields.forEach((field) => {
    assert.ok(obj[field] !== undefined, `missing field: ${field}`);
  });
}

function run() {
  const join = { type: "join", payload: { roomCode: "ABCD", playerId: "p1", avatarId: "a1" } };
  requireFields(join, ["type", "payload"]);
  requireFields(join.payload, ["roomCode", "playerId", "avatarId"]);

  const stage = { type: "stage", payload: { roomCode: "ABCD", phase: "round", questionIndex: 0, roundStartAt: 123 } };
  requireFields(stage, ["type", "payload"]);
  requireFields(stage.payload, ["roomCode", "phase"]);

  const question = {
    type: "question",
    payload: {
      id: "q1",
      questionIndex: 0,
      prompt_image: "asset_1",
      answers: [
        { id: "a1", asset_id: "x1" },
        { id: "a2", asset_id: "x2" },
        { id: "a3", asset_id: "x3" },
        { id: "a4", asset_id: "x4" },
      ],
      correct_index: 2,
      duration_ms: 6000,
    },
  };
  requireFields(question, ["type", "payload"]);
  requireFields(question.payload, ["id", "prompt_image", "answers", "correct_index", "duration_ms"]);

  const answer = {
    type: "answer",
    payload: { roomCode: "ABCD", playerId: "p1", answerIndex: 1, latencyMs: 200, questionIndex: 0 },
  };
  requireFields(answer, ["type", "payload"]);
  requireFields(answer.payload, ["roomCode", "playerId", "answerIndex", "latencyMs"]);

  const score = {
    type: "score",
    payload: {
      roomCode: "ABCD",
      players: [{ id: "p1", avatarId: "a1", score: 10, correctCount: 1, streak: 1, ready: true }],
    },
  };
  requireFields(score, ["type", "payload"]);
  requireFields(score.payload, ["roomCode", "players"]);

  const next = { type: "stage", payload: { roomCode: "ABCD", phase: "leaderboard" } };
  requireFields(next, ["type", "payload"]);

  console.log("ws_payloads.spec.js passed");
}

if (require.main === module) {
  run();
}

module.exports = { run };
