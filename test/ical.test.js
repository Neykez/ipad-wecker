// Aufruf: TZ=Europe/Berlin node test/ical.test.js
var assert = require('assert');
var ICal = require('../ical.js');

function pad(n) { return (n < 10 ? '0' : '') + n; }
function fmt(ms, allDay) {
  var d = new Date(ms);
  var s = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  return allDay ? s : s + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
function run(ics, from, to) {
  var wrapped = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\n' + ics + 'END:VCALENDAR\r\n';
  return ICal.occurrences(wrapped, new Date(from).getTime(), new Date(to).getTime()).map(function (o) {
    return o.summary + ' @ ' + fmt(o.start, o.allDay);
  });
}
function ev(lines) { return 'BEGIN:VEVENT\r\nUID:x1\r\n' + lines.join('\r\n') + '\r\nEND:VEVENT\r\n'; }

assert.strictEqual(process.env.TZ, 'Europe/Berlin', 'TZ=Europe/Berlin setzen');
var n = 0;
function t(name, fn) { fn(); n++; console.log('ok  ' + name); }

t('Einzeltermin lokal (TZID)', function () {
  assert.deepStrictEqual(run(ev(['DTSTART;TZID=Europe/Berlin:20261110T080000', 'DTEND;TZID=Europe/Berlin:20261110T090000', 'SUMMARY:Konferenz']),
    '2026-11-10T00:00:00', '2026-11-11T00:00:00'), ['Konferenz @ 2026-11-10 08:00']);
});

t('Einzeltermin UTC wird in Ortszeit umgerechnet (Winter +1h)', function () {
  assert.deepStrictEqual(run(ev(['DTSTART:20261110T070000Z', 'DTEND:20261110T080000Z', 'SUMMARY:UTC']),
    '2026-11-10T00:00:00', '2026-11-11T00:00:00'), ['UTC @ 2026-11-10 08:00']);
});

t('Ganztägig, DTEND exklusiv (zwei Tage)', function () {
  var r = run(ev(['DTSTART;VALUE=DATE:20261112', 'DTEND;VALUE=DATE:20261114', 'SUMMARY:Ausflug']), '2026-11-13T00:00:00', '2026-11-14T00:00:00');
  assert.deepStrictEqual(r, ['Ausflug @ 2026-11-12']);
  assert.deepStrictEqual(run(ev(['DTSTART;VALUE=DATE:20261112', 'DTEND;VALUE=DATE:20261114', 'SUMMARY:Ausflug']), '2026-11-14T00:00:00', '2026-11-15T00:00:00'), []);
});

t('Wöchentlich Mo/Mi, COUNT=4', function () {
  var r = run(ev(['DTSTART;TZID=Europe/Berlin:20261102T073000', 'DTEND;TZID=Europe/Berlin:20261102T083000', 'SUMMARY:Zug', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=4']),
    '2026-11-01T00:00:00', '2026-12-31T00:00:00');
  assert.deepStrictEqual(r, ['Zug @ 2026-11-02 07:30', 'Zug @ 2026-11-04 07:30', 'Zug @ 2026-11-09 07:30', 'Zug @ 2026-11-11 07:30']);
});

t('Zweiwöchentlich Freitag, Fenster mitten in der Serie', function () {
  var r = run(ev(['DTSTART;TZID=Europe/Berlin:20260102T140000', 'DTEND;TZID=Europe/Berlin:20260102T150000', 'SUMMARY:Konf', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR']),
    '2026-11-09T00:00:00', '2026-11-30T00:00:00');
  // 2026-01-02 + 46 Wochen (322 Tage) = 20.11.; der 13.11. und 27.11. liegen im Zwischenwochen-Takt
  assert.deepStrictEqual(r, ['Konf @ 2026-11-20 14:00']);
});

t('Sommerzeitwechsel: Serie bleibt bei 08:00 Ortszeit', function () {
  var r = run(ev(['DTSTART;TZID=Europe/Berlin:20261019T080000', 'DTEND;TZID=Europe/Berlin:20261019T090000', 'SUMMARY:Mo', 'RRULE:FREQ=WEEKLY;COUNT=3']),
    '2026-10-01T00:00:00', '2026-11-30T00:00:00');
  assert.deepStrictEqual(r, ['Mo @ 2026-10-19 08:00', 'Mo @ 2026-10-26 08:00', 'Mo @ 2026-11-02 08:00']);
});

t('Monatlich letzter Freitag', function () {
  var r = run(ev(['DTSTART;TZID=Europe/Berlin:20260130T160000', 'DTEND;TZID=Europe/Berlin:20260130T170000', 'SUMMARY:Ende', 'RRULE:FREQ=MONTHLY;BYDAY=-1FR']),
    '2026-11-01T00:00:00', '2027-01-31T00:00:00');
  assert.deepStrictEqual(r, ['Ende @ 2026-11-27 16:00', 'Ende @ 2026-12-25 16:00', 'Ende @ 2027-01-29 16:00']);
});

t('Monatlich am 31. überspringt kurze Monate', function () {
  var r = run(ev(['DTSTART;VALUE=DATE:20260131', 'SUMMARY:M31', 'RRULE:FREQ=MONTHLY']), '2026-02-01T00:00:00', '2026-06-30T00:00:00');
  assert.deepStrictEqual(r, ['M31 @ 2026-03-31', 'M31 @ 2026-05-31']);
});

t('Jährlich (Geburtstag, ganztägig)', function () {
  var r = run(ev(['DTSTART;VALUE=DATE:19900515', 'SUMMARY:Geb', 'RRULE:FREQ=YEARLY']), '2026-05-01T00:00:00', '2026-06-01T00:00:00');
  assert.deepStrictEqual(r, ['Geb @ 2026-05-15']);
});

t('Täglich mit EXDATE und UNTIL', function () {
  var r = run(ev(['DTSTART;TZID=Europe/Berlin:20261109T060000', 'DTEND;TZID=Europe/Berlin:20261109T061500', 'SUMMARY:Lauf', 'RRULE:FREQ=DAILY;UNTIL=20261112', 'EXDATE;TZID=Europe/Berlin:20261110T060000']),
    '2026-11-09T00:00:00', '2026-11-20T00:00:00');
  assert.deepStrictEqual(r, ['Lauf @ 2026-11-09 06:00', 'Lauf @ 2026-11-11 06:00', 'Lauf @ 2026-11-12 06:00']);
});

t('Verschobener Einzeltermin einer Serie (RECURRENCE-ID)', function () {
  var master = ev(['DTSTART;TZID=Europe/Berlin:20261109T100000', 'DTEND;TZID=Europe/Berlin:20261109T110000', 'SUMMARY:Serie', 'RRULE:FREQ=DAILY;COUNT=3']);
  var moved = 'BEGIN:VEVENT\r\nUID:x1\r\nRECURRENCE-ID;TZID=Europe/Berlin:20261110T100000\r\nDTSTART;TZID=Europe/Berlin:20261110T150000\r\nDTEND;TZID=Europe/Berlin:20261110T160000\r\nSUMMARY:Serie verschoben\r\nEND:VEVENT\r\n';
  var r = run(master + moved, '2026-11-09T00:00:00', '2026-11-20T00:00:00');
  assert.deepStrictEqual(r, ['Serie @ 2026-11-09 10:00', 'Serie verschoben @ 2026-11-10 15:00', 'Serie @ 2026-11-11 10:00']);
});

t('Abgesagter Termin, Zeilenumbruch, Escapes, VALARM', function () {
  var a = ev(['DTSTART:20261110T100000Z', 'DTEND:20261110T110000Z', 'SUMMARY:Lang\r\n er Titel\\, mit Komma', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Alarm', 'TRIGGER:-PT15M', 'END:VALARM']);
  var c = 'BEGIN:VEVENT\r\nUID:c\r\nDTSTART:20261110T120000Z\r\nSTATUS:CANCELLED\r\nSUMMARY:Weg\r\nEND:VEVENT\r\n';
  assert.deepStrictEqual(run(a + c, '2026-11-10T00:00:00', '2026-11-11T00:00:00'), ['Langer Titel, mit Komma @ 2026-11-10 11:00']);
});

console.log('\n' + n + ' Tests bestanden');
