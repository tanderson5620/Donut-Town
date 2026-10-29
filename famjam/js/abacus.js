/* abacus.js - every request to Abacus (the free counting service behind the play count and the leaderboard) goes through here.
   Abacus takes at most 30 requests every 10 seconds from one internet connection - phones on the same Wi-Fi share that - and
   refuses the rest (429). So requests go out paced, at most 24 every 10.5 s, counts before reads; one that's refused or fails
   waits and goes again, and only a counter that isn't there (404) reads as missing - a refusal is never taken for a zero. */
window.HW = window.HW || {};
(function (HW) {
  // ?count=127.0.0.1:port uses a stand-in on this machine instead (for testing; only local)
  var m = /[?&]count=(localhost|127\.0\.0\.1):(\d+)/.exec(location.search);
  var A = HW.Abacus = { API: m ? 'http://' + m[1] + ':' + m[2] : 'https://abacus.jasoncameron.dev', NS: 'tanderson5620-famjam', stub: !!m };
  var MAX = 24, WIN = 10500, sent = [], q = [], hold = 0, timer = null;
  function later(ms) { if (!timer) timer = setTimeout(pump, Math.max(20, ms)); }
  function pump() {
    timer = null; var now = Date.now();
    while (sent.length && now - sent[0] > WIN) sent.shift();
    if (now < hold) return later(hold - now);
    while (q.length && sent.length < MAX) { sent.push(now); send(q.shift()); }
    if (q.length) later(WIN - (now - sent[0]) + 30);
  }
  function send(j) {
    fetch(A.API + '/' + j.kind + '/' + A.NS + '/' + j.key, { cache: 'no-store' }).then(function (r) {
      if (r.status === 404) return { miss: true };   // no such counter (yet)
      if (j.kind === 'create' && (r.ok || r.status === 409)) return { made: true };   // (409: someone else just made it)
      if (!r.ok) throw r.status;   // 429 refused, or the service is having trouble
      return r.json().then(function (d) { if (d && typeof d.value === 'number') return { v: d.value }; throw 'bad'; });
    }).then(j.done, function (e) {
      // refused: everything waits out the window; no answer at all (offline): a few seconds, longer each time
      // (a little random, so two phones on the same Wi-Fi don't keep coming back at the same moment)
      if (e === 429) { hold = Math.max(hold, Date.now() + WIN + Math.random() * 4000); sent = []; } else hold = Math.max(hold, Date.now() + 2500 * (j.tries + 1));
      if (++j.tries >= j.max) return j.done({ fail: true });
      put(j, true); later(hold - Date.now());
    });
  }
  function put(j, front) {
    var i = front ? 0 : q.length;
    if (j.pri) { i = 0; if (!front) while (i < q.length && q[i].pri) i++; }   // counts go ahead of reads
    q.splice(i, 0, j);
  }
  // one request: resolves to { v: value }, { miss: true } (no such counter), { made: true } (create) or { fail: true } (gave up)
  A.req = function (kind, key, tries) {
    if (!window.fetch) return Promise.resolve({ fail: true });
    return new Promise(function (res) { put({ kind: kind, key: key, done: res, tries: 0, max: tries || 5, pri: kind !== 'get' }); later(0); });
  };
  A.get = function (key, tries) { return A.req('get', key, tries); };
  // one more on a counter; if it isn't there yet, make it and count again
  A.hit = function (key, tries) {
    return A.req('hit', key, tries).then(function (r) {
      if (!r.miss) return r;
      return A.req('create', key, tries).then(function (c) { return c.fail ? c : A.req('hit', key, tries); });
    });
  };
  A.queued = function () { return q.length; };
})(window.HW);
