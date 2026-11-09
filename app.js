/* Nachttisch-Wecker: Uhr, Wecker, Termine. Reines ES5 für Safari auf iOS 10. */
(function () {
  'use strict';

  var DAYNAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
  var MONTHS = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
  var DAYSHORT = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
  var DAYORDER = [1, 2, 3, 4, 5, 6, 0]; // Anzeige Mo..So, Werte wie Date.getDay()
  var SNOOZE_MIN = 9;
  var WINDOW_MIN = 30;       // so lange nach der Weckzeit klingelt der Wecker noch an
  var FETCH_EVERY = 15 * 60 * 1000;
  var MAX_ROWS = 6;

  function $(id) { return document.getElementById(id); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hm(ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
  function dayKey(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function startOfDay(d, plus) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + (plus || 0)).getTime(); }

  // ---- Speicher (kann in Safari fehlschlagen) ------------------------------------------
  function load(key, fallback) {
    try {
      var v = window.localStorage.getItem(key);
      return v === null ? fallback : JSON.parse(v);
    } catch (e) { return fallback; }
  }
  function save(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignorieren */ }
  }

  var alarm = load('wk.alarm', null) || { on: false, h: 6, m: 30, days: [false, true, true, true, true, true, false] };
  var calText = load('wk.cals', '');
  var cache = load('wk.cache', {});     // url -> { t: abrufzeit, items: [...] }
  var firedKey = load('wk.fired', '');  // Datum, für das der Wecker schon geklingelt hat

  // ---- Ton -------------------------------------------------------------------------------
  var audio = null, silentSrc = null, alarmSrc = null, audioOk = false, ringing = false, snoozeUntil = 0, testUntil = 0;

  function ensureAudio() {
    if (audio) { return; }
    audio = new Audio();
    audio.loop = true;
    silentSrc = Sound.silence();
    alarmSrc = Sound.alarm();
    audio.addEventListener('playing', function () { audioOk = true; renderAlarmLine(); });
    audio.addEventListener('pause', function () { audioOk = false; renderAlarmLine(); });
    audio.addEventListener('ended', function () { audioOk = false; renderAlarmLine(); });
    audio.addEventListener('error', function () { audioOk = false; renderAlarmLine(); });
  }

  // Muss innerhalb eines Antippens aufgerufen werden: startet die stille Schleife, die iOS den Ton freischaltet.
  function unlockAudio() {
    ensureAudio();
    if (audio.paused || audio.src !== silentSrc) {
      if (!ringing) { audio.src = silentSrc; }
      audio.play();
    }
  }

  function playAlarmSound() {
    ensureAudio();
    audio.src = alarmSrc;
    audio.play();
  }

  function playSilence() {
    if (!audio) { return; }
    audio.src = silentSrc;
    audio.play();
  }

  // ---- Wecker ----------------------------------------------------------------------------
  function saveAlarm() { save('wk.alarm', alarm); }

  function anyDay() {
    var i;
    for (i = 0; i < 7; i++) { if (alarm.days[i]) { return true; } }
    return false;
  }

  function startRing() {
    ringing = true;
    snoozeUntil = 0;
    testUntil = 0;
    playAlarmSound();
    $('ringtime').textContent = hm(Date.now());
    $('ring').hidden = false;
  }

  function stopRing() {
    ringing = false;
    $('ring').hidden = true;
    $('ring').className = '';
    playSilence();
  }

  function describeDays() {
    var i, names = [], d;
    var all = true, wk = true;
    for (i = 0; i < 7; i++) {
      d = DAYORDER[i];
      if (alarm.days[d]) { names.push(DAYSHORT[d]); }
      if (!alarm.days[d]) { all = false; }
      if ((d >= 1 && d <= 5) !== !!alarm.days[d]) { wk = false; }
    }
    if (all) { return 'täglich'; }
    if (wk) { return 'Mo–Fr'; }
    return names.join(' ');
  }

  function renderAlarmLine() {
    var el = $('alarmline'), t = pad(alarm.h) + ':' + pad(alarm.m);
    if (!alarm.on || !anyDay()) {
      el.className = 'off';
      el.textContent = 'Wecker aus';
    } else if (!audioOk && !ringing) {
      el.className = 'warn';
      el.textContent = '⚠ ' + t + ' – Ton nicht freigegeben: Wecker antippen';
    } else if (snoozeUntil) {
      el.className = '';
      el.textContent = 'Schlummern bis ' + hm(snoozeUntil);
    } else {
      el.className = '';
      el.textContent = '⏰ ' + t + ' · ' + describeDays() + ' · scharf';
    }
  }

  function checkAlarm(now) {
    var mins, a, key;
    if (testUntil && now.getTime() >= testUntil) {
      testUntil = 0;
      if (!ringing) { playSilence(); }
    }
    if (ringing || !alarm.on || !anyDay()) { return; }
    if (snoozeUntil) {
      if (now.getTime() >= snoozeUntil) { startRing(); }
      return;
    }
    key = dayKey(now);
    if (key === firedKey || !alarm.days[now.getDay()]) { return; }
    mins = now.getHours() * 60 + now.getMinutes();
    a = alarm.h * 60 + alarm.m;
    if (mins >= a && mins < a + WINDOW_MIN) {
      firedKey = key;
      save('wk.fired', firedKey);
      startRing();
    }
  }

  // ---- Termine ---------------------------------------------------------------------------
  var fetchState = {}; // url -> 'ok' | Fehlertext
  var lastFetchOk = load('wk.lastfetch', 0);

  function calUrls() {
    var lines = calText.split('\n'), out = [], i, u;
    for (i = 0; i < lines.length; i++) {
      u = lines[i].replace(/^\s+|\s+$/g, '');
      if (!u || u.charAt(0) === '#') { continue; }
      out.push(u.replace(/^webcals?:\/\//i, 'https://'));
    }
    return out;
  }

  function fetchOne(url, done) {
    var xhr = new XMLHttpRequest(), finished = false;
    function finish(err, text) { if (!finished) { finished = true; done(err, text); } }
    try {
      xhr.open('GET', url, true);
      xhr.timeout = 25000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300) { finish(null, xhr.responseText); }
        else { finish('Fehler ' + xhr.status); }
      };
      xhr.onerror = function () { finish('Abruf nicht möglich (Netz oder vom Anbieter blockiert)'); };
      xhr.ontimeout = function () { finish('Zeitüberschreitung'); };
      xhr.send();
    } catch (e) { finish('Ungültige Adresse'); }
  }

  function fetchAll() {
    var urls = calUrls(), pending = urls.length, i;
    if (!pending) { fetchState = {}; renderEvents(); return; }
    function one(url) {
      fetchOne(url, function (err, text) {
        var now = new Date(), from = startOfDay(now, 0), to = startOfDay(now, 2), occ, items = [], j;
        if (err) {
          fetchState[url] = err;
        } else {
          try {
            occ = ICal.occurrences(text, from, to);
            for (j = 0; j < occ.length; j++) {
              items.push({ s: occ[j].start, e: occ[j].end, a: occ[j].allDay, t: occ[j].summary });
            }
            cache[url] = { t: Date.now(), items: items };
            fetchState[url] = 'ok';
            lastFetchOk = Date.now();
            save('wk.lastfetch', lastFetchOk);
          } catch (ex) {
            fetchState[url] = 'Kalender nicht lesbar';
          }
        }
        pending--;
        if (pending === 0) { save('wk.cache', cache); renderEvents(); renderCalStatus(); }
      });
    }
    for (i = 0; i < urls.length; i++) { one(urls[i]); }
  }

  function itemsForDay(plus) {
    var from = startOfDay(new Date(), plus), to = startOfDay(new Date(), plus + 1), urls = calUrls(), out = [], i, j, c, it;
    for (i = 0; i < urls.length; i++) {
      c = cache[urls[i]];
      if (!c) { continue; }
      for (j = 0; j < c.items.length; j++) {
        it = c.items[j];
        if (it.s < to && (it.e > from || (it.e === it.s && it.s >= from))) { out.push(it); }
      }
    }
    out.sort(function (a, b) {
      if (a.a !== b.a) { return a.a ? -1 : 1; }
      return a.s - b.s || (a.t < b.t ? -1 : 1);
    });
    return out;
  }

  function fillList(listEl, items, markFirst) {
    var html = '', shown = Math.min(items.length, MAX_ROWS), i, it, firstDone = false, cls, label;
    function esc(s) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    if (!items.length) {
      listEl.innerHTML = '<li class="none">Keine Termine</li>';
      return;
    }
    for (i = 0; i < shown; i++) {
      it = items[i];
      cls = it.a ? 'allday' : '';
      if (markFirst && !it.a && !firstDone) { cls += ' first'; firstDone = true; }
      label = it.a ? 'ganztägig' : hm(it.s);
      html += '<li class="' + cls + '"><b>' + label + '</b> ' + esc(it.t || '(ohne Titel)') + '</li>';
    }
    if (items.length > shown) { html += '<li class="more">+ ' + (items.length - shown) + ' weitere</li>'; }
    listEl.innerHTML = html;
  }

  function renderEvents() {
    var info = $('fetchinfo'), age;
    if (!calUrls().length) {
      info.className = '';
      info.textContent = 'Kein Kalender eingerichtet';
    } else if (!lastFetchOk) {
      info.className = 'stale';
      info.textContent = 'Noch keine Termine geladen';
    } else {
      age = Date.now() - lastFetchOk;
      info.className = age > 60 * 60 * 1000 ? 'stale' : '';
      info.textContent = 'Stand ' + hm(lastFetchOk) + (age > 60 * 60 * 1000 ? ' (veraltet, kein Netz?)' : '');
    }
    fillList($('list-today'), itemsForDay(0), false);
    fillList($('list-tomorrow'), itemsForDay(1), true);
  }

  function renderCalStatus() {
    var urls = calUrls(), html = '', i, s, host;
    for (i = 0; i < urls.length; i++) {
      s = fetchState[urls[i]];
      host = urls[i].replace(/^https?:\/\//i, '').split('/')[0];
      if (s === undefined) { s = cache[urls[i]] ? 'zuletzt ' + hm(cache[urls[i]].t) : 'noch nicht abgerufen'; }
      html += '<li class="' + (s === 'ok' || /^zuletzt/.test(s) ? '' : 'bad') + '">' + host.replace(/</g, '') + ': ' + (s === 'ok' ? 'ok' : s) + '</li>';
    }
    $('calstatus').innerHTML = html;
  }

  // ---- Uhr -------------------------------------------------------------------------------
  var lastMinute = -1;

  function tick() {
    var now = new Date(), h = now.getHours(), m = now.getMinutes(), night, shift;
    checkAlarm(now);
    if (ringing) {
      $('ring').className = (now.getSeconds() % 2) ? 'flash' : '';
      if (audio && audio.paused) { audio.play(); }
    }
    if (m === lastMinute) { return; }
    lastMinute = m;
    $('clock').textContent = pad(h) + ':' + pad(m);
    $('date').textContent = DAYNAMES[now.getDay()] + ', ' + now.getDate() + '. ' + MONTHS[now.getMonth()];
    night = h >= 22 || h < 6;
    document.body.className = (night ? 'night ' : '') + (darkMode ? 'dark' : '');
    // Einbrennen vermeiden: Uhr wandert minimal
    shift = (m % 6) - 3;
    $('clockbox').style.webkitTransform = $('clockbox').style.transform = 'translate(' + (shift * 6) + 'px,' + (((m >> 1) % 5) - 2) * 4 + 'px)';
    renderAlarmLine();
    renderEvents();
    if (m === 0 || m === 30) { renderCalStatus(); }
  }

  var darkMode = false;

  // ---- Bedienung -------------------------------------------------------------------------
  function buildDays() {
    var box = $('days'), i, b, d;
    box.innerHTML = '';
    function make(day) {
      b = document.createElement('button');
      b.type = 'button';
      b.textContent = DAYSHORT[day];
      b.className = alarm.days[day] ? 'on' : '';
      b.onclick = function () {
        alarm.days[day] = !alarm.days[day];
        this.className = alarm.days[day] ? 'on' : '';
        saveAlarm();
        renderAlarmLine();
      };
      box.appendChild(b);
    }
    for (i = 0; i < 7; i++) { make(DAYORDER[i]); }
  }

  function renderOnOff() {
    $('btn-onoff').textContent = alarm.on ? 'Wecker ausschalten' : 'Wecker einschalten';
    $('in-time').value = pad(alarm.h) + ':' + pad(alarm.m);
    var c = $('alarmcheck');
    if (!alarm.on) { c.textContent = ''; }
    else if (audioOk) { c.textContent = 'Ton freigegeben, Wecker scharf.'; }
    else { c.textContent = 'Ton noch nicht freigegeben. Bitte „Ton testen" antippen.'; }
  }

  function openPanel(id) { $(id).hidden = false; }
  function closePanel(id) { $(id).hidden = true; }

  function init() {
    buildDays();
    $('in-cals').value = calText;
    renderOnOff();

    $('clock').onclick = function () {
      darkMode = !darkMode;
      lastMinute = -1;
      tick();
    };

    $('btn-alarm').onclick = function () { unlockAudio(); renderOnOff(); openPanel('panel-alarm'); };
    $('btn-close-alarm').onclick = function () { closePanel('panel-alarm'); renderAlarmLine(); };
    $('alarmline').onclick = function () { unlockAudio(); renderAlarmLine(); };

    $('in-time').onchange = function () {
      var p = this.value.split(':');
      if (p.length >= 2) { alarm.h = +p[0]; alarm.m = +p[1]; }
      firedKey = '';            // geänderte Zeit: für heute neu bewerten
      save('wk.fired', firedKey);
      snoozeUntil = 0;
      saveAlarm();
      renderAlarmLine();
    };

    $('btn-onoff').onclick = function () {
      alarm.on = !alarm.on;
      if (alarm.on) { unlockAudio(); }
      saveAlarm();
      setTimeout(function () { renderOnOff(); renderAlarmLine(); }, 600);
      renderOnOff();
      renderAlarmLine();
    };

    $('btn-test').onclick = function () {
      ensureAudio();
      testUntil = Date.now() + 5000;
      playAlarmSound();
    };

    $('btn-snooze').onclick = function () {
      stopRing();
      snoozeUntil = Date.now() + SNOOZE_MIN * 60000;
      renderAlarmLine();
    };
    $('btn-stop').onclick = function () {
      stopRing();
      snoozeUntil = 0;
      renderAlarmLine();
    };

    $('btn-cal').onclick = function () { renderCalStatus(); openPanel('panel-cal'); };
    $('btn-close-cal').onclick = function () { closePanel('panel-cal'); };
    $('btn-save-cal').onclick = function () {
      calText = $('in-cals').value;
      save('wk.cals', calText);
      fetchState = {};
      renderCalStatus();
      fetchAll();
    };

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) { lastMinute = -1; tick(); fetchAll(); }
    });

    tick();
    fetchAll();
    setInterval(tick, 1000);
    setInterval(fetchAll, FETCH_EVERY);
  }

  init();
})();
