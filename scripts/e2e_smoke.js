const WebSocket = require('ws');

async function head(url) {
  try {
    const res = await fetch(url, { method: 'HEAD' });
    return { ok: res.ok, status: res.status };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function wsSmoke() {
  return new Promise((resolve) => {
    const result = {
      ok: false,
      joined: false,
      answered: false,
      errors: [],
    };
    const roomCode = `SMK${Math.floor(Math.random() * 9)}`;
    const playerId = `smoke-${Date.now()}`;
    const avatarId = '1001';
    const ws = new WebSocket('wss://ws.escapers.app');

    const timeout = setTimeout(() => {
      result.errors.push('timeout');
      ws.close();
    }, 10000);

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'join', payload: { roomCode, playerId, avatarId } }));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (msg.type === 'joined') {
          result.joined = true;
          ws.send(
            JSON.stringify({
              type: 'answer',
              payload: { roomCode, playerId, answerIndex: 1, latencyMs: 120 },
            })
          );
          return;
        }
        if (msg.type === 'answer') {
          result.answered = true;
          result.ok = true;
          clearTimeout(timeout);
          ws.close();
        }
      } catch (err) {
        result.errors.push(`parse:${err}`);
      }
    });

    ws.on('error', (err) => {
      result.errors.push(`ws:${err.message}`);
    });

    ws.on('close', () => {
      clearTimeout(timeout);
      resolve(result);
    });
  });
}

(async () => {
  const results = {
    timestamp: new Date().toISOString(),
    http: {
      escapers: await head('https://escapers.app'),
      www: await head('https://www.escapers.app'),
      wsHealth: await head('https://ws.escapers.app/health'),
    },
    ws: await wsSmoke(),
  };
  console.log(JSON.stringify(results, null, 2));
})();
