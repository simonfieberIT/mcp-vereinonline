# VereinOnline MCP-Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers-extended-cc:subagent-driven-development (recommended) or superpowers-extended-cc:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ein lokaler MCP-Server (stdio), der alle 47 dokumentierten VereinOnline-API-Funktionen als Tools bereitstellt, mit Toolsets und getrennten Freigaben für Schreiben, Löschen und Senden.

**Architecture:** Jede API-Funktion ist ein deklarativer Eintrag (`FunctionDef`) in `src/definitions/<toolset>.ts`. Eine zentrale Registry registriert daraus MCP-Tools, wendet Toolset- und Freigabe-Regeln an, kürzt Listen und bereinigt Antworten. Ein dünner HTTP-Client kapselt Token, POST-JSON und Fehlerbehandlung. `vo_raw` geht durch dieselbe Freigabelogik.

**Tech Stack:** TypeScript (commonjs, Node ≥ 18, globales `fetch`), `@modelcontextprotocol/sdk`, `zod`, `vitest`, `tsx`. Konventionen wie in `../mcp-bni`.

**Spec:** `docs/superpowers/specs/2026-11-14-vereinonline-mcp-design.md` (freigegeben von Simon am 2026-11-14). API-Doku als lokale Kopie: `docs/vereinonline-api-doc.txt` (Quelle der Parameter, UTF-8).

## Global Constraints

- **Request:** `POST <baseUrl>?api=<Funktion>`, Header `Content-Type: application/json` und `Authorization: A/<user>/<md5hex(password)>` (MD5 über die UTF-8-Bytes, Hex klein). Body: flaches JSON-Objekt (`{}` bei leeren Parametern). `baseUrl` endet immer auf `/`.
- **Fehler:** Antwort ist ein JSON-Objekt mit nicht-leerem String-Feld `error` → Fehler. Ein fehlendes oder leeres `error` ist Erfolg. Erfolgsantworten dürfen Arrays, Objekte oder Strings sein (z. B. `VerifyLogin` liefert einen String oder `""`).
- **Geheimnisse:** Passwort, MD5 und Token tauchen in keinem Log, keiner Fehlermeldung, keiner Tool-Ausgabe auf. Logging nur auf **stderr** (stdout gehört dem MCP-Protokoll). Aus `CheckLogin`-Antworten wird das Feld `token` entfernt.
- **Umgebungsvariablen (exakt):** `VEREINONLINE_URL`, `VEREINONLINE_USER`, `VEREINONLINE_PASSWORD`, `VEREINONLINE_PROFILES` (Pfad zu JSON-Datei), `VEREINONLINE_TOOLSETS`, `VEREINONLINE_ALLOW_WRITE`, `VEREINONLINE_ALLOW_DELETE`, `VEREINONLINE_ALLOW_SEND`. Allow-Flags sind wahr bei `1` oder `true` (ohne Beachtung der Groß-/Kleinschreibung), sonst aus.
- **Toolsets (exakt, 13):** `members, contacts, events, newsletter, lists, places, fees, news, accounting, groups, pictures, shop, auth`. Ohne `VEREINONLINE_TOOLSETS` gelten alle außer `auth`. Der Wert `all` meint alle 13.
- **Klassen:** `read`, `write`, `delete`, `send`. Eine Funktion, deren Klasse nicht freigegeben ist, wird **nicht registriert**. `delete` und `send` verlangen zusätzlich `confirm: true` im Aufruf.
- **Funktionen:** Genau 47, Zuordnung und Klassen stehen in `tests/expected-functions.ts` (Task 3) und sind die einzige Wahrheit dafür: 27 read, 15 write, 4 delete, 1 send.
- **Tool-Namen:** `vo_` + snake_case des API-Namens (`GetMembers` → `vo_get_members`, `CreateListData` → `vo_create_list_data`), Beschreibungen auf Englisch, Parameternamen wie in der API (deutsch).
- **Listen:** Tools mit `list: true` haben den Parameter `maxResults` (Standard **50**) und liefern bei Array-Antworten `{ total, shown, truncated, items }`. Nicht-Array-Antworten werden unverändert durchgereicht.
- **Kein Git-Repo vorhanden.** Kein `git init` und keine Commits, solange Simon das nicht verlangt. Falls später committet wird: keine Co-Authored-By-Zeile und keine Claude-Attribution (Simons globale Regel).
- Keine Live-Aufrufe gegen VereinOnline. Alle Tests nutzen gemocktes HTTP.

**User decisions (already made):**
- Alle API-Funktionen sollen enthalten sein.
- Ansatz C: Tool pro Funktion, Toolsets, getrennte Schreib-/Lösch-/Sende-Freigabe, Raw-Tool.
- Zunächst kein Testverein, daher nur Implementierung nach Doku mit gemocktem HTTP (README kennzeichnet das).
- Design-Dokument am 2026-11-14 freigegeben ("Passt").

## Review Focus

Diese Fälle nennt die Spec nicht ausdrücklich, sie treffen Nutzer aber am ehesten. Der Test dazu steht jeweils in der genannten Task.

1. **Antwort ist kein JSON** (HTML-Fehlerseite, leerer Body, 502): klare Fehlermeldung mit HTTP-Status, ohne Seiteninhalt-Dump (Task 2).
2. **Erfolgsantwort ohne Objekt**: `""`, ein nackter String oder `{"error":""}` zählt als Erfolg (Task 2, Task 7 für `VerifyLogin`).
3. **Mehrere Profile**: fehlender oder unbekannter Parameter `verein` ergibt einen Fehler, der die gültigen Namen nennt, und löst keinen HTTP-Aufruf aus (Task 3).
4. **Umlaute und Sonderzeichen** im Passwort (`Müller-ß!`) und in Parametern: MD5 über UTF-8, JSON-Body UTF-8 (Task 2).
5. **Basis-URL-Varianten**: mit/ohne Schrägstrich am Ende, mit Leerzeichen, mit vorhandenem `?api=` (Task 2).

---

## File Structure

```
package.json, tsconfig.json, vitest.config.ts, LICENSE, README.md
src/index.ts            – dünner Einstieg (Shebang, Config laden, Server starten)
src/server.ts           – createServer(config, defs): McpServer
src/config.ts           – Config, loadConfig, ConfigError, ALL_TOOLSETS
src/client.ts           – buildToken, normalizeBaseUrl, callApi, VereinOnlineError
src/registry.ts         – FunctionDef, toolName, isEnabled, runFunction, registerAll, truncateList, GateError
src/raw.ts              – registerRaw (vo_raw)
src/definitions/<toolset>.ts  – je Toolset ein Array von FunctionDef (13 Dateien)
src/definitions/index.ts      – ALL_DEFINITIONS (Task 9)
tests/helpers.ts, tests/expected-functions.ts, tests/*.test.ts, tests/definitions/*.test.ts
```

---

### Task 0: Projektgerüst

**Goal:** Ein bauendes, testbares Projektgerüst mit Abhängigkeiten.

**Depends on:** none · **Tier:** mechanical

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `LICENSE`, `.gitignore`, `tests/smoke.test.ts`

**Acceptance Criteria:**
- [ ] `npm run build` läuft ohne Fehler (leeres `src/` mit einer Platzhalterdatei `src/index.ts` genügt).
- [ ] `npm test` führt `tests/smoke.test.ts` grün aus.
- [ ] `package.json` hat `name: "mcp-vereinonline"`, `type: "commonjs"`, `bin: { "mcp-vereinonline": "dist/index.js" }`, `engines.node: ">=18"`, Skripte `build`, `dev`, `start`, `test`.
- [ ] `LICENSE` ist eine Kopie von `../mcp-bni/LICENSE`.

**Verify:** `npm run build && npm test` → Build ohne Fehler, 1 Test grün

**Steps:**

- [ ] **Step 1:** Lege `package.json`, `tsconfig.json` (target ES2022, module commonjs, strict, `outDir: dist`, `rootDir: src`, nur `src` kompilieren) und `vitest.config.ts` nach dem Vorbild von `../mcp-bni` an. Abhängigkeiten: `@modelcontextprotocol/sdk` (^1), `zod`; Dev: `typescript`, `vitest`, `tsx`, `@types/node`. Wähle die `zod`-Version, die zur installierten SDK-Version passt (in `node_modules/@modelcontextprotocol/sdk/package.json` nachsehen). `.gitignore`: `node_modules`, `dist`.
- [ ] **Step 2:** Test `tests/smoke.test.ts`: `it('runs', () => expect(1 + 1).toBe(2))`. Platzhalter `src/index.ts` mit einem Kommentar. `npm install`.
- [ ] **Step 3:** `npm run build && npm test` ausführen. Erwartet: beides grün.

---

### Task 1: Konfiguration

**Goal:** `loadConfig` liest Umgebung und Profildatei in eine validierte `Config`.

**Depends on:** Task 0 · **Tier:** mechanical

**Files:**
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

**Interfaces:**
```ts
export const ALL_TOOLSETS: readonly string[]; // die 13 Namen aus Global Constraints
export type ToolClass = 'read' | 'write' | 'delete' | 'send';
export interface Profile { name: string; baseUrl: string; user: string; password: string }
export interface Config {
  profiles: Profile[];
  toolsets: Set<string>;
  allow: { write: boolean; delete: boolean; send: boolean };
}
export class ConfigError extends Error {}
export function loadConfig(env?: NodeJS.ProcessEnv, readFile?: (path: string) => string): Config;
```

**Acceptance Criteria:**
- [ ] Mit `VEREINONLINE_URL`, `_USER`, `_PASSWORD` entsteht genau ein Profil mit Namen `default`.
- [ ] Mit `VEREINONLINE_PROFILES` wird die Datei gelesen. Format: `{ "profiles": { "<name>": { "url", "user", "passwordEnv" | "password" } } }`. `passwordEnv` wird aus `env` aufgelöst. Fehlt die Variable, gibt es einen `ConfigError`, der den Profil- und Variablennamen nennt.
- [ ] Sind sowohl `VEREINONLINE_URL` als auch `VEREINONLINE_PROFILES` gesetzt, wirft `loadConfig` einen `ConfigError`. Ohne beides ebenfalls.
- [ ] Ohne `VEREINONLINE_TOOLSETS`: 12 Toolsets (alle außer `auth`). `all`: 13. Eine Liste wie `members, events` (mit Leerzeichen) ergibt genau diese zwei. Ein unbekannter Name wirft einen `ConfigError`, der die gültigen Namen nennt.
- [ ] Allow-Flags: `1`/`true`/`TRUE` wahr, alles andere und fehlend falsch.
- [ ] Keine `ConfigError`-Nachricht enthält ein Passwort.

**Verify:** `npx vitest run tests/config.test.ts` → alle grün

**Steps:**

- [ ] **Step 1:** Tests in `tests/config.test.ts` schreiben: `single profile from env`, `profiles file with passwordEnv`, `missing passwordEnv variable names profile and variable`, `both URL and PROFILES is an error`, `neither is an error`, `default toolsets exclude auth`, `all includes auth`, `toolset list with spaces`, `unknown toolset lists valid names`, `allow flags`, `error messages never contain password` (Passwort `geheim123` setzen, Fehler provozieren, `expect(msg).not.toContain('geheim123')`). `readFile` wird als Fake übergeben.
- [ ] **Step 2:** Tests laufen lassen. Erwartet: FAIL (Modul fehlt).
- [ ] **Step 3:** `loadConfig` nach der Interface-Signatur implementieren. `readFile` Default: `fs.readFileSync(path, 'utf8')`.
- [ ] **Step 4:** Tests laufen lassen. Erwartet: PASS.

---

### Task 2: HTTP-Client

**Goal:** `callApi` führt einen API-Aufruf aus und liefert das geparste Ergebnis oder wirft einen sauberen Fehler.

**Depends on:** Task 0 · **Tier:** standard

**Files:**
- Create: `src/client.ts`
- Test: `tests/client.test.ts`

**Interfaces:**
```ts
export class VereinOnlineError extends Error {
  constructor(message: string, readonly kind: 'api' | 'http' | 'parse' | 'network');
}
export function buildToken(user: string, password: string): string;      // "A/<user>/<md5hex>"
export function normalizeBaseUrl(url: string): string;                   // trim, ohne Query, endet auf "/"
export function callApi(
  profile: Profile, fn: string, params: Record<string, unknown>,
  fetchImpl?: typeof fetch
): Promise<unknown>;
```

**Acceptance Criteria:**
- [ ] `buildToken('susi', 'test1234')` ergibt `A/susi/16d7a4fca7442dda3ad93c9a726597e4`.
- [ ] `buildToken('u', 'Müller-ß!')` nutzt MD5 über UTF-8-Bytes (Test vergleicht gegen `crypto.createHash('md5').update('Müller-ß!', 'utf8').digest('hex')`).
- [ ] `normalizeBaseUrl`: `' https://www.vereinonline.org/ABC '` → `https://www.vereinonline.org/ABC/`; `https://x.org/ABC/` bleibt; `https://x.org/ABC/?api=GetMembers` → `https://x.org/ABC/`.
- [ ] `callApi` sendet `POST <base>?api=GetMembers` mit Header `Authorization`, `Content-Type: application/json` und Body `JSON.stringify(params)`. Umlaute im Body bleiben als UTF-8 erhalten.
- [ ] Antwort `{"error":"Keine Berechtigung"}` → `VereinOnlineError` (kind `api`) mit genau dieser Meldung. `{"error":""}`, `[]`, `""` und `"Meier, Anton"` sind Erfolg und werden unverändert zurückgegeben.
- [ ] HTTP-Status ≥ 400 → kind `http`, Meldung enthält den Status. Nicht-JSON-Body (z. B. `<html>…`) → kind `parse`, Meldung enthält den HTTP-Status und **nicht** den Body. Netzwerkfehler → kind `network`.
- [ ] Keine Fehlermeldung enthält Passwort, MD5 oder Token (Test mit bekanntem Passwort).

**Verify:** `npx vitest run tests/client.test.ts` → alle grün

**Steps:**

- [ ] **Step 1:** Tests schreiben mit einem Fake-`fetch`, der Request-Daten aufzeichnet und konfigurierbar antwortet. Namen: `buildToken known vector`, `buildToken uses utf8`, `normalizeBaseUrl variants`, `sends POST with token and json body`, `umlauts survive in body`, `api error becomes VereinOnlineError`, `empty error and bare strings are success`, `http error`, `non-json body does not leak body`, `network error`, `errors never contain secrets`.
- [ ] **Step 2:** Tests laufen lassen. Erwartet: FAIL.
- [ ] **Step 3:** Implementieren. Antwort zuerst als Text lesen, dann `JSON.parse` in try/catch. `error` gilt nur, wenn die geparste Antwort ein Objekt (kein Array) mit nicht-leerem String-Feld `error` ist.
- [ ] **Step 4:** Tests laufen lassen. Erwartet: PASS.

---

### Task 3: Registry, Freigaben und Listenkürzung

**Goal:** Die zentrale Logik, die aus `FunctionDef`-Einträgen MCP-Tools macht und alle Sicherheitsregeln durchsetzt.

**Depends on:** Task 1, Task 2 · **Tier:** standard

**Files:**
- Create: `src/registry.ts`, `tests/helpers.ts`, `tests/expected-functions.ts`
- Test: `tests/registry.test.ts`

**Interfaces:**
```ts
import type { z } from 'zod';
export interface FunctionDef {
  api: string;                       // 'GetMembers'
  toolset: string;                   // einer der 13
  klass: ToolClass;
  description: string;               // Englisch
  params: z.ZodRawShape;             // nur dokumentierte Parameter
  openFields?: boolean;              // fügt `daten: Record<string,string|number|boolean>` hinzu, flach in den Body gemischt (benannte Parameter gewinnen)
  list?: boolean;                    // Array-Antworten werden gekürzt, `maxResults` kommt dazu
  mayMail?: boolean;                 // hängt der Beschreibung den Hinweis "May send e-mail (unverified)." an
  guard?: (args: Record<string, unknown>, config: Config) => void;  // wirft GateError
  postProcess?: (result: unknown) => unknown;
}
export class GateError extends Error {}
export function toolName(api: string): string;
export function isEnabled(def: FunctionDef, config: Config): boolean;
export function truncateList(result: unknown, max: number): unknown;
export type CallFn = (profile: Profile, fn: string, params: Record<string, unknown>) => Promise<unknown>;
export function runFunction(def: FunctionDef, args: Record<string, unknown>, config: Config, call: CallFn): Promise<unknown>;
export function registerAll(server: McpServer, defs: FunctionDef[], config: Config, call?: CallFn): string[];
```
`tests/expected-functions.ts` exportiert `EXPECTED: Record<string, { toolset: string; klass: ToolClass }>` mit allen 47 Einträgen laut Anhang der Spec. Zuordnung: members (GetMembers, GetMember, CreateMember, UpdateMember, DeleteMember), contacts (GetContacts, GetContact, CreateContact), events (GetEvents, GetEvent, GetRegistrations, GetCalendar, CreateRegistration, ChangeRegistration, CreateEvent, UpdateEvent, DeleteEvent), newsletter (GetNewsletter, GetNewsletterBeitrag, CreateSubscriber), lists (GetLists, GetList, GetListView, CreateListData, UpdateListData), places (GetPlaceBookings, CheckPlace, CreatePlaceBooking, DeletePlaceBookings), fees (GetMemberFees, GetMemberUserfees, AddMemberUserfees, UpdateMemberUserfees, DeleteMemberUserfees), news (GetNews), accounting (GetJournal, GetInvoice, CreateInvoice, GetShopPurchases), groups (GetGroups, CreateGroup), pictures (GetPictures), shop (GetShop, GetShopReservations), auth (VerifyLogin, CheckLogin, SendLogin). Klassen: delete = DeleteMember, DeleteEvent, DeletePlaceBookings, DeleteMemberUserfees; send = SendLogin; write = CreateMember, UpdateMember, CreateContact, CreateRegistration, ChangeRegistration, CreateEvent, UpdateEvent, CreateSubscriber, CreateListData, UpdateListData, CreatePlaceBooking, AddMemberUserfees, UpdateMemberUserfees, CreateInvoice, CreateGroup; alle übrigen read.
`tests/helpers.ts` exportiert `fakeConfig(overrides?)` (ein Profil `default`, Standard-Toolsets, alle Allow-Flags aus) und `makeCall(result?)` (aufzeichnender `CallFn` mit `calls`-Array).

**Acceptance Criteria:**
- [ ] `toolName('GetMembers') === 'vo_get_members'`, `toolName('CreateListData') === 'vo_create_list_data'`, `toolName('GetNewsletterBeitrag') === 'vo_get_newsletter_beitrag'`.
- [ ] `isEnabled`: false, wenn das Toolset nicht aktiv ist oder die Klasse nicht freigegeben ist (`write`/`delete`/`send` brauchen das jeweilige Allow-Flag, `read` nie).
- [ ] `registerAll` registriert nur aktivierte Definitionen und gibt deren Tool-Namen zurück.
- [ ] Der Aufruf eines `delete`- oder `send`-Tools ohne `confirm: true` liefert einen Fehler und löst **keinen** `call` aus. Der Parameter `confirm` ist für diese Klassen im Schema als Pflicht-`z.literal(true)` enthalten, für andere nicht vorhanden.
- [ ] `list`-Tools: `truncateList([…312 Einträge], 50)` → `{ total: 312, shown: 50, truncated: true, items: [50] }`. Genau 50 Einträge → `truncated: false`. Leeres Array → `{ total: 0, shown: 0, truncated: false, items: [] }`. Ein Nicht-Array (`"x"`, `{}`) wird unverändert zurückgegeben.
- [ ] `openFields`: `daten: { key_Hobby: 'Tennis' }` plus `vorname: 'A'` ergibt Body `{ vorname: 'A', key_Hobby: 'Tennis' }`. Bei Namensgleichheit gewinnt der benannte Parameter. `maxResults`, `confirm`, `verein` und `daten` gelangen nie in den Body.
- [ ] Bei genau einem Profil gibt es keinen Parameter `verein`. Bei mehreren ist er Pflicht (Enum der Profilnamen). Unbekannter oder fehlender Wert → Fehler, der die gültigen Namen nennt, kein `call`. (Review Focus 3)
- [ ] `guard` wird vor `call` ausgeführt. `GateError` und `VereinOnlineError` werden als Tool-Ergebnis mit `isError: true` und lesbarer Meldung zurückgegeben (kein Wurf durch das Protokoll). Erfolg: `content: [{ type: 'text', text: JSON.stringify(ergebnis) }]`.
- [ ] `postProcess` wird auf das Ergebnis angewendet, bevor gekürzt und ausgegeben wird. `mayMail` ergänzt die Beschreibung.

**Verify:** `npx vitest run tests/registry.test.ts` → alle grün

**Steps:**

- [ ] **Step 1:** `tests/helpers.ts` und `tests/expected-functions.ts` anlegen. Ein Test in `tests/registry.test.ts` prüft `Object.keys(EXPECTED).length === 47` und die Zählung 27/15/4/1.
- [ ] **Step 2:** Tests in `tests/registry.test.ts` schreiben: `toolName conversion`, `isEnabled matrix` (Toolset aus/an × vier Klassen × Flag an/aus), `registerAll registers only enabled`, `delete without confirm is refused and makes no call`, `send without confirm is refused`, `confirm only present for delete and send`, `truncateList cases`, `openFields merging and precedence`, `control params never reach the body`, `single profile has no verein param`, `multiple profiles require verein`, `unknown verein names valid ones and makes no call`, `guard runs before call`, `errors become isError results`, `postProcess runs before truncation`, `mayMail note in description`. Für Tool-Aufrufe ein kleines Fake-Server-Objekt verwenden, das `registerTool(name, config, handler)` aufzeichnet (oder `McpServer` plus `InMemoryTransport` des SDK).
- [ ] **Step 3:** Tests laufen lassen. Erwartet: FAIL.
- [ ] **Step 4:** `src/registry.ts` nach den Interfaces implementieren. Das Eingabeschema je Tool baut sich aus `def.params` plus den automatischen Parametern (`maxResults` bei `list`, `daten` bei `openFields`, `confirm` bei `delete`/`send`, `verein` bei mehreren Profilen). `runFunction` ist die gemeinsame Ausführung (Profil wählen, Guard, Body bauen, `call`, `postProcess`, kürzen) und wird auch von Task 8 genutzt.
- [ ] **Step 5:** Tests laufen lassen. Erwartet: PASS.

---

### Task 4: Definitionen Mitglieder und Kontakte

**Goal:** `members` (5) und `contacts` (3) als `FunctionDef`-Einträge.

**Depends on:** Task 3 · **Tier:** standard

**Files:**
- Create: `src/definitions/members.ts`, `src/definitions/contacts.ts`
- Test: `tests/definitions/members.test.ts`

**Acceptance Criteria:**
- [ ] `src/definitions/members.ts` exportiert `MEMBERS: FunctionDef[]` mit `GetMembers` (list, read), `GetMember` (read), `CreateMember` (write, openFields, mayMail), `UpdateMember` (write, openFields), `DeleteMember` (delete). `contacts.ts` exportiert `CONTACTS` mit `GetContacts` (list, read), `GetContact` (read), `CreateContact` (write, openFields). Toolset und Klasse stimmen mit `EXPECTED` überein.
- [ ] Parameter laut `docs/vereinonline-api-doc.txt` (Abschnitte Mitglieder): `GetMembers`: `felder`, `filter`, `rolle`, `gruppe`, `sort`, `suche`, `plz`, `km` (alle optional, Strings bzw. Zahl); `GetMember`/`GetContact`: `id` Pflicht; `UpdateMember`: `id` Pflicht, die Listenparameter (`rollen`, `gruppen`, `beitraege`, `beitragsgruppen`, `beitraganzahl`, `beitragstart`, `beitragende`) optional; `DeleteMember`: `id` Pflicht.
- [ ] Tests belegen je Funktion: richtiger API-Name, richtige Body-Parameter, Klasse/Toolset aus `EXPECTED`. Die Beschreibung von `GetMembers` nennt, dass der Betreiber Felder einschränken kann.

**Verify:** `npx vitest run tests/definitions/members.test.ts` → alle grün

**Steps:**

- [ ] **Step 1:** Tabellengetriebener Test (`it.each([...MEMBERS, ...CONTACTS])`) für Metadaten gegen `EXPECTED`, plus je ein Aufruf über `runFunction` mit Fake-`call`: `GetMembers sends filter and suche`, `GetMember sends id`, `CreateMember merges daten into body`, `UpdateMember requires id`, `DeleteMember needs confirm`.
- [ ] **Step 2:** Tests laufen lassen. Erwartet: FAIL.
- [ ] **Step 3:** Beide Dateien nach `docs/vereinonline-api-doc.txt` schreiben (Abschnitte "Abruf Mitgliederliste" bis "Löschen eines Mitglieds"). Beschreibungen kurz, englisch, mit dem benötigten Rollenrecht des API-Users.
- [ ] **Step 4:** Tests laufen lassen. Erwartet: PASS.

---

### Task 5: Definitionen Veranstaltungen

**Goal:** `events` (9) als `FunctionDef`-Einträge.

**Depends on:** Task 3 · **Tier:** standard

**Files:**
- Create: `src/definitions/events.ts`
- Test: `tests/definitions/events.test.ts`

**Acceptance Criteria:**
- [ ] `EVENTS` enthält `GetEvents` (list, read), `GetEvent`, `GetRegistrations` (list), `GetCalendar` (alle read), `CreateRegistration` (write, mayMail), `ChangeRegistration` (write, mit `guard`), `CreateEvent` (write, openFields), `UpdateEvent` (write, openFields), `DeleteEvent` (delete). Toolset und Klasse stimmen mit `EXPECTED`.
- [ ] Parameter laut Doku: `GetEvents`: `typ`, `filter`, `jahr`, `limit`, `gruppenid`, `monat`, `abmonat`, `bismonat`, `kostenfremd`, `search`, `restriction`, `sichtbar`. `GetEvent`: `id` Pflicht, `typ`. `GetRegistrations`: `id`. `GetCalendar`: `m`, `y` Pflicht, `typ`. `CreateRegistration`: `veranstaltungid` Pflicht, `userid`, `vorname`, `nachname`, `anmerkung`, Begleiter über `daten` (`begleiter1.vorname` …). `ChangeRegistration`: `anmeldeid` Pflicht, `status` (0–3), `anwesend` (0/1), `anmerkung`, `kurs`, `mail`. `UpdateEvent`/`DeleteEvent`: `id` Pflicht.
- [ ] Das API-Argument `limit` bei `GetEvents` wird an die API durchgereicht, `maxResults` kürzt zusätzlich clientseitig. Beide Namen sind getrennt.
- [ ] `ChangeRegistration` mit `mail: '1'` (oder `1`/`true`) ohne `allow.send` → `GateError`, kein `call`. Mit `allow.send` und ohne `confirm: true` ebenfalls `GateError`. Ohne `mail` läuft der Aufruf mit nur `allow.write`. Für `ChangeRegistration` ist `confirm` als optionaler Parameter im Schema (nicht Pflicht).

**Verify:** `npx vitest run tests/definitions/events.test.ts` → alle grün

**Steps:**

- [ ] **Step 1:** Metadaten-Test gegen `EXPECTED` plus Aufruftests: `GetEvents forwards jahr and limit`, `GetCalendar requires m and y`, `CreateRegistration with userid`, `ChangeRegistration status only needs write`, `ChangeRegistration mail=1 needs send flag`, `ChangeRegistration mail=1 with send flag needs confirm`, `DeleteEvent needs confirm`.
- [ ] **Step 2:** Tests laufen lassen. Erwartet: FAIL.
- [ ] **Step 3:** `src/definitions/events.ts` nach den Abschnitten "Veranstaltungen" der Doku schreiben. Für den optionalen `confirm` bei `ChangeRegistration` den Parameter in `params` als `z.literal(true).optional()` führen.
- [ ] **Step 4:** Tests laufen lassen. Erwartet: PASS.

---

### Task 6: Definitionen Newsletter, Listen, Platzbuchung, Beiträge

**Goal:** `newsletter` (3), `lists` (5), `places` (4), `fees` (5).

**Depends on:** Task 3 · **Tier:** standard

**Files:**
- Create: `src/definitions/newsletter.ts`, `src/definitions/lists.ts`, `src/definitions/places.ts`, `src/definitions/fees.ts`
- Test: `tests/definitions/lists-places-fees.test.ts`

**Acceptance Criteria:**
- [ ] Exporte `NEWSLETTER`, `LISTS`, `PLACES`, `FEES` mit allen Funktionen laut `EXPECTED`. `CreateSubscriber` ist `mayMail`. `GetNewsletter`, `GetLists`, `GetList`, `GetPlaceBookings`, `GetMemberFees`, `GetMemberUserfees` sind `list`. `CreateListData`, `UpdateListData` sind `openFields`.
- [ ] Parameter laut Doku (Abschnitte Newsletter, Flexible Listen, Platzbuchung, Mitgliedsbeiträge). Bei `GetList`: `id` Pflicht, `filter`, `return`.
- [ ] Die zweite, unbenannte `GetList`-Überschrift der Doku bleibt unberücksichtigt. Im Kopfkommentar von `lists.ts` steht, dass dieser Eintrag ungeklärt ist (Spec: "Doku-Unstimmigkeiten").
- [ ] Dateifelder bei `CreateListData`/`UpdateListData` werden über `daten` im Format `dateiname|inhalt` durchgereicht, die Beschreibung erklärt das.
- [ ] `DeletePlaceBookings` und `DeleteMemberUserfees` sind `delete` und verlangen `confirm`.

**Verify:** `npx vitest run tests/definitions/lists-places-fees.test.ts` → alle grün

**Steps:**

- [ ] **Step 1:** Metadaten-Test gegen `EXPECTED` für alle vier Arrays und je Funktion ein Aufruftest (API-Name und Body). Zusätzlich `CreateListData passes file field via daten`, `DeletePlaceBookings needs confirm`, `DeleteMemberUserfees needs confirm`.
- [ ] **Step 2:** Tests laufen lassen. Erwartet: FAIL.
- [ ] **Step 3:** Vier Dateien nach den Doku-Abschnitten schreiben.
- [ ] **Step 4:** Tests laufen lassen. Erwartet: PASS.

---

### Task 7: Definitionen News, Buchführung, Gruppen, Bilder, Shop, Auth

**Goal:** `news` (1), `accounting` (4), `groups` (2), `pictures` (1), `shop` (2), `auth` (3).

**Depends on:** Task 3 · **Tier:** standard

**Files:**
- Create: `src/definitions/news.ts`, `src/definitions/accounting.ts`, `src/definitions/groups.ts`, `src/definitions/pictures.ts`, `src/definitions/shop.ts`, `src/definitions/auth.ts`
- Test: `tests/definitions/misc.test.ts`

**Acceptance Criteria:**
- [ ] Exporte `NEWS`, `ACCOUNTING`, `GROUPS`, `PICTURES`, `SHOP`, `AUTH` mit allen Funktionen laut `EXPECTED`. Listen-Funktionen: `GetNews`, `GetJournal`, `GetShopPurchases`, `GetGroups`, `GetPictures`, `GetShop`, `GetShopReservations`.
- [ ] `CreateInvoice` hat die in der Doku aufgeführten Parameter (`datum` und `betrag` Pflicht, übrige optional) und `openFields: true` für die nummerierten Schlüssel (`kontonr1`, `kontobetrag1`, `positionanzahl1`, `positiontext1`, …). Die Tool-Beschreibung nennt die nummerierten Schlüssel mit Beispiel. Dass die Doku den Methodennamen fälschlich als `GetInvoice` führt, steht nur als Code-Kommentar in `accounting.ts`.
- [ ] `CheckLogin` hat `postProcess`, das das Feld `token` aus Objekten entfernt und andere Felder erhält. Nicht-Objekte bleiben unverändert.
- [ ] `VerifyLogin` akzeptiert die Antworten `""`, `"Meier, Anton"`, `12345` und `{ name, email }` unverändert. (Review Focus 2)
- [ ] `SendLogin` ist `send`, verlangt `confirm`, Parameter `id` Pflicht. Die Beschreibungen von `VerifyLogin`/`CheckLogin` warnen, dass das Passwort als Tool-Argument im Gespräch erscheint.
- [ ] `CreateGroup` ist write und `openFields`.

**Verify:** `npx vitest run tests/definitions/misc.test.ts` → alle grün

**Steps:**

- [ ] **Step 1:** Metadaten-Test gegen `EXPECTED` und Aufruftests: `CreateInvoice flattens kontonr1 and positiontext1`, `CheckLogin strips token`, `CheckLogin keeps other fields`, `VerifyLogin passes through empty string and bare values`, `SendLogin needs confirm`, `GetJournal is truncated by maxResults`.
- [ ] **Step 2:** Tests laufen lassen. Erwartet: FAIL.
- [ ] **Step 3:** Sechs Dateien nach den Doku-Abschnitten "Sonstiges" und den Login-Abschnitten schreiben.
- [ ] **Step 4:** Tests laufen lassen. Erwartet: PASS.

---

### Task 8: Raw-Tool

**Goal:** `vo_raw` ruft beliebige API-Funktionen auf und achtet dabei dieselben Freigaben wie die Einzel-Tools.

**Depends on:** Task 3 · **Tier:** standard

**Files:**
- Create: `src/raw.ts`
- Test: `tests/raw.test.ts`

**Interfaces:**
```ts
export function registerRaw(server: McpServer, defs: FunctionDef[], config: Config, call?: CallFn): void;
```
Schema: `function: string`, `params: Record<string, unknown>` (optional), `confirm: boolean` (optional), `verein` (wie bei den anderen Tools).

**Acceptance Criteria:**
- [ ] **Bekannter Name** (in `defs`): gleiche Prüfung wie das Einzel-Tool (`isEnabled`, also Toolset **und** Klasse, `confirm` bei delete/send, `guard`, `postProcess`). Beispiel: `CheckLogin` ist über `vo_raw` nicht erreichbar, solange `auth` aus ist. `DeleteMember` geht nur mit `allow.delete` und `confirm: true`.
- [ ] **Unbekannter Name**, der mit `Get` oder `Check` beginnt: erlaubt, ohne Freigaben.
- [ ] **Unbekannter Name anderer Art:** nur wenn `allow.write`, `allow.delete` und `allow.send` alle wahr sind, und nur mit `confirm: true`. Sonst Fehler ohne HTTP-Aufruf.
- [ ] Funktionsnamen müssen `^[A-Za-z][A-Za-z0-9]*$` entsprechen, sonst Fehler (verhindert Einschleusen in `?api=`).
- [ ] `vo_raw` ist immer registriert. Parameter werden unverändert als Body gesendet, Ergebnisse nicht gekürzt, aber `CheckLogin`-Ergebnisse bereinigt (über das `postProcess` der Definition).

**Verify:** `npx vitest run tests/raw.test.ts` → alle grün

**Steps:**

- [ ] **Step 1:** Tests: `known read function passes`, `known function in disabled toolset is refused`, `known delete needs flag and confirm`, `unknown Get name allowed`, `unknown Check name allowed`, `unknown other name needs all three flags and confirm`, `unknown other name refused with only write flag`, `invalid function name refused`, `CheckLogin via raw strips token` (mit `auth` an), `verein handling matches other tools`.
- [ ] **Step 2:** Tests laufen lassen. Erwartet: FAIL.
- [ ] **Step 3:** `registerRaw` implementieren, die bekannte Namen über `runFunction` laufen lässt (damit gilt dieselbe Logik), unbekannte Namen über den Aufruf mit eigener Prüfung.
- [ ] **Step 4:** Tests laufen lassen. Erwartet: PASS.

---

### Task 9: Server-Verdrahtung und Abdeckungstest

**Goal:** `createServer` setzt alle Definitionen und `vo_raw` zusammen. Ein Test beweist die vollständige Abdeckung.

**Depends on:** Task 4, Task 5, Task 6, Task 7, Task 8 · **Tier:** mechanical

**Files:**
- Create: `src/definitions/index.ts`, `src/server.ts`
- Modify: `src/index.ts` (ersetzt den Platzhalter)
- Test: `tests/coverage.test.ts`, `tests/server.test.ts`

**Interfaces:**
```ts
// src/definitions/index.ts
export const ALL_DEFINITIONS: FunctionDef[];   // alle 13 Arrays zusammengefügt
// src/server.ts
export function createServer(config: Config, call?: CallFn): McpServer;
```
`src/index.ts`: Shebang `#!/usr/bin/env node`, `loadConfig()`, `createServer`, `StdioServerTransport`. Bei `ConfigError` Meldung auf stderr und `process.exit(1)`.

**Acceptance Criteria:**
- [ ] `ALL_DEFINITIONS` enthält jede der 47 API-Namen aus `EXPECTED` genau einmal, ohne zusätzliche, mit passendem Toolset und passender Klasse. Keine zwei Definitionen haben denselben Tool-Namen.
- [ ] Mit Standardkonfiguration (12 Toolsets, keine Allow-Flags) listet der Server über `InMemoryTransport` genau **26** Tools (25 read-Funktionen außerhalb `auth` plus `vo_raw`).
- [ ] Mit allen Toolsets (`all`) und allen drei Allow-Flags: **48** Tools (47 plus `vo_raw`).
- [ ] Mit `toolsets = {members}` ohne Flags: genau `vo_get_members`, `vo_get_member`, `vo_raw`.
- [ ] `delete`-Tools erscheinen nur mit `allow.delete`, `send`-Tools nur mit `allow.send`.
- [ ] `npm run build` erzeugt `dist/index.js` mit Shebang.

**Verify:** `npm run build && npx vitest run` → Build ohne Fehler, alle Tests grün

**Steps:**

- [ ] **Step 1:** `tests/coverage.test.ts` (Vollständigkeit gegen `EXPECTED`, eindeutige Tool-Namen) und `tests/server.test.ts` (vier Tool-Zählungen über SDK-Client plus `InMemoryTransport`) schreiben.
- [ ] **Step 2:** Tests laufen lassen. Erwartet: FAIL.
- [ ] **Step 3:** `src/definitions/index.ts`, `src/server.ts` und `src/index.ts` implementieren.
- [ ] **Step 4:** `npm run build && npx vitest run`. Erwartet: grün.

---

### Task 10: README und Abschlussprüfung

**Goal:** Eine README, die Einrichtung, Schalter, Einschränkungen und Datenschutzhinweise erklärt, und eine Endprüfung des Pakets.

**Depends on:** Task 9 · **Tier:** mechanical

**Files:**
- Create: `README.md`

**Acceptance Criteria:**
- [ ] Deutsche README mit: Zweck, Einrichtung (Claude-Desktop/Claude-Code-Konfig-Beispiel mit den Umgebungsvariablen), Tabelle der Umgebungsvariablen, Tabelle der 13 Toolsets mit ihren Funktionen, Erklärung der Klassen und Freigaben (Standard aus, `confirm` bei delete/send), Profildatei-Beispiel mit `passwordEnv`, `vo_raw`-Regeln.
- [ ] Der Abschnitt "Status" sagt ausdrücklich: nach Dokumentation implementiert, nicht live verifiziert. Die bekannten Einschränkungen sind aufgelistet: zweites `GetList` ungeklärt, `GetContacts`/`GetContact`/`CreateContact` nur als "analog" dokumentiert (kein `UpdateContact`/`DeleteContact`), Mailversand weiterer Funktionen unbekannt (Beschreibungen tragen den Hinweis), Paginierung nur clientseitig, genaue Parameterformate unbestätigt.
- [ ] Datenschutzhinweis: Mitgliederdaten gehen an den Modellanbieter (DSGVO). Hinweis zu `VerifyLogin`/`CheckLogin`: Passwörter erscheinen als Tool-Argument.
- [ ] Die Zahlen der README (47 Funktionen, 27/15/4/1, 12 bzw. 13 Toolsets) stimmen mit dem Code überein.

**Verify:** `npm run build && npx vitest run && grep -c "nicht live verifiziert" README.md` → Build ok, Tests grün, Zähler ≥ 1

**Steps:**

- [ ] **Step 1:** README nach den Kriterien schreiben, Struktur wie `../mcp-bni/README.md`.
- [ ] **Step 2:** Endprüfung: `npm run build`, `npx vitest run`, `node dist/index.js` ohne Umgebungsvariablen beenden sich mit Exit-Code 1 und einer Meldung ohne Geheimnisse auf stderr (`node dist/index.js; echo $?` → `1`).
- [ ] **Step 3:** Prüfen, dass die Zahlen aus dem Abdeckungstest und der README übereinstimmen.
