# mcp-vereinonline

MCP-Server für [VereinOnline](https://www.vereinonline.org), die Vereinssoftware. Er stellt die dokumentierte JSON-API von VereinOnline als MCP-Tools bereit, lokal per stdio. Der Server speichert nichts und hat keinen eigenen Cache über einen einzelnen Aufruf hinaus.

## Status

**Nach Dokumentation implementiert, nicht live verifiziert.** Grundlage ist die öffentliche API-Dokumentation unter https://www.vereinonline.org/api. Die Tests prüfen Konfiguration, Freigaben und Aufrufe gegen eine simulierte API. Sie sagen nichts über die Antworten eines echten Vereins. Die Parameterformate sind bis zum ersten Test gegen einen echten Verein unbestätigt.

Bekannte Einschränkungen:

- **Zweites `GetList` in der Doku ungeklärt.** Die Doku nennt `GetList` zweimal mit identischer Beschreibung. Der zweite Eintrag steht unter einer abgeschnittenen Überschrift, sodass unklar ist, welche Funktion gemeint ist. Umgesetzt ist nur der erste, benannte Eintrag.
- **Kontakte nur als "analog" dokumentiert.** `GetContacts`, `GetContact` und `CreateContact` sind in der Doku nur als "analog" zu den Mitglieder-Funktionen beschrieben. Es ist eine Annahme, dass sie dieselben Parameter wie die Mitglieder-Funktionen verwenden. `UpdateContact` und `DeleteContact` gibt es nicht, weil die Doku sie nicht beschreibt.
- **Mailversand weiterer Funktionen unbekannt.** Ob `CreateMember`, `CreateRegistration` und `CreateSubscriber` beim Anlegen eine E-Mail versenden, ist nicht dokumentiert. Die Tool-Beschreibungen tragen deshalb den Hinweis "May send e-mail (unverified)." `ChangeRegistration` mit `mail: "1"` ist dagegen abgesichert (siehe Abschnitt Klassen).
- **Paginierung nur clientseitig.** Die API paginiert nur `GetEvents` (über `limit`). Bei allen anderen Listen holt der Server alles und kürzt danach (siehe Abschnitt Antwortgröße).
- **`dataid` bei `UpdateListData` ist eine Annahme.** Die Doku nennt die Datensatz-ID nur als "data id". Der Server verwendet `dataid`, weil `GetList` sie als `_dataid` zurückliefert.
- **Parameterformate insgesamt unbestätigt**, bis ein erster Test gegen einen echten Verein läuft. Das betrifft etwa Datumsformate, die `Beitrags-ID` bei `DeleteMemberUserfees` (vermutlich die ID der Zuordnung) und die Feldnamen in `daten`.
- **Doku-Tippfehler.** Im Abschnitt "Erstellen einer Rechnung/Buchung" nennt die Doku den Methodennamen fälschlich `GetInvoice`. Die Überschrift und das Beispiel nennen `CreateInvoice`, und so ist sie umgesetzt. Ebenso nennt die Doku bei der Platzbuchung die Überschrift "DeletePlaceBooking", den Methodennamen aber `DeletePlaceBookings`.

## Einrichtung

Voraussetzung ist Node.js 18 oder neuer. Es gibt zwei Wege, den Server einzubinden:

- **Direkt aus GitHub, ohne lokalen Klon** (siehe nächster Abschnitt): `npx` lädt den Server beim Start aus diesem Repository und baut ihn selbst.
- **Lokaler Klon:** Den Server baut man einmal mit `npm install` und `npm run build`. Danach zeigt man im MCP-Client auf `dist/index.js`. Die Beispiele weiter unten verwenden diesen Weg.

### Direkt aus GitHub (npx)

Im MCP-Client steht statt des Pfads zu `dist/index.js` der Befehl `npx` mit der GitHub-Adresse. Beispiel für Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "vereinonline": {
      "command": "npx",
      "args": ["-y", "github:simonfieberIT/mcp-vereinonline"],
      "env": {
        "VEREINONLINE_URL": "https://www.vereinonline.org/IHRVEREIN/",
        "VEREINONLINE_USER": "api-benutzer",
        "VEREINONLINE_PASSWORD": "<Passwort des API-Benutzers>"
      }
    }
  }
}
```

Für Claude Code:

```bash
claude mcp add vereinonline \
  -e VEREINONLINE_URL=https://www.vereinonline.org/IHRVEREIN/ \
  -e VEREINONLINE_USER=api-benutzer \
  -e VEREINONLINE_PASSWORD='<Passwort des API-Benutzers>' \
  -- npx -y github:simonfieberIT/mcp-vereinonline
```

Die Umgebungsvariablen sind dieselben wie beim lokalen Klon, auch die Profildatei für mehrere Vereine funktioniert so.

Was dabei zu beachten ist:

- **Erster Start:** Beim ersten Aufruf lädt npm das Repository, installiert die Abhängigkeiten und führt das Skript `prepare` aus, das den Server baut. Mit leerem npm-Cache dauerte das in Tests 13 bis 19 Sekunden, ein weiterer Start aus dem Cache etwa 2 bis 3 Sekunden. In dieser Zeit antwortet der Server noch nicht. Ein MCP-Client mit kurzem Verbindungs-Timeout kann den ersten Versuch abbrechen. Ein zweiter Start funktioniert dann aus dem Cache.
- **Aktualisieren:** npm legt Pakete aus Git im Cache ab. Ob `npx` bei jedem Start automatisch den neuesten Stand von `main` holt, ist nicht getestet. Wenn nach einem neuen Push noch der alte Stand läuft, hilft es, den npx-Cache zu leeren (`rm -rf ~/.npm/_npx`) und den Client neu zu starten.
- **Fester Stand:** Mit `github:simonfieberIT/mcp-vereinonline#<Tag oder Commit>` läuft immer genau dieser Stand. Er muss das Skript `prepare` in `package.json` enthalten, ältere Commits lassen sich so nicht starten.
- **Sicherheit:** Beim Einbinden von `main` läuft jeder neue Push ungeprüft mit Zugriff auf die Zugangsdaten und damit auf die Mitgliederdaten. Für den produktiven Einsatz ist ein fester Tag oder Commit sicherer.

### Claude Desktop (eine Vereinsanbindung)

In `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "vereinonline": {
      "command": "node",
      "args": ["/absoluter/Pfad/mcp-vereinonline/dist/index.js"],
      "env": {
        "VEREINONLINE_URL": "https://www.vereinonline.org/IHRVEREIN/",
        "VEREINONLINE_USER": "api-benutzer",
        "VEREINONLINE_PASSWORD": "<Passwort des API-Benutzers>"
      }
    }
  }
}
```

Den Platzhalter `<Passwort des API-Benutzers>` ersetzt man durch den echten Wert. Die Datei enthält dann das Passwort im Klartext. Der Zugriff auf die Datei sollte deshalb eingeschränkt sein.

### Claude Code (eine Vereinsanbindung)

```bash
claude mcp add vereinonline \
  -e VEREINONLINE_URL=https://www.vereinonline.org/IHRVEREIN/ \
  -e VEREINONLINE_USER=api-benutzer \
  -e VEREINONLINE_PASSWORD='<Passwort des API-Benutzers>' \
  -- node /absoluter/Pfad/mcp-vereinonline/dist/index.js
```

### Mehrere Vereine (Profildatei)

Bei mehreren Vereinen zeigt `VEREINONLINE_PROFILES` auf eine JSON-Datei. Die Passwörter kommen dann aus Umgebungsvariablen, die über `passwordEnv` benannt werden, und stehen nicht in der Datei.

`/absoluter/Pfad/vereine.json`:

```json
{
  "profiles": {
    "mein-verein": {
      "url": "https://www.vereinonline.org/IHRVEREIN/",
      "user": "api-benutzer",
      "passwordEnv": "VO_PASSWORT_MEIN_VEREIN"
    },
    "zweiter-verein": {
      "url": "https://www.vereinonline.org/ANDERERVEREIN/",
      "user": "api-benutzer-2",
      "passwordEnv": "VO_PASSWORT_ZWEITER_VEREIN"
    }
  }
}
```

Claude Desktop, mit der Profildatei:

```json
{
  "mcpServers": {
    "vereinonline": {
      "command": "node",
      "args": ["/absoluter/Pfad/mcp-vereinonline/dist/index.js"],
      "env": {
        "VEREINONLINE_PROFILES": "/absoluter/Pfad/vereine.json",
        "VO_PASSWORT_MEIN_VEREIN": "<Passwort Verein 1>",
        "VO_PASSWORT_ZWEITER_VEREIN": "<Passwort Verein 2>"
      }
    }
  }
}
```

Die Werte rechts sind Platzhalter. Dort gehören die echten Passwörter hin (Claude Desktop ersetzt keine Variablen wie `${...}`). Die Variablen müssen im `env`-Block des Servers stehen, weil `passwordEnv` in der Umgebung des Serverprozesses nachschlägt.

Bei mehreren Profilen bekommt jedes Tool, auch `vo_raw`, einen Pflichtparameter `verein` mit den Profilnamen als erlaubten Werten, z. B. `"verein": "mein-verein"`.

Profile können auch `"password": "..."` statt `passwordEnv` enthalten. Das wird vom Code akzeptiert, speichert das Passwort aber im Klartext in der Datei. `passwordEnv` ist deshalb vorzuziehen.

Zwischen `VEREINONLINE_URL` und `VEREINONLINE_PROFILES` wählt man genau eins. Sind beide gesetzt, bricht der Server ab. Bei einer Profildatei werden `VEREINONLINE_USER` und `VEREINONLINE_PASSWORD` nicht gelesen.

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `VEREINONLINE_URL` | ja, wenn keine Profildatei | Adresse der API des Vereins, z. B. `https://www.vereinonline.org/IHRVEREIN/`. Nur `https://` ist erlaubt, `http://` nur für `localhost`, `127.0.0.1` und `[::1]`. Nicht zusammen mit `VEREINONLINE_PROFILES`. |
| `VEREINONLINE_USER` | ja, zusammen mit `VEREINONLINE_URL` | Login des API-Benutzers. |
| `VEREINONLINE_PASSWORD` | ja, zusammen mit `VEREINONLINE_URL` | Passwort des API-Benutzers. |
| `VEREINONLINE_PROFILES` | ja, wenn keine URL | Pfad zu einer Profildatei für einen oder mehrere Vereine. Nicht zusammen mit `VEREINONLINE_URL`. |
| `VEREINONLINE_TOOLSETS` | nein | Welche Toolsets aktiv sind. Ohne Angabe: alle außer `auth` (12 Toolsets). `all`: alle 13. Sonst eine Liste mit Komma oder Leerzeichen als Trenner. Unbekannte Namen führen zum Abbruch. |
| `VEREINONLINE_ALLOW_WRITE` | nein | `1` oder `true` (Groß-/Kleinschreibung egal) schaltet Schreib-Tools frei. Alles andere ist aus. |
| `VEREINONLINE_ALLOW_DELETE` | nein | Wie oben, für Lösch-Tools. |
| `VEREINONLINE_ALLOW_SEND` | nein | Wie oben, für Versand-Tools (`vo_send_login` und den Mailversand bei `vo_change_registration` mit `mail`). |

Das gilt für `VEREINONLINE_URL` und für jede `url` in der Profildatei: Eine andere Adresse (auch eine nicht lesbare) lässt den Server beim Start abbrechen, die Meldung nennt das Profil. Der Grund: Der Token (Benutzer und MD5 des Passworts) darf nicht unverschlüsselt über das Netz gehen. Der Server prüft die Adresse zusätzlich bei jedem Aufruf und lehnt Weiterleitungen (Redirects) ab, statt ihnen zu folgen. Ein Redirect erscheint als allgemeiner Netzwerkfehler.

Fehlt eine Pflichtangabe oder ist die Konfiguration widersprüchlich, beendet sich der Server mit Exit-Code 1. Die Meldung geht auf stderr, stdout bleibt leer. Die Meldung nennt Variablen, aber keine Werte.

## Toolsets

VereinOnline hat 47 umgesetzte Funktionen. Sie sind in 13 Toolsets gruppiert. Die Tool-Namen entstehen aus dem API-Namen in snake_case mit dem Präfix `vo_`. Die Klasse steht in Klammern: `read`, `write`, `delete` oder `send`. "Liste" markiert Funktionen, deren Ergebnis über `maxResults` gekürzt werden kann.

| Toolset | Standard | Tools (Klasse) |
|---|---|---|
| `members` | an | `vo_get_members` (read, Liste), `vo_get_member` (read), `vo_create_member` (write), `vo_update_member` (write), `vo_delete_member` (delete) |
| `contacts` | an | `vo_get_contacts` (read, Liste), `vo_get_contact` (read), `vo_create_contact` (write) |
| `events` | an | `vo_get_events` (read, Liste), `vo_get_event` (read), `vo_get_registrations` (read, Liste), `vo_get_calendar` (read), `vo_create_registration` (write), `vo_change_registration` (write), `vo_create_event` (write), `vo_update_event` (write), `vo_delete_event` (delete) |
| `newsletter` | an | `vo_get_newsletter` (read, Liste), `vo_get_newsletter_beitrag` (read, Liste), `vo_create_subscriber` (write) |
| `lists` | an | `vo_get_lists` (read, Liste), `vo_get_list` (read, Liste), `vo_get_list_view` (read), `vo_create_list_data` (write), `vo_update_list_data` (write) |
| `places` | an | `vo_get_place_bookings` (read, Liste), `vo_check_place` (read), `vo_create_place_booking` (write), `vo_delete_place_bookings` (delete) |
| `fees` | an | `vo_get_member_fees` (read, Liste), `vo_get_member_userfees` (read, Liste), `vo_add_member_userfees` (write), `vo_update_member_userfees` (write), `vo_delete_member_userfees` (delete) |
| `news` | an | `vo_get_news` (read, Liste) |
| `accounting` | an | `vo_get_journal` (read, Liste), `vo_get_invoice` (read), `vo_create_invoice` (write), `vo_get_shop_purchases` (read, Liste) |
| `groups` | an | `vo_get_groups` (read, Liste), `vo_create_group` (write) |
| `pictures` | an | `vo_get_pictures` (read, Liste) |
| `shop` | an | `vo_get_shop` (read, Liste), `vo_get_shop_reservations` (read, Liste) |
| `auth` | **aus** | `vo_verify_login` (read), `vo_check_login` (read), `vo_send_login` (send) |

Zusammen sind das 47 Funktionen: 27 read, 15 write, 4 delete, 1 send.

Anzahl der Tools in der Toolliste, jeweils einschließlich `vo_raw`: 26 in der Standardkonfiguration (12 Toolsets, kein Schalter gesetzt), 48 mit allen 13 Toolsets und allen drei Schaltern (47 Funktionen plus `vo_raw`).

Die Toolsets `members` und `contacts` nutzen dieselben Parameter (`GetContacts` und `CreateContact` sind in der Doku nur als "analog" beschrieben). Das ist unter "Status" beschrieben.

## Klassen und Freigaben

Jede Funktion gehört zu einer Klasse. Daraus ergibt sich, was der Server freigibt.

| Klasse | Funktionen | Freigabe | Zusätzlich pro Aufruf |
|---|---|---|---|
| `read` | 27 | immer, sofern das Toolset aktiv ist | nichts |
| `write` | 15 | `VEREINONLINE_ALLOW_WRITE=1` | nichts |
| `delete` | 4 | `VEREINONLINE_ALLOW_DELETE=1` | `confirm: true` |
| `send` | 1 (`vo_send_login`) | `VEREINONLINE_ALLOW_SEND=1` | `confirm: true` |

- **Standard ist aus.** Schreib-, Lösch- und Versand-Tools sind ohne ihren Schalter nicht vorhanden und erscheinen nicht in der Toolliste. Das Toolset `auth` ist ebenfalls standardmäßig aus.
- **`confirm`.** Lösch- und Versand-Tools verlangen den Parameter `confirm` mit dem Wert `true`. Ohne ihn lehnt der Server den Aufruf ab, bevor er die API erreicht.
- **Mailversand über `vo_change_registration`.** Mit `mail: "1"` versendet die Funktion eine Statusmail. Dafür braucht der Aufruf zusätzlich `VEREINONLINE_ALLOW_SEND` und `confirm: true`, auch wenn `write` freigegeben ist.
- **Mailversand über andere Tools.** `vo_create_member`, `vo_create_registration` und `vo_create_subscriber` können laut Tool-Beschreibung eine Mail auslösen. Das ist nicht geprüft, und die Tools haben keine eigene Sperre. Wer `write` freigibt, gibt diese Mailfunktion also mit frei.
- **`UpdateMember` und `UpdateListData`.** `vo_update_member` kann mit einem `-` vor dem Namen auch Rollen und Gruppen entfernen, `vo_update_list_data` überschreibt vorhandene Daten. Beides gehört zur Klasse `write` und hängt damit allein am Schreib-Schalter, ohne `confirm`.
- **Freigabe ist nicht die einzige Grenze.** Die Rechte, die VereinOnline dem API-Benutzer gibt, gelten weiterhin. Jede Funktion benötigt eine bestimmte API-Benutzerrolle, die in der Tool-Beschreibung steht.

## Antwortgröße

Listen-Tools (Spalte "Liste" oben) liefern höchstens `maxResults` Einträge. Der Standard ist 50, erlaubt sind ganze Zahlen von 1 bis 500. Ein ungültiger Wert fällt beim direkten Aufruf der Funktion auf 50 zurück, im Tool-Schema wird er abgelehnt. Die Antwort hat dann diese Form:

```json
{ "total": 312, "shown": 50, "truncated": true, "items": [ ... ] }
```

- Die API liefert die vollständige Liste, und der Server kürzt danach. Die Kürzung spart also Kontext im Gespräch, verringert aber nicht, welche Daten der Server von VereinOnline abruft.
- Die einzige Ausnahme ist `vo_get_events`. Dort reicht der Parameter `limit` an VereinOnline weiter. Der Parameter `maxResults` kürzt zusätzlich die Ausgabe. Beide sind getrennt.
- Felder, die die API standardmäßig liefert, bleiben so. Mit `felder` (z. B. bei `vo_get_members`) lassen sich weitere Felder anfordern.
- Kommt eine Liste als JSON-Objekt zurück (Schlüssel sind IDs, alle Werte sind Objekte) und hat sie mehr als `maxResults` Einträge, gilt dieselbe Form: `{ "total", "shown", "truncated", "items" }`, wobei `items` dann ein Objekt mit den ersten `maxResults` Einträgen ist.
- Nicht-Listen-Tools geben das Ergebnis der API unverändert zurück, solange es klein ist.
- **Größenobergrenze für jede Antwort.** Ist das Ergebnis (nach der Kürzung) länger als 100 000 Zeichen als JSON, liefert der Server stattdessen `{ "truncated": true, "totalChars": ..., "note": "...", "preview": "..." }`. `preview` enthält die ersten 20 000 Zeichen. Das betrifft auch Nicht-Listen-Tools wie `vo_get_member`, `vo_get_list_view` oder einzelne sehr große Felder (z. B. den HTML-Text eines Newsletters). Dann mit `felder`, `filter` oder `maxResults` eingrenzen.
- Bei `vo_raw` gilt dasselbe für jede Antwort. Auch bei unbekannten `Get`- und `Check`-Funktionen werden Arrays und ID-Objekte gekürzt, und zwar über den eigenen Parameter `maxResults` von `vo_raw` (Standard 50, 1 bis 500).

## `vo_raw`

`vo_raw` ruft beliebige API-Funktionen über ihren Namen auf. Es ist immer registriert, auch wenn kein Toolset aktiv ist. Das Tool ist für Funktionen gedacht, die noch nicht als eigenes Tool existieren.

Parameter:

- `function`: der API-Name, z. B. `GetMembers`. Erlaubt sind nur Buchstaben und Ziffern, und der Name beginnt mit einem Buchstaben (`^[A-Za-z][A-Za-z0-9]*$`).
- `params`: ein Objekt für den Request-Body. Bei bekannten Funktionen wird es gegen dieselben Parameter geprüft wie beim Einzel-Tool (Pflichtfelder, Typen, `maxResults`, `daten`). Nicht dokumentierte Schlüssel werden abgelehnt, ohne dass die API aufgerufen wird. Bei unbekannten Funktionen geht es unverändert an die API (Steuerschlüssel wie `confirm`, `verein`, `maxResults` und `daten` werden entfernt).
- `maxResults` (oben, nicht in `params`): Kürzung von Listen-Antworten, siehe Abschnitt Antwortgröße.
- `confirm` (oben, nicht in `params`): Bestätigung für Aufrufe, die sie brauchen.
- `verein`: nur bei mehreren Profilen.

Die Regeln lauten:

1. **Bekannte Funktion** (Name ohne Beachtung von Groß-/Kleinschreibung, z. B. `getmembers`): Es gelten genau die Regeln des Einzel-Tools. Ist das Toolset oder die Klasse nicht freigegeben, lehnt der Server ab. Lösch- und Versand-Funktionen brauchen `confirm: true`.
2. **Unbekannte Funktion, deren Name mit `Get` oder `Check` beginnt** (Groß-/Kleinschreibung zählt): Der Aufruf ist als Lesezugriff erlaubt. Solche Funktionen gehören zu keinem Toolset. Die Toolset-Auswahl gilt für sie also nicht.
3. **Jede andere unbekannte Funktion**: Dafür müssen `VEREINONLINE_ALLOW_WRITE`, `VEREINONLINE_ALLOW_DELETE` und `VEREINONLINE_ALLOW_SEND` alle gesetzt sein, und der Aufruf braucht `confirm: true`.

Wer `VEREINONLINE_TOOLSETS` einschränkt, sollte wissen, dass Regel 2 diese Einschränkung für unbekannte `Get`- und `Check`-Funktionen aufhebt.

## Datenschutz

- **Mitgliederdaten gehen an den Modellanbieter.** Was der Server aus VereinOnline liest, landet als Tool-Ergebnis im Gespräch. Das Gespräch wird an den Anbieter des verwendeten Modells übertragen. Mitgliederdaten sind personenbezogen (DSGVO). Ob und unter welchen Bedingungen das zulässig ist (Rechtsgrundlage, Auftragsverarbeitung, Drittlandübermittlung), hängt vom Einsatz und vom Anbieter ab. Das ist vor dem produktiven Einsatz zu klären.
- **Passwörter im Gespräch.** `vo_verify_login` und `vo_check_login` nehmen das Passwort eines Mitglieds als Tool-Argument entgegen. Das Passwort erscheint damit im Gesprächsverlauf und geht damit ebenfalls an den Modellanbieter. Die Beschreibungen beider Tools weisen darauf hin. Deshalb ist das Toolset `auth` standardmäßig aus. Es sollte nur aktiviert werden, wenn es gebraucht wird, und nur für Mitglieder, die dem zugestimmt haben.
- **Zugangsdaten.** Der API-Token wird aus Benutzer und MD5 des Passworts gebildet und nur im Authorization-Header an VereinOnline gesendet. Passwort und Token werden aus Fehlermeldungen der API entfernt. Fehler beim Netzwerkzugriff geben nur eine allgemeine Meldung ohne Details aus. Die Konfiguration selbst (Umgebungsvariablen oder Profildatei) enthält aber das Passwort, wenn es dort steht.
- **Keine eigene Datenhaltung.** Der Server schreibt keine Daten auf die Festplatte und hält nichts über einen Aufruf hinaus.

## Entwicklung

```bash
npm install        # Abhängigkeiten installieren
npm run build      # TypeScript nach dist/ kompilieren (tsc)
npm test           # Tests (vitest run)
npm run dev        # Server direkt aus den Quellen starten (tsx src/index.ts), braucht die Umgebungsvariablen
npm start          # Gebauten Server starten (node dist/index.js)
```

Die Tests prüfen unter anderem, dass die 47 Funktionen mit Toolset und Klasse aus `tests/expected-functions.ts` übereinstimmen.

## Lizenz

MIT, siehe [LICENSE](LICENSE).
