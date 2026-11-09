/* Kleiner iCal-Leser, bewusst in ES5 (läuft in Safari auf iOS 10).
 * Zeiten ohne Zeitzone und mit TZID gelten als Ortszeit des Geräts (Deutschland);
 * Zeiten mit Z werden als UTC gelesen. Wiederholungen werden in Ortszeit gebildet,
 * damit eine Serie nach Sommer-/Winterzeitwechsel zur gleichen Uhrzeit bleibt.
 */
var ICal = (function () {
  'use strict';

  var DAY = 86400000;
  var WD = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
  var MAX_PERIODS = 20000;

  function unfold(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  }

  function unescapeText(s) {
    return s.replace(/\\[nN]/g, ' ').replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\\\/g, '\\');
  }

  function parseLine(line) {
    var i, c, inQ = false, colon = -1, j, parts, kv, params = {};
    for (i = 0; i < line.length; i++) {
      c = line.charAt(i);
      if (c === '"') { inQ = !inQ; }
      else if (c === ':' && !inQ) { colon = i; break; }
    }
    if (colon < 0) { return null; }
    parts = line.substring(0, colon).split(';');
    for (j = 1; j < parts.length; j++) {
      kv = parts[j].split('=');
      params[kv[0].toUpperCase()] = (kv[1] || '').replace(/"/g, '');
    }
    return { name: parts[0].toUpperCase(), params: params, value: line.substring(colon + 1) };
  }

  // -> { ms, allDay } oder null
  function parseDate(value, params) {
    var m = /^(\d{4})(\d\d)(\d\d)(?:T(\d\d)(\d\d)(\d\d)(Z?))?$/.exec(value.replace(/^\s+|\s+$/g, ''));
    if (!m) { return null; }
    var y = +m[1], mo = +m[2] - 1, d = +m[3];
    if (m[4] === undefined || (params && params.VALUE === 'DATE')) {
      return { ms: new Date(y, mo, d).getTime(), allDay: true };
    }
    if (m[7] === 'Z') {
      return { ms: Date.UTC(y, mo, d, +m[4], +m[5], +m[6]), allDay: false };
    }
    return { ms: new Date(y, mo, d, +m[4], +m[5], +m[6]).getTime(), allDay: false };
  }

  function parseDuration(v) {
    var m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v);
    if (!m) { return 0; }
    var ms = ((+m[2] || 0) * 7 + (+m[3] || 0)) * DAY + (+m[4] || 0) * 3600000 + (+m[5] || 0) * 60000 + (+m[6] || 0) * 1000;
    return m[1] === '-' ? -ms : ms;
  }

  function parseRRule(str) {
    var rule = { freq: null, interval: 1, count: 0, until: 0, byday: [], bymonthday: [], bymonth: [] };
    var parts = str.split(';'), i, kv, k, v, list, j, m;
    for (i = 0; i < parts.length; i++) {
      kv = parts[i].split('=');
      k = kv[0].toUpperCase();
      v = kv[1] || '';
      if (k === 'FREQ') { rule.freq = v.toUpperCase(); }
      else if (k === 'INTERVAL') { rule.interval = Math.max(1, +v || 1); }
      else if (k === 'COUNT') { rule.count = +v || 0; }
      else if (k === 'UNTIL') {
        var u = parseDate(v, null);
        if (u) { rule.until = u.allDay ? u.ms + DAY - 1 : u.ms; }
      } else if (k === 'BYDAY') {
        list = v.split(',');
        for (j = 0; j < list.length; j++) {
          m = /^([+-]?\d+)?(MO|TU|WE|TH|FR|SA|SU)$/i.exec(list[j]);
          if (m) { rule.byday.push({ ord: m[1] ? +m[1] : 0, wd: WD[m[2].toUpperCase()] }); }
        }
      } else if (k === 'BYMONTHDAY') {
        list = v.split(',');
        for (j = 0; j < list.length; j++) { rule.bymonthday.push(+list[j]); }
      } else if (k === 'BYMONTH') {
        list = v.split(',');
        for (j = 0; j < list.length; j++) { rule.bymonth.push(+list[j] - 1); }
      }
    }
    return rule;
  }

  // Liest alle VEVENTs. Rückgabe: Liste einfacher Objekte.
  function parse(text) {
    var lines = unfold(text), events = [], cur = null, alarmDepth = 0, i, p, d, ex, j;
    for (i = 0; i < lines.length; i++) {
      if (!lines[i]) { continue; }
      p = parseLine(lines[i]);
      if (!p) { continue; }
      if (p.name === 'BEGIN') {
        if (p.value === 'VEVENT') {
          cur = { start: null, end: null, allDay: false, duration: null, summary: '', uid: '', rrule: null, exdates: {}, recId: null, cancelled: false };
        } else if (cur) { alarmDepth++; }
        continue;
      }
      if (p.name === 'END') {
        if (p.value === 'VEVENT') {
          if (cur && cur.start !== null) {
            if (cur.end === null) {
              if (cur.duration !== null) { cur.end = cur.start + cur.duration; }
              else { cur.end = cur.allDay ? cur.start + DAY : cur.start; }
            }
            events.push(cur);
          }
          cur = null;
        } else if (cur && alarmDepth > 0) { alarmDepth--; }
        continue;
      }
      if (!cur || alarmDepth > 0) { continue; }
      if (p.name === 'DTSTART') { d = parseDate(p.value, p.params); if (d) { cur.start = d.ms; cur.allDay = d.allDay; } }
      else if (p.name === 'DTEND') { d = parseDate(p.value, p.params); if (d) { cur.end = d.ms; } }
      else if (p.name === 'DURATION') { cur.duration = parseDuration(p.value); }
      else if (p.name === 'SUMMARY') { cur.summary = unescapeText(p.value); }
      else if (p.name === 'UID') { cur.uid = p.value; }
      else if (p.name === 'RRULE') { cur.rrule = parseRRule(p.value); }
      else if (p.name === 'STATUS') { cur.cancelled = p.value.toUpperCase() === 'CANCELLED'; }
      else if (p.name === 'RECURRENCE-ID') { d = parseDate(p.value, p.params); if (d) { cur.recId = d.ms; } }
      else if (p.name === 'EXDATE') {
        ex = p.value.split(',');
        for (j = 0; j < ex.length; j++) { d = parseDate(ex[j], p.params); if (d) { cur.exdates[d.ms] = true; } }
      }
    }
    return events;
  }

  function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }

  // Tage (1..31) eines Monats, die die Regel trifft
  function monthDays(y, m, rule, startDay) {
    var dim = daysInMonth(y, m), out = [], i, j, n, list, o;
    if (rule.bymonthday.length) {
      for (i = 0; i < rule.bymonthday.length; i++) {
        n = rule.bymonthday[i];
        out.push(n > 0 ? n : dim + n + 1);
      }
    } else if (rule.byday.length) {
      for (i = 0; i < rule.byday.length; i++) {
        o = rule.byday[i];
        list = [];
        for (j = 1; j <= dim; j++) { if (new Date(y, m, j).getDay() === o.wd) { list.push(j); } }
        if (o.ord > 0) { if (list[o.ord - 1]) { out.push(list[o.ord - 1]); } }
        else if (o.ord < 0) { if (list[list.length + o.ord]) { out.push(list[list.length + o.ord]); } }
        else { out = out.concat(list); }
      }
    } else {
      out.push(startDay);
    }
    var seen = {}, res = [];
    for (i = 0; i < out.length; i++) {
      if (out[i] >= 1 && out[i] <= dim && !seen[out[i]]) { seen[out[i]] = true; res.push(out[i]); }
    }
    res.sort(function (a, b) { return a - b; });
    return res;
  }

  // Hängt alle Vorkommen eines Termins im Fenster [fromMs, toMs) an out an.
  function expandEvent(ev, fromMs, toMs, overrides, out) {
    function endOf(ts) {
      if (ev.allDay) {
        var days = Math.round((ev.end - ev.start) / DAY), dt = new Date(ts);
        return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate() + days).getTime();
      }
      return ts + (ev.end - ev.start);
    }
    function emit(ts) {
      var e = endOf(ts);
      if (ts < toMs && (e > fromMs || (e === ts && ts >= fromMs))) {
        out.push({ start: ts, end: e, allDay: ev.allDay, summary: ev.summary, uid: ev.uid });
      }
    }

    if (!ev.rrule || !ev.rrule.freq) { emit(ev.start); return; }

    var rule = ev.rrule, s = new Date(ev.start);
    var y0 = s.getFullYear(), m0 = s.getMonth(), d0 = s.getDate();
    var h = s.getHours(), mi = s.getMinutes(), se = s.getSeconds();
    var n = 0, k, stop = false;

    function make(y, m, d) { return new Date(y, m, d, h, mi, se).getTime(); }

    function handle(ts) { // true = weitermachen
      if (ts < ev.start) { return true; }
      if (rule.until && ts > rule.until) { return false; }
      n++;
      if (rule.count && n > rule.count) { return false; }
      if (ts >= toMs) { return false; }
      if (ev.exdates[ts] || (ev.uid && overrides[ev.uid + '|' + ts])) { return true; }
      emit(ts);
      return true;
    }

    var wdSet = null, i, j;
    if (rule.byday.length) {
      wdSet = {};
      for (i = 0; i < rule.byday.length; i++) { wdSet[rule.byday[i].wd] = true; }
    }

    for (k = 0; k < MAX_PERIODS && !stop; k++) {
      var cands = [], periodStart, step = k * rule.interval;
      if (rule.freq === 'DAILY') {
        periodStart = make(y0, m0, d0 + step);
        if (!wdSet || wdSet[new Date(periodStart).getDay()]) { cands.push(periodStart); }
      } else if (rule.freq === 'WEEKLY') {
        var base = d0 - ((s.getDay() + 6) % 7) + step * 7;
        periodStart = make(y0, m0, base);
        var wds = [], offs = [];
        if (wdSet) { for (j = 1; j <= 7; j++) { if (wdSet[j % 7]) { offs.push(j - 1); } } }
        else { offs.push((s.getDay() + 6) % 7); }
        for (j = 0; j < offs.length; j++) { cands.push(make(y0, m0, base + offs[j])); }
      } else if (rule.freq === 'MONTHLY') {
        var mm = m0 + step, y2 = y0 + Math.floor(mm / 12), m2 = ((mm % 12) + 12) % 12;
        periodStart = new Date(y2, m2, 1).getTime();
        var dl = monthDays(y2, m2, rule, d0);
        for (j = 0; j < dl.length; j++) { cands.push(make(y2, m2, dl[j])); }
      } else if (rule.freq === 'YEARLY') {
        var y3 = y0 + step, months = rule.bymonth.length ? rule.bymonth.slice().sort(function (a, b) { return a - b; }) : [m0];
        periodStart = new Date(y3, 0, 1).getTime();
        for (i = 0; i < months.length; i++) {
          var dl2 = monthDays(y3, months[i], rule, d0);
          for (j = 0; j < dl2.length; j++) { cands.push(make(y3, months[i], dl2[j])); }
        }
      } else { return; }

      if (periodStart > toMs && !cands.length) { break; }
      cands.sort(function (a, b) { return a - b; });
      for (i = 0; i < cands.length; i++) {
        if (!handle(cands[i])) { stop = true; break; }
      }
      if (periodStart > toMs) { break; }
    }
  }

  // Alle Vorkommen im Fenster [fromMs, toMs), nach Beginn sortiert.
  function occurrences(text, fromMs, toMs) {
    var evs = parse(text), overrides = {}, out = [], i, ev;
    for (i = 0; i < evs.length; i++) {
      if (evs[i].recId !== null && evs[i].uid) { overrides[evs[i].uid + '|' + evs[i].recId] = true; }
    }
    for (i = 0; i < evs.length; i++) {
      ev = evs[i];
      if (ev.cancelled) { continue; }
      expandEvent(ev, fromMs, toMs, overrides, out);
    }
    out.sort(function (a, b) { return a.start - b.start || (a.summary < b.summary ? -1 : 1); });
    return out;
  }

  return { parse: parse, occurrences: occurrences };
})();

if (typeof module !== 'undefined' && module.exports) { module.exports = ICal; }
