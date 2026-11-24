// Coordinate tabs of this origin with an opaque project ID. The storage copy
// lets a suspended tab check the newest claim before handling its next input.
export function activeProjectSlot(onChange) {
  const key = "dv-active-project";
  let latest, lastStored, channel;
  const valid = (c) =>
    typeof c?.id === "string" &&
    typeof c.nonce === "string" &&
    Number.isSafeInteger(c.time);
  function read() {
    try {
      const stored = JSON.parse(localStorage.getItem(key));
      // Storage writes have a common order for all tabs. Always take the actual
      // last write, including when clocks tie or older events arrive later.
      if (valid(stored) && lastStored !== stored.nonce) {
        latest = stored;
        lastStored = stored.nonce;
      }
    } catch {
      // A BroadcastChannel still coordinates open tabs if storage is disabled.
    }
    return latest;
  }
  function received({ claim, stored } = {}) {
    read();
    // Only coordinate via timestamps when a browser could not persist a claim.
    if (
      (!stored || !lastStored) &&
      valid(claim) &&
      (!latest ||
        claim.time > latest.time ||
        (claim.time === latest.time && claim.nonce > latest.nonce))
    ) {
      latest = claim;
    }
    onChange(latest?.id);
  }
  window.addEventListener("storage", (event) => {
    if (event.key === key) onChange(read()?.id);
  });
  try {
    channel = new BroadcastChannel(key);
    channel.onmessage = ({ data }) => received(data);
  } catch {
    /* Storage events also work without BroadcastChannel. */
  }
  return {
    read,
    claim(id) {
      const before = read();
      if (before?.id === id) return;
      latest = {
        id,
        nonce: crypto.randomUUID(),
        time: Math.max(Date.now(), (before?.time || 0) + 1),
      };
      let stored = false;
      try {
        localStorage.setItem(key, JSON.stringify(latest));
        lastStored = latest.nonce;
        stored = true;
      } catch {
        /* The channel remains available. */
      }
      channel?.postMessage({ claim: latest, stored });
    },
  };
}
