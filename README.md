# iPad-Wecker (Nachttisch)

Schlanke Webseite für ein altes iPad (iPad 4, höchstens iOS 10.3.3): große Uhr, Wecker, Termine von heute und morgen. Läuft in Safari als Vollbild-App, reines ES5, keine Bibliotheken, kein Build.

## Dateien

| Datei | Zweck |
|---|---|
| `index.html`, `style.css`, `app.js` | Die Seite selbst |
| `ical.js` | iCal-Leser (Wiederholungen, Ausnahmen, Ortszeit) |
| `sound.js` | Weckton und Stille, als WAV im Code erzeugt |
| `test/index.html` | **Frühtest:** Klingelt ein Testwecker nach 2 Minuten? |
| `test/ical.test.js` | Tests des iCal-Lesers: `TZ=Europe/Berlin node test/ical.test.js` |

## Datenschutz

- Kalender-Adressen stehen **nie** im Code. Man trägt sie am iPad unter „Kalender" ein; sie liegen nur im Speicher dieses iPads.
- Das Repository darf deshalb öffentlich sein, es enthält keine privaten Daten.

## Einrichtung am iPad

1. Frühtest öffnen (`…/test/`), „Test starten" antippen, Bildschirm anlassen, Lautstärke hoch, Stummschalter aus. Nach 2 Minuten muss es piepen.
2. Hauptseite in Safari öffnen → Teilen-Symbol → „Zum Home-Bildschirm". Von dort starten (in der Home-Bildschirm-App sind die Einstellungen getrennt von Safari).
3. In der App: „Kalender" → Adressen einfügen → „Speichern und abrufen". „Wecker" → Zeit, Tage, einschalten, danach „Ton testen".
4. iPad-Einstellungen:
   - Anzeige & Helligkeit → Automatische Sperre: **Nie**; Helligkeit niedrig, „Auto-Helligkeit" aus.
   - Dauerhaft am Netzteil.
   - Nicht stören: **aus** (sonst bleibt der Ton stumm), Seitenschalter nicht auf Stumm, Lautstärke hoch.
   - Geführter Zugriff (Einstellungen → Allgemein → Bedienungshilfen) mit der App aktivieren, damit sie nicht aus Versehen verlassen wird.
   - Automatische Updates aus.
5. **Sicherheitsnetz:** In den ersten zwei Wochen zusätzlich einen Alarm in der Uhr-App stellen, 5 Minuten später als der Seiten-Wecker.

## Bedienung

- Uhr antippen: blendet Termine und Knöpfe aus (nur Uhr und Weckzeit).
- 22–6 Uhr: gedämpftes Rot.
- Steht oben „Ton nicht freigegeben", hat iOS den Ton gestoppt (z. B. Anruf, Neuladen). Zeile antippen genügt.
- Termine werden alle 15 Minuten abgerufen; ohne Netz bleibt der letzte Stand sichtbar, „Stand HH:MM" zeigt das Alter.

## Bekannte Grenzen

- iOS 10 erlaubt Ton nur nach einem Antippen. Nach Neustart der App oder des iPads muss der Wecker erneut berührt werden.
- Ob ein Kalenderanbieter den Abruf direkt aus einer Webseite erlaubt (CORS), zeigt nur der Test. Falls nicht, braucht dieser Kalender eine Zwischenstation.
