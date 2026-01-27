const WebSocket = require("ws");

function randomId(prefix = "P") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}-${out}`;
}

const WS_URL = process.env.WS_URL || "ws://localhost:3001";
const ROOM_CODE = process.env.ROOM_CODE || "ROOM1";
const CLIENTS = Number(process.env.CLIENTS || "10");

let connected = 0;
let closed = 0;

function connectClient(index) {
  const ws = new WebSocket(WS_URL);
  const playerId = randomId("P");
  const avatarId = `avatar_${index}`;

  ws.on("open", () => {
    connected += 1;
    ws.send(
      JSON.stringify({
        type: "join",
        payload: {
          roomCode: ROOM_CODE,
          playerId,
          avatarId,
        },
      }),
    );

    setTimeout(() => {
      ws.send(
        JSON.stringify({
          type: "answer",
          payload: {
            roomCode: ROOM_CODE,
            playerId,
            answerIndex: index % 4,
            latencyMs: Math.floor(Math.random() * 400),
          },
        }),
      );
    }, 500 + Math.random() * 1000);
  });

  ws.on("close", () => {
    closed += 1;
  });
}

for (let i = 0; i < CLIENTS; i += 1) {
  connectClient(i);
}

setInterval(() => {
  console.log(
    JSON.stringify({
      wsUrl: WS_URL,
      roomCode: ROOM_CODE,
      clients: CLIENTS,
      connected,
      closed,
    }),
  );
}, 2000);
