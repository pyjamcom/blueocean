const assert = require("assert");

function requireFields(obj, fields) {
  fields.forEach((field) => {
    assert.ok(obj[field] !== undefined, `missing field: ${field}`);
  });
}

function run() {
  const join = { type: "join", player: { id: "p1" }, room: { code: "ABCD" } };
  requireFields(join, ["type", "player", "room"]);

  const start = { type: "start", room: { code: "ABCD" }, seed: 123 };
  requireFields(start, ["type", "room", "seed"]);

  const question = { type: "question", question: { id: "q1" }, timer_ms: 5000 };
  requireFields(question, ["type", "question", "timer_ms"]);

  const answer = {
    type: "answer",
    player: { id: "p1" },
    answer: { id: "a1" },
    latency_ms: 200,
  };
  requireFields(answer, ["type", "player", "answer", "latency_ms"]);

  const score = {
    type: "score",
    leaderboard: [{ player_id: "p1", score: 10, rank: 1, streak: 2 }],
  };
  requireFields(score, ["type", "leaderboard"]);

  const next = { type: "next", next_question_id: "q2" };
  requireFields(next, ["type", "next_question_id"]);

  console.log("ws_payloads.spec.js passed");
}

if (require.main === module) {
  run();
}

module.exports = { run };
