# VereinOnline MCP-Server – Design

Stand: 2026-11-14 · Status: Entwurf zur Freigabe

## Absicht und Warum

Simon will Claude Zugriff auf VereinOnline (Vereinssoftware, https://www.vereinonline.org) geben, und zwar über die dokumentierte JSON-API (https://www.vereinonline.org/api). Es gibt keinen einzelnen Anwendungsfall. Das Ziel ist eine langfristige Grundlage: so viel wie möglich aus dem System auslesen und, wo sinnvoll, auch hineinschreiben. Deshalb gilt **vollständige Abdeckung aller dokumentierten API-Funktionen** (47 Stück, siehe Anhang; darin sind `GetContacts`/`GetContact`/`CreateContact` mitgezählt, die die Doku nur als "analog" zu den Mitglieder-Funktionen nennt). Welche Funktion später gebraucht wird, ist heute offen.

## Ziele

- Jede dokumentierte API-Funktion (alle 47 im Anhang) ist als eigenes MCP-Tool mit getypten Parametern und aussagekräftiger Beschreibung verfügbar.
- Gefährliche Funktionen (Schreiben, Löschen, Mailversand) sind standardmäßig aus und müssen einzeln freigeschaltet werden.
- Der Server lässt sich in Teilen laden (Toolsets), damit der Kontext des Modells klein bleibt.
- Neue, noch undokumentierte API-Funktionen sind über ein Raw-Tool erreichbar, ohne den Server zu ändern.
- Läuft wie Simons andere Server (mcp-bni, mcp-meetergo): lokal per stdio, konfiguriert über Umgebungsvariablen.

## Nicht-Ziele

- Keine eigene Datenhaltung, kein Cache über einen Request hinaus, keine Synchronisation.
- Keine Weboberfläche und kein Remote-/HTTP-Betrieb in der ersten Version.
- Keine eigene Rechteverwaltung über die Schalter hinaus. Die Rechte steuert die Rolle des API-Benutzers in VereinOnline.
- Keine fachlichen Workflows (z. B. "Mahnlauf"). Das wären spätere Aufsätze auf den Basis-Tools.

## Anti-Ziele (Das wäre ein Fehlschlag, auch wenn es technisch läuft)

- Ein Löschen, Schreiben oder Mailversand passiert, ohne dass Simon es bewusst erlaubt hat.
- Das Modell wird mit riesigen Antworten überflutet (z. B. alle Mitglieder mit allen Feldern).
- Passwort oder Token landen in Logs, Fehlermeldungen, Tool-Ausgaben oder URLs.

## Randbedingungen

- **Pro Verein eine eigene Basis-URL** (`https://www.vereinonline.org/<VEREIN>/`). Aufruf: `?api=<Funktion>`.
- **Authentifizierung:** Header `Authorization: A/<benutzer>/<md5(passwort)>`. Der Benutzer muss eine Rolle mit passenden Rechten haben, der Benutzer `admin` ist nicht zulässig. Der Header-Weg (Variante 1 der Doku, POST mit JSON-Body) wird genutzt, damit der Token nicht in der URL steht.
- Alle Parameter UTF-8. Fehler kommen als JSON-Objekt mit Feld `error` (HTTP-Status ist nicht verlässlich dafür).
- Die Doku nennt Rollenrechte je Funktion (z. B. "Mitgliederdaten = lesen"). Fehlt ein Recht, liefert VereinOnline einen Fehler. Der Server soll das verständlich weitergeben.
- Der Betreiber des Vereins kann die gelieferten Felder serverseitig einschränken (`api.getmembers.felder.freigegeben` u. a.). Der Server darf sich nicht darauf verlassen, dass angeforderte Felder ankommen.
- Mitgliederdaten sind personenbezogen (DSGVO). Antworten gehen an den Modellanbieter. Das gehört in die README als Hinweis.
- **Request-Form laut Doku:** `POST ?api=<Funktion>` mit flachem JSON-Objekt als Body, Header `Content-Type: application/json` und `Authorization`. Listen- und Positionsparameter sind nummerierte flache Schlüssel (`kontonr1`, `kontobetrag1`, `positiontext2`, …). Dateifelder bei flexiblen Listen haben das Format `dateiname|inhalt`. Die Doku ist die Quelle für die Parameter. Abweichungen werden später gegen einen echten Verein korrigiert (siehe "Offen").
- **Doku-Unstimmigkeiten:** Bei `CreateInvoice` steht als Methodenname fälschlich `GetInvoice` (Tippfehler, Überschrift und Beispiel sagen `CreateInvoice`). `GetList` steht zweimal mit identischer Beschreibung. Der zweite Eintrag gehört zu einer Überschrift, die in der Doku abgeschnitten ist. Welche Funktion das ist, ist unbekannt und bleibt offen. Paginierung wird nur bei `GetEvents` (`limit`) erwähnt.
- `VerifyLogin` und `CheckLogin` bekommen das Klartext-Passwort eines Mitglieds als Parameter. `CheckLogin` liefert außerdem einen `token` zurück.

## Ansätze (verglichen)

| | Beschreibung | Vorteil | Nachteil |
|---|---|---|---|
| A | Ein Tool pro API-Funktion (46) | Eindeutig, getypt | Viel Kontext, keine Gewichtung von Risiko |
| B | Wenige generische Tools (`vo_call`, `vo_describe`) | Kleiner Kontext, alles abgedeckt | Parameter muss das Modell raten, Schutz vor Löschen kaum sauber möglich |
| **C** | **A plus Schalter (Toolsets, Schreib-/Lösch-/Sende-Freigabe) plus Raw-Tool** | **Volle Abdeckung, kontrollierbar, zukunftsoffen** | **Etwas mehr Konfiguration** |

**Gewählt: C** (Simon hat die Empfehlung bestätigt).

## Entscheidungen von Simon

- Alle API-Funktionen sollen enthalten sein.
- Ansatz C: Tool pro Funktion, Toolsets, Schreib-/Lösch-Freigabe getrennt, Raw-Tool.

## Meine Entscheidungen (Simon kann widersprechen)

1. **Technik:** TypeScript, `@modelcontextprotocol/sdk`, `zod` für Parameter, `vitest` für Tests, Node ≥ 18, `commonjs` wie in mcp-bni. Ein Paket `mcp-vereinonline`.
2. **Konfiguration über Umgebungsvariablen:**
   - Einfach: `VEREINONLINE_URL`, `VEREINONLINE_USER`, `VEREINONLINE_PASSWORD`.
   - Mehrere Vereine: `VEREINONLINE_PROFILES` verweist auf eine JSON-Datei mit benannten Profilen. Jedes Tool hat dann den optionalen Parameter `verein`. Bei genau einem Profil entfällt er.
   - `VEREINONLINE_TOOLSETS` (kommagetrennt), Standard: alle außer `auth`.
   - `VEREINONLINE_ALLOW_WRITE`, `VEREINONLINE_ALLOW_DELETE`, `VEREINONLINE_ALLOW_SEND`, jeweils Standard aus.
3. **Funktionsklassen:** `read`, `write` (Create/Update), `delete`, `send` (löst Mailversand aus, z. B. `SendLogin`). Tools einer nicht freigegebenen Klasse werden gar nicht registriert (das Modell sieht sie nicht).
4. **Zusätzliche Bestätigung:** `delete`- und `send`-Tools verlangen zusätzlich den Parameter `confirm: true`. Das ist der Gürtel zum Hosenträger der Umgebungsvariable.
5. **Toolsets:** `members`, `contacts`, `events` (inkl. Registrierungen und Kalender), `newsletter` (inkl. `CreateSubscriber`), `lists`, `places`, `fees` (`GetMemberFees` und alle `*MemberUserfees`), `news`, `accounting` (`GetJournal`, `GetInvoice`, `CreateInvoice`, `GetShopPurchases`), `groups`, `pictures`, `shop` (`GetShop`, `GetShopReservations`), `auth` (`VerifyLogin`, `CheckLogin`, `SendLogin`, standardmäßig aus). Jede Funktion gehört genau zu einem Toolset.
6. **Raw-Tool `vo_raw`:** Funktionsnamen, die mit `Get` oder `Check` beginnen, sind immer erlaubt (lesend, nach Namenskonvention der API). Alle anderen Namen sind nur erlaubt, wenn Schreiben, Löschen **und** Senden freigegeben sind, und verlangen `confirm: true`. Grund: Eine unbekannte Funktion kann alles tun, und die Freigabe für Schreiben soll nicht heimlich das Löschen mit freischalten.
7. **Antwortgröße:** Listen-Tools bekommen `maxResults` (Standard 50). Da die API außer bei `GetEvents` (`limit`) nicht paginiert, kürzt der Server nach dem Abruf und meldet die Gesamtzahl ("50 von 312 angezeigt"). Wo die API ein `felder`-Argument kennt, wird es durchgereicht. Ohne Angabe gilt der Standardsatz der API (z. B. bei `GetMembers`: id, vorname, nachname, …), der Server fordert nicht von sich aus mehr Felder an.
8. **Geheimnisse:** Das Passwort wird nur lokal zu MD5 gehasht. Weder Passwort noch Token werden geloggt oder in Fehlertexte übernommen. Logging nur auf stderr. Die Antwort von `CheckLogin` wird um das Feld `token` bereinigt. `VerifyLogin`/`CheckLogin` liegen deshalb im Toolset `auth` (Standard aus), und die README weist darauf hin, dass dort fremde Passwörter als Tool-Argument im Gespräch landen.
8a. **Profildatei:** Jedes Profil nennt Verein-URL, Benutzer und entweder `passwordEnv` (Name einer Umgebungsvariable, empfohlen) oder `password` im Klartext. Die Schalter (Toolsets, Allow-Flags) gelten global, nicht je Profil.
8b. **Mailversand als Nebenwirkung:** Die Doku nennt nur `SendLogin` und `ChangeRegistration` mit `mail=1`. Ob weitere Funktionen Mails auslösen (z. B. `CreateRegistration`, `CreateMember`, `CreateSubscriber`), ist unbekannt und wird live geprüft. Bis dahin steht in der Beschreibung dieser Tools der Hinweis "löst eventuell Mailversand aus". `ChangeRegistration` ist ein `write`-Tool und verweigert `mail=1`, solange `ALLOW_SEND` nicht gesetzt ist. Mit `ALLOW_SEND` verlangt es für `mail=1` zusätzlich `confirm: true`.
9. **Sprache:** Tool-Namen und -Beschreibungen auf Englisch (wie mcp-bni), API-Feldnamen unverändert deutsch. README auf Deutsch und Englisch ist optional.
10. **Tests:** Unit-Tests mit gemocktem HTTP für jede Funktion (Request-Form, Fehlerpfad, Freigabelogik). Ein optionaler Live-Smoke-Test, nur lesend, läuft nur, wenn Zugangsdaten gesetzt sind.

## Dem Bauenden überlassen

- Exakte Tool-Namen und Parameter-Schemas je Funktion (Quelle: die Doku, Abgleich gegen den echten Verein).
- Auflösung der Doku-Unstimmigkeiten (doppelte Funktionsnamen, Paginierung, `GetContacts`/`UpdateContact`/`DeleteContact`: die Doku sagt nur "analog").
- Umgang mit Datei-Parametern bei `CreateListData`/`UpdateListData` (Format `dateiname|inhalt`).
- Projektstruktur im Detail, Build- und Release-Setup, MCPB-Paket.

## Offen, braucht Simon

- **Entschieden (Simon, 2026-11-14): Zunächst kein Testverein.** Der Server wird komplett nach Doku gebaut und nur mit gemocktem HTTP getestet. Es gibt in dieser Phase keine Live-Verifikation, auch keine lesende.
- Konsequenzen: Die README kennzeichnet den Server als "nach Dokumentation implementiert, nicht live verifiziert". Die Doku-Lücken (zweites `GetList`, `GetContacts`/`UpdateContact`/`DeleteContact`, Mailversand weiterer Funktionen, Paginierung, genaue Parameterformate) bleiben offen und sind als bekannte Einschränkungen aufzulisten. Schreib-, Lösch- und Sende-Tools bleiben wie vorgesehen standardmäßig aus.
- Sobald Simon einen Testzugang hat, folgt ein eigener Verifikationsschritt. Ob er auch schreibend sein darf, hängt dann davon ab, ob es einen Wegwerf-Verein gibt.

## Anhang: Funktionen nach Klasse

Insgesamt 27 + 15 + 4 + 1 = 47 Funktionen.

- **read (27):** GetMembers, GetMember, GetContacts, GetContact, GetEvents, GetEvent, GetRegistrations, GetCalendar, GetNewsletter, GetNewsletterBeitrag, GetLists, GetList, GetListView, GetPlaceBookings, CheckPlace, GetMemberFees, GetMemberUserfees, GetNews, GetJournal, GetInvoice, GetGroups, GetPictures, GetShop, GetShopPurchases, GetShopReservations, VerifyLogin, CheckLogin
- **write (15):** CreateMember, UpdateMember, CreateContact, CreateRegistration, ChangeRegistration, CreateEvent, UpdateEvent, CreateSubscriber, CreateListData, UpdateListData, CreatePlaceBooking, AddMemberUserfees, UpdateMemberUserfees, CreateInvoice, CreateGroup
- **delete (4):** DeleteMember, DeleteEvent, DeletePlaceBookings, DeleteMemberUserfees
- **send (1):** SendLogin (außerdem löst `ChangeRegistration` mit `mail=1` einen Mailversand aus, deshalb gilt dafür `send`-Freigabe, sobald der Parameter gesetzt wird)
