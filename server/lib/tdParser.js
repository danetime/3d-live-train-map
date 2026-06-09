/**
 * Parse a Network Rail TD (Train Describer) message frame.
 *
 * The feed delivers JSON arrays of messages, each wrapped by its type, e.g.
 *   {"CA_MSG":{"time":"1349696911000","area_id":"SW","from":"0123","to":"0125","descr":"2T31"}}
 *
 * C-class messages we care about:
 *   CA — berth step:      train `descr` moves `from` berth → `to` berth
 *   CC — berth interpose:  train `descr` placed into `to` berth
 *   CB — berth cancel:     berth `from` is cleared
 *   CT — heartbeat:        ignored
 *
 * Docs: https://wiki.openraildata.com/index.php/C_Class_Messages
 */
const TYPES = { CA_MSG: "CA", CB_MSG: "CB", CC_MSG: "CC", CT_MSG: "CT" };

export function parseTdFrame(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return [];
  }
  const arr = Array.isArray(data) ? data : [data];
  const out = [];
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    for (const key of Object.keys(item)) {
      const type = TYPES[key];
      if (!type || type === "CT") continue;
      const m = item[key] || {};
      out.push({
        type,
        area: m.area_id,
        from: m.from,
        to: m.to,
        descr: (m.descr || "").trim(),
        time: Number(m.time) || Date.now(),
      });
    }
  }
  return out;
}
