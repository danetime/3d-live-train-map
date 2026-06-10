/**
 * Connects to the Network Rail STOMP broker and feeds parsed TD berth updates
 * to a callback. Uses a durable subscription (client-id = login) so brief
 * disconnects don't lose messages. `stompit` is imported lazily so the server
 * still runs in replay mode if it isn't installed.
 *
 * Docs: https://wiki.openraildata.com/index.php/Connecting_with_Stomp
 */
import { parseTdFrame } from "./tdParser.js";

const HOST = "publicdatafeeds.networkrail.co.uk";
const PORT = 61618;

export async function startStomp({ username, password, topic, onUpdate }) {
  let stompit;
  try {
    stompit = (await import("stompit")).default;
  } catch {
    console.error("[td] 'stompit' is not installed. Run: cd server && npm install");
    return;
  }
  let messages = 0;

  const connectOptions = {
    host: HOST,
    port: PORT,
    connectHeaders: {
      host: "/",
      login: username,
      passcode: password,
      "heart-beat": "15000,15000",
      "client-id": username, // durable subscription
    },
  };

  const connect = () => {
    stompit.connect(connectOptions, (err, client) => {
      if (err) {
        console.error("[td] connect error:", err.message, "— retrying in 5s");
        console.error("[td] (check NR_USERNAME/NR_PASSWORD and that your account is activated)");
        return setTimeout(connect, 5000);
      }
      console.log(`[td] connected ✓  subscribing to /topic/${topic}`);
      client.subscribe(
        { destination: `/topic/${topic}`, ack: "auto", "activemq.subscriptionName": username },
        (subErr, message) => {
          if (subErr) {
            console.error("[td] subscribe error:", subErr.message);
            return;
          }
          message.readString("utf-8", (readErr, body) => {
            if (readErr || !body) return;
            if (messages === 0) console.log("[td] receiving TD messages ✓");
            messages++;
            for (const update of parseTdFrame(body)) onUpdate(update);
          });
        },
      );
      client.on("error", (e) => {
        console.error("[td] client error:", e.message, "— reconnecting in 5s");
        setTimeout(connect, 5000);
      });
    });
  };

  connect();
}
