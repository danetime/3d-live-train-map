/** Minimal WebSocket fan-out: broadcasts train snapshots to all browsers. */
import { WebSocketServer } from "ws";

export function startWsServer(port, getSnapshot) {
  const wss = new WebSocketServer({ port });

  wss.on("connection", (ws) => {
    // Send the current state immediately so a new client isn't blank.
    ws.send(JSON.stringify({ type: "trains", trains: getSnapshot() }));
  });

  function broadcast(obj) {
    const s = JSON.stringify(obj);
    for (const client of wss.clients) {
      if (client.readyState === 1) client.send(s);
    }
  }

  return { wss, broadcast };
}
