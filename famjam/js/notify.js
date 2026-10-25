/* notify.js - a push notification on the owner's phone when someone opens FAM JAM. It goes through ntfy (ntfy.sh, a free push
   service, no sign-up): the ntfy app on the phone subscribes to the topic below, and the game posts "Lisa just opened it" there -
   the family member that phone picked on WHO ARE YOU? (the first screen until it has one: the post waits up to 2 minutes for the
   pick), a phone or a computer, and how many are online. A device sends it at most once every
   half hour (reloads don't buzz again), and the owner's own phones and computers never do: open the game once with ?me on each. */
window.HW = window.HW || {};
(function (HW) {
  // ?notify=127.0.0.1:port posts to a stand-in on this machine instead (for testing; only local)
  var m = /[?&]notify=(localhost|127\.0\.0\.1):(\d+)/.exec(location.search);
  var TOPIC = 'famjam-an8b5m62sbps', BASE = m ? 'http://' + m[1] + ':' + m[2] : 'https://ntfy.sh', API = BASE + '/' + TOPIC;
  var ME = 'famjam.me', LAST = 'famjam.notified', GAP = 30 * 60000, WAIT = 12000, PICK = 120000;
  var GAME = 'https://tanderson5620.github.io/Donut-Town/famjam/';
  function get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
  var N = HW.Notify = { sent: false, marked: false };
  if (/[?&]me(&|=|$)/.test(location.search)) { set(ME, '1'); N.marked = true; }   // one of the owner's own devices (the title screen says so)
  N.mine = function () { return !!get(ME); };
  // once the game's been up a moment (and who's online has a count, if it gets one): tell the owner's phone
  N.start = function () {
    if (N.mine() || /[?&]nostats/.test(location.search) || !window.fetch) return;
    if (!m && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;   // testing on this machine: not the real phone
    if (Date.now() - (+get(LAST) || 0) < GAP) return;
    var t0 = Date.now(), tP = 0, tick = setInterval(function () {
      var Pr = HW.Presence, picked = HW.JamUI && HW.JamUI.who && HW.JamUI.who(), now = Date.now();
      if (!picked && now - t0 < PICK) return;   // who it is first: they're picking on WHO ARE YOU?
      if (!tP) tP = now;
      if (!(Pr && Pr.ok) && now - tP < WAIT) return;   // and who's online, once it has a count
      clearInterval(tick); send(Pr && Pr.ok ? Pr.count : 0);
    }, 500);
  };
  function send(n) {
    var who = get('famjam.who'), d = who && HW.PLAYERS && HW.PLAYERS[who];   // (the family member they picked on WHO ARE YOU?)
    var msg = (d ? d.first : 'Someone') + ' just opened FAM JAM on ' + (HW.TOUCH ? 'a phone' : 'a computer') + (n > 1 ? ' - ' + n + ' online now' : '') + '. Tap to play.';
    set(LAST, String(Date.now())); N.sent = true;
    // a plain POST (title and the tap-through link as query parameters, no custom headers), so the browser sends it as is
    fetch(API + '?title=' + encodeURIComponent('FAM JAM') + '&tags=basketball&click=' + encodeURIComponent(GAME), { method: 'POST', body: msg, mode: 'no-cors' }).catch(function () { });
  }

  /* BUZZ: an invite straight to one family member's own phone, no texting - from the Quest, a computer or another phone. Each
     person can turn it on once on their phone (ONLINE > GET BUZZED): the free ntfy app subscribes to a topic of their own, the
     one below; a buzz posts "Tyler wants to play" there, and tapping it opens the game straight into the room. */
  N.topicFor = function (id) { return TOPIC + '-' + id; };
  N.appLink = function (id) { return 'ntfy://' + (m ? m[1] + ':' + m[2] : 'ntfy.sh') + '/' + N.topicFor(id); };   // (the Android app's subscribe link)
  N.webLink = function (id) { return BASE + '/' + N.topicFor(id); };
  N.buzz = function (id, code, from, test) {
    if (!window.fetch || !HW.PLAYERS[id]) return false;
    if (!m && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return false;   // (testing on this machine: never the real phones)
    var f = from && HW.PLAYERS[from], who = f ? f.first : 'Someone', url = test ? GAME : GAME + '?room=' + code;
    var msg = test ? 'This is what an invite looks like. When someone buzzes you, tap it to jump straight into their game.' : who + ' wants to play FAM JAM with you! Tap to join room ' + code + '.';
    fetch(N.webLink(id) + '?title=' + encodeURIComponent(test ? 'FAM JAM: you\'re all set' : 'FAM JAM: ' + who + ' is calling you') + '&tags=basketball&priority=high&click=' + encodeURIComponent(url), { method: 'POST', body: msg, mode: 'no-cors' }).catch(function () { });
    return true;
  };
})(HW);
