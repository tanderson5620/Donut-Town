/* presence.js - who's online: how many people have FAM JAM open right now. No server of our own: on PeerJS's free cloud server
   (the one online play uses) the first one on takes a well-known lobby ID and keeps the count; everyone else connects to it and
   checks in every few seconds, and it sends the count back out. If the lobby's phone goes away (closed, or put in the background),
   the others race to take the ID over. Nothing goes over the wire but a random ID and the count - and an invite: someone hosting
   a room can send its code to everyone else online (P.invite), which pops up on their screens (P.onInvite). P.onArrive says when
   someone new comes on: every visit has a random tag that only lives as long as the page, the lobby sends them round with the count,
   and a tag not seen in the last minute is someone new (so the lobby moving phones, or a phone back from the background, isn't).
   Each check-in also says who it is - the family member that phone picked (WHO ARE YOU? in ui.js), phone or computer, and what it's
   doing (on the menus, playing the CPU, hosting a room, in someone's room, in an online game; P.describe) - and the lobby sends the
   list round (P.people), so the ONLINE screen can show who's on and challenge one of them: an invite with a "to" goes to that
   phone alone. */
window.HW = window.HW || {};
(function (HW) {
  var P = HW.Presence = { count: 0, ok: false, role: null, log: [], onInvite: null, onArrive: null, people: [], describe: null };
  function note(m) { P.log.push((Date.now() % 100000) + ' ' + m); if (P.log.length > 30) P.log.shift(); }   // the last few things that happened (for checking)
  var LOBBY = 'famjam-lobby-v1', CHECKIN = 2000, DROP = 9000, QUIET = 7000, ANSWER = 6000;
  var peer = null, members = {}, hub = null, retryT = null, tickT = null, heard = 0, started = false, seen = null, FORGET = 60000;
  var TAG = P.tag = Math.random().toString(36).slice(2, 10);
  // who this phone is and what it's doing (filled in by ui.js): { nm: name or '', dv: 'p' phone / 'c' computer, st: m/c/h/r/g }
  function me() { var d = {}; try { d = P.describe ? P.describe() || {} : {}; } catch (e) { } return { nm: String(d.nm || '').slice(0, 16), dv: d.dv === 'c' ? 'c' : 'p', st: String(d.st || 'm').slice(0, 1) }; }
  function hi() { var d = me(); return { t: 'hi', id: TAG, nm: d.nm, dv: d.dv, st: d.st }; }
  function clean(m) { return { nm: String(m.nm || '').slice(0, 16), dv: m.dv === 'c' ? 'c' : 'p', st: String(m.st || 'm').slice(0, 1) }; }
  function opts() { return HW.Net && HW.Net.peerOpts ? HW.Net.peerOpts() : { debug: 0 }; }
  function now() { return Date.now(); }
  function send(c, m) { try { if (c && c.open) c.send(m); } catch (e) { } }
  P.start = function () {
    if (started || !HW.Net || !HW.Net.loadLib) return; started = true;
    HW.Net.loadLib().then(claim, function () { started = false; });
  };
  // let go of everything (forgotten first, so the closing connections' own handlers see they're old news and stay out of it)
  function stop() {
    var h = hub, pr = peer, ms = members;
    hub = null; peer = null; members = {}; P.role = null; P.ok = false; P.people = [];
    clearInterval(tickT); tickT = null; clearTimeout(retryT); retryT = null;
    if (h) try { h.close(); } catch (e) { }
    Object.keys(ms).forEach(function (k) { try { ms[k].c.close(); } catch (e) { } });
    if (pr) try { pr.destroy(); } catch (e) { }
  }
  function retry(ms) { stop(); retryT = setTimeout(claim, ms); }
  // take the lobby ID if it's free (then this phone keeps the count), otherwise join whoever has it
  function claim() {
    if (document.hidden) return;
    stop();
    var pr = new Peer(LOBBY, opts()); peer = pr;
    pr.on('open', function () { if (peer !== pr) return; note('hub'); P.role = 'hub'; P.ok = true; recount(); tickT = setInterval(sweep, 2000); });
    pr.on('connection', function (c) {
      c.on('data', function (m) {
        if (m && m.t === 'hi') { var k = members[c.peer], tag = String(m.id || c.peer).slice(0, 16); if (!k) { members[c.peer] = { c: c, t: now(), id: tag, who: clean(m) }; recount(); } else { k.t = now(); k.who = clean(m); } }
        if (m && m.t === 'inv' && /^\d{4}$/.test(m.code)) relay(m.code, c.peer, m.to, m.fr);   // a member's invite: on to whoever it's for (everyone else, or one)
      });
      c.on('close', function () { if (members[c.peer] && members[c.peer].c === c) { delete members[c.peer]; recount(); } });
    });
    pr.on('error', function (e) {
      if (peer !== pr) return;
      note('claim error ' + (e && e.type));
      if (e && e.type === 'unavailable-id') join(); else retry(15000);   // taken: someone's the lobby already
    });
    pr.on('disconnected', function () { if (peer === pr && P.role === 'hub') try { pr.reconnect(); } catch (e) { retry(3000); } });
  }
  // the lobby: drop anyone not heard from in a while, and send everyone the count (every 2 s, so they know it's still here)
  function sweep() { var t = now(); Object.keys(members).forEach(function (k) { if (t - members[k].t > DROP) { try { members[k].c.close(); } catch (e) { } delete members[k]; } }); recount(); }
  function recount() {
    var d = me(), ids = [TAG], who = [{ id: TAG, nm: d.nm, dv: d.dv, st: d.st }];
    Object.keys(members).forEach(function (k) { var q = members[k]; if (ids.indexOf(q.id) < 0) { ids.push(q.id); who.push({ id: q.id, nm: q.who ? q.who.nm : '', dv: q.who ? q.who.dv : 'p', st: q.who ? q.who.st : 'm' }); } });   // (a phone that reconnected is only on once)
    P.count = ids.length; Object.keys(members).forEach(function (k) { send(members[k].c, { t: 'n', n: P.count, ids: ids, who: who }); }); heardWho(who); counted(ids);
  }
  // everybody else on, as the lobby last said: [{ id, nm, dv, st }]
  function heardWho(who) { if (who && who.filter) P.people = who.filter(function (q) { return q && q.id !== TAG; }).map(function (q) { var w = clean(q); w.id = String(q.id); return w; }); }
  // who's new: a tag not seen in the last minute (the first time, everyone else on counts as new); their names, if they picked one
  function counted(ids) {
    if (!ids || !ids.slice) return;
    var t = now(), first = !seen, fresh = [], names = []; seen = seen || {};
    ids.forEach(function (id) { if (id !== TAG && !(seen[id] && t - seen[id] < FORGET)) fresh.push(id); seen[id] = t; });
    fresh.forEach(function (id) { P.people.forEach(function (q) { if (q.id === id && q.nm) names.push(q.nm); }); });
    if (fresh.length) { note('arrived ' + fresh.length); if (P.onArrive) try { P.onArrive(fresh.length, first, names, fresh); } catch (e) { } }
  }
  // invites: the lobby passes one on to the phone it's for (to: its tag), or to everybody but whoever sent it
  function relay(code, from, to, fr) {
    var m = { t: 'inv', code: code, fr: String(fr || '').slice(0, 16) };
    if (to) { if (to === TAG) got(code, m.fr); else Object.keys(members).forEach(function (k) { if (members[k].id === to) send(members[k].c, m); }); return; }
    Object.keys(members).forEach(function (k) { if (k !== from) send(members[k].c, m); });
    if (from) got(code, m.fr);   // (a member's: the lobby's phone is one of the others)
  }
  function got(code, fr) { note('invited ' + code); if (P.onInvite) try { P.onInvite(code, fr || ''); } catch (e) { } }
  // send an invite to this room to everyone else online, or (to: a tag from P.people) one of them; how many it went to (0: nobody
  // else is on, or we're not connected)
  P.invite = function (code, to) {
    if (!P.ok || !/^\d{4}$/.test(code)) return 0;
    var fr = me().nm;
    if (P.role === 'hub') relay(code, null, to, fr); else if (hub) send(hub, { t: 'inv', code: code, to: to || null, fr: fr }); else return 0;
    return to ? (P.people.some(function (q) { return q.id === to; }) ? 1 : 0) : Math.max(0, P.count - 1);
  };
  // the lobby hears what this phone is up to on every check-in; ui.js calls this when it changes so it shows sooner
  P.update = function () { if (P.role === 'member' && hub) send(hub, hi()); else if (P.role === 'hub') recount(); };
  function join() {
    stop();
    var pr = new Peer(opts()); peer = pr;
    pr.on('open', function () {
      if (peer !== pr) return;
      var c = pr.connect(LOBBY, { reliable: true }); hub = c; heard = now();
      // the ID's taken but nobody answers (a phone that dropped off without letting go: the server holds its ID a while): try again
      setTimeout(function () { if (hub === c && P.role !== 'member') { note('lobby no answer'); retry(1000 + Math.random() * 2000); } }, ANSWER);
      c.on('open', function () { if (hub !== c) return; note('member'); P.role = 'member'; send(c, hi()); });
      c.on('data', function (m) { if (m && m.t === 'n') { P.count = m.n; P.ok = true; heard = now(); heardWho(m.who); counted(m.ids); } if (m && m.t === 'inv' && /^\d{4}$/.test(m.code)) got(m.code, m.fr); });
      c.on('close', function () { if (hub === c) { note('lobby closed'); retry(400 + Math.random() * 2500); } });   // the lobby went away: race to take it over
      clearInterval(tickT);
      tickT = setInterval(function () {
        if (hub !== c) return;
        send(c, hi());
        if (now() - heard > QUIET) { note('lobby quiet'); retry(400 + Math.random() * 2500); }   // nothing from it in a while: it's gone without a goodbye
      }, CHECKIN);
    });
    pr.on('error', function (e) {
      if (peer !== pr) return;
      note('member error ' + (e && e.type));
      retry(e && e.type === 'peer-unavailable' ? 300 + Math.random() * 1500 : 15000);   // the lobby had just left: take it
    });
  }
  // put away in the background on a phone: let go (somebody else keeps the count); back in front: come back in
  document.addEventListener('visibilitychange', function () { if (!started) return; if (document.hidden) stop(); else retry(200 + Math.random() * 600); });
  window.addEventListener('pagehide', stop);
})(HW);
