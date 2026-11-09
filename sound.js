/* Erzeugt Weckton und Stille als WAV-Data-URI (8 kHz, 8 Bit, mono), ES5.
 * iOS erlaubt die Lautstärke eines <audio> nicht zu setzen. Deshalb läuft nach dem
 * Freischalten eine stille Schleife, und zur Weckzeit wird nur die Quelle getauscht. */
var Sound = (function () {
  'use strict';
  var RATE = 8000;

  function le32(v) { return [v & 255, (v >> 8) & 255, (v >> 16) & 255, (v >> 24) & 255]; }
  function le16(v) { return [v & 255, (v >> 8) & 255]; }

  function wrap(samples) {
    var n = samples.length, i, s = '';
    var hdr = [82, 73, 70, 70].concat(le32(36 + n), [87, 65, 86, 69, 102, 109, 116, 32], le32(16), le16(1), le16(1),
      le32(RATE), le32(RATE), le16(1), le16(8), [100, 97, 116, 97], le32(n));
    for (i = 0; i < hdr.length; i++) { s += String.fromCharCode(hdr[i]); }
    for (i = 0; i < n; i++) { s += String.fromCharCode(samples[i]); }
    return 'data:audio/wav;base64,' + btoa(s);
  }

  function silence() {
    var out = [], i;
    for (i = 0; i < RATE; i++) { out.push(128); }
    return wrap(out);
  }

  // Vier kurze Pieptöne, dann Pause; 2 Sekunden, wird wiederholt.
  function alarm() {
    var out = [], total = RATE * 2, i, t, beat, within, on, v;
    for (i = 0; i < total; i++) {
      t = i / RATE;
      beat = Math.floor(t / 0.25);
      within = t - beat * 0.25;
      on = beat < 4 && within < 0.15;
      v = on ? Math.sin(2 * Math.PI * (beat % 2 ? 1175 : 880) * t) : 0;
      out.push(128 + Math.round(v * 120));
    }
    return wrap(out);
  }

  return { silence: silence, alarm: alarm };
})();
