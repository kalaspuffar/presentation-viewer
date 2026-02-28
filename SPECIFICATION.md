# Project Specification: JDK JEP Web Presentation Tool

**Version:** 1.1
**Date:** 2026-02-25
**Status:** Final
**Based on:** REQUIREMENTS.md v1.1

---

## 1. Executive Summary

This specification describes a self-hosted, browser-based presentation tool that replaces the existing Python/PowerPoint pipeline. The tool scrapes JEP data from `openjdk.org`, stores it in SQLite, and provides two modes: an **editor** for building and refining presentations, and a **view mode** for delivering them as a fullscreen slideshow via Reveal.js.

### Key Objectives
- Eliminate the `.pptx` dependency for JEP presentations
- Enable live, in-browser slide editing before and during presentations
- Deliver a smooth, keyboard-driven presentation experience

### Success Criteria
- Valid JDK version → complete presentation skeleton in under 30 seconds
- All slides editable; changes persist across browser sessions
- View mode: fullscreen, arrow-key navigation, slide counter
- Zero npm, zero build step — plain files served by Apache

---

## 2. Architecture Overview

### High-Level Architecture

```
Browser
  │
  ├── www/editor.php          (Editor UI — sidebar + edit pane)
  ├── www/view.php            (Reveal.js slideshow)
  │
  ├── www/api/scrape.php      POST  — scrape openjdk.org, return JEP list
  ├── www/api/presentation.php   GET / POST / PATCH — presentation metadata CRUD
  └── www/api/slides.php      GET / POST / PATCH / DELETE — slide CRUD + reorder
          │
          └── include/db.php  — PDO connection + schema auto-init
          └── include/JdkScraper.php  — scraping logic (class)
          └── include/SlideRepository.php — slide CRUD (class)
                  │
                  └── SQLite: {project_root}/var/presentation.db
```

### Request Flow

```
[User enters JDK version]
        │
        ▼
editor.js → POST /api/scrape.php
        │
        ▼ (success: JEP list returned)
[Confirmation modal shown]
        │
        ▼ (user confirms)
editor.js → POST /api/presentation.php  (replaces all data)
        │
        ▼
[Editor reloads — sidebar populated from GET /api/slides.php]
        │
        ▼ (user edits a field, then blurs)
editor.js → PATCH /api/slides.php  or  PATCH /api/presentation.php
        │
        ▼ (user clicks "Present")
[Navigate to view.php]
        │
        ▼
view.js → GET /api/presentation.php  +  GET /api/slides.php (parallel)
        │
        ▼
[Reveal.js initialized with dynamically built slide sections]
```

### Key Architectural Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Page model | Separate editor.php and view.php | Simpler state management; Reveal.js initialises cleanly on full page load |
| Auto-save | On field blur | No explicit Save button needed; immediate persistence without accidental over-saving |
| API style | Separate files per concern (`/api/*.php`) | Each file handles one entity; easy to locate and modify |
| DB initialisation | Auto-init on first request via `include/db.php` | No separate setup script; idempotent `CREATE TABLE IF NOT EXISTS` |
| HTML parsing (PHP scraper) | `DOMDocument` + `DOMXPath` | Built-in to PHP; no external packages needed |

---

## 3. System Components

### 3.1 `include/` — Shared PHP Library

The `include/` directory lives at the project root, **outside the `www/` web root**, so its files cannot be accessed directly via HTTP. All files in `www/api/` reference these via `require_once __DIR__ . '/../../include/<file>.php'`.

#### `include/db.php` — Database Bootstrap

**Purpose:** Provides a shared PDO connection and ensures the schema exists.

**Responsibilities:**
- Define `DB_PATH` constant: `__DIR__ . '/../var/presentation.db'` (resolves to `{project_root}/var/presentation.db`)
- Open a PDO connection with `PDO::ERRMODE_EXCEPTION`
- Execute `CREATE TABLE IF NOT EXISTS` for all tables on every request (cheap no-op after first run)
- Return the `$pdo` instance for use by API files

**Implementation notes:**
- All API files `require_once __DIR__ . '/../../include/db.php'`
- No migration logic needed — schema is created fresh on first run
- The `var/` directory must exist and be writable by the Apache user before first request (see §7)

---

#### `include/JdkScraper.php` — Scraping Logic

**Purpose:** Encapsulates all HTTP fetching and HTML parsing. Keeps `api/scrape.php` as a thin controller.

**Class:** `JdkScraper`

**Public methods:**

```php
public function scrape(string $version): array
// Returns: ['jdk_version', 'release_date', 'jeps' => [['number', 'title'], ...]]
// Throws: RuntimeException with human-readable message on failure
```

**Responsibilities:**
- Build target URL: `https://openjdk.org/projects/jdk/{version}/`
- Fetch via cURL (15s timeout, follow up to 3 redirects, verify SSL)
- Load response into `DOMDocument` with `libxml_use_internal_errors(true)`
- Use `DOMXPath` to extract JEP links and release date
- Deduplicate JEPs by number
- Throw `RuntimeException` if cURL fails, HTTP status ≠ 200, or zero JEPs parsed

---

#### `include/SlideRepository.php` — Slide Data Access

**Purpose:** All database read/write operations for slides. Keeps `api/slides.php` as a thin controller.

**Class:** `SlideRepository`

**Constructor:** `__construct(PDO $pdo)`

**Public methods:**

```php
public function getAll(int $presentationId): array
public function create(int $presentationId, int $parentJepId): array  // returns new slide row
public function update(int $id, array $fields): void   // only allowed fields patched
public function delete(int $id): void                  // throws if type = 'title'
public function reorder(int $id, string $direction): void  // 'up' | 'down'
```

**Implementation notes:**
- All position management (insert gap, delete re-sequence, swap) lives here
- All queries use PDO prepared statements
- `reorder()` and multi-step insert operations use SQLite transactions

---

### 3.2 `api/scrape.php` — Scrape Endpoint (thin controller)

**Purpose:** Validates the request, delegates to `JdkScraper`, and returns JSON. Does **not** write to the database.

**Responsibilities:**
- Accept `POST` only; reject other methods with HTTP 405
- Decode JSON body; validate `version` field (non-empty, numeric, range 8–99); return HTTP 400 on failure
- Instantiate `JdkScraper`, call `scrape($version)` inside a try/catch
- On `RuntimeException`: return HTTP 422 with `{ "success": false, "error": "..." }`
- On success: return HTTP 200 with the structured scrape result (see §5.1)

**Scraping strategy (implemented in `JdkScraper`, informed by the existing Python scraper):**

```
1. Fetch https://openjdk.org/projects/jdk/{version}/  (cURL, 15s timeout)
2. Load response into DOMDocument::loadHTML() with libxml_use_internal_errors(true)
3. XPath query: //a[contains(@href, '/jeps/')]
4. For each match:
   a. Extract JEP number via regex on href: /jeps/(\d+)
   b. Extract title from link text; strip leading "JEP NNN: " or "JEP NNN — " prefix if present
   c. Deduplicate by JEP number
5. XPath for release date:
   a. //table[contains(@class,'milestones')]//tr[contains(.,'General Availability')]
   b. Extract first <td> text (YYYY/MM/DD format)
   c. Convert to human-readable: "Month YYYY" (e.g., "September 2025")
   d. If date not found, return empty string (editable by user in editor)
6. If count(jeps) == 0, throw RuntimeException("No JEPs found...")
```

---

### 3.3 `api/presentation.php` — Presentation Metadata

**Purpose:** CRUD for the single `presentation` row.

**Responsibilities:**
- `GET`: Return current presentation metadata (404 JSON if none exists)
- `POST`: Replace the entire presentation — delete all existing slides, insert new `presentation` row, insert one `title` slide + one `jep` slide per JEP in order
- `PATCH`: Update one or more metadata fields (`title`, `subtitle`, `release_date`) — used by auto-save on blur in the editor's title slide edit pane

**Implementation notes:**
- `POST` wraps the delete + insert sequence in a SQLite transaction
- The `title` slide inserted during `POST` has `position = 1`; JEP slides follow at positions 2, 3, 4…
- The `presentation` table always has at most one row (id=1); `POST` deletes all rows first, then re-inserts with id=1

---

### 3.4 `api/slides.php` — Slide Endpoint (thin controller)

**Purpose:** Validates requests and delegates all data operations to `SlideRepository`.

**Responsibilities:**

| Method | Action | Description |
|---|---|---|
| `GET` | List slides | Return all slides for current presentation, ordered by `position` ASC |
| `POST` | Create example slide | Insert a new `example`-type slide after the last existing example for the given `parent_jep_id` (or immediately after the parent JEP slide if no examples yet). Re-sequence positions of subsequent slides |
| `PATCH` | Update slide fields | Update `jep_number`, `jep_title`, `slide_title`, or `code_content` for a given slide `id` |
| `DELETE` | Delete slide | Delete slide by `id`; re-sequence positions of subsequent slides. Reject attempts to delete the `title`-type slide (HTTP 403) |
| `POST ?action=reorder` | Move slide up/down | Swap the `position` of the target slide with the adjacent slide. Reject attempts to move the `title`-type slide (it must remain at position 1) |

**Position management:**
- Positions are contiguous integers starting at 1
- On insert: `UPDATE slides SET position = position + 1 WHERE position >= insertion_point` then `INSERT`
- On delete: `UPDATE slides SET position = position - 1 WHERE position > deleted_position`
- On reorder: swap `position` values of the two slides being swapped (single transaction)

---

### 3.5 `editor.php` — Editor Page

**Purpose:** HTML shell for the editor UI. Serves the two-pane layout; all dynamic behaviour is in `js/editor.js`.

**Responsibilities:**
- Serve the editor HTML structure (sidebar + edit pane + scrape form area)
- Link all CSS and JS files
- Load Google Fonts

**States handled by `editor.js` (not PHP):**
- No presentation exists → show "Generate Presentation" form prominently, hide editor panes
- Presentation exists → show sidebar + edit pane, show "Generate New" option in header

---

### 3.6 `js/editor.js` — Editor Logic

**Purpose:** All editor interactivity. No page reloads — the UI is updated by DOM manipulation after API calls.

**Responsibilities:**

**Initialisation:**
- On DOMContentLoaded: `GET /api/presentation.php`
  - If 404 → show empty-state scrape form
  - If 200 → load presentation + fetch slides (`GET /api/slides.php`), render sidebar, select first slide

**Scrape flow:**
- User enters version, clicks "Generate"
- Show loading indicator on button
- `POST /api/scrape.php` with `{ "version": "25" }`
- On error: display inline error message, hide loading
- On success: show confirmation modal — "Found {N} JEPs for JDK {version}. This will replace your current presentation. Continue?"
- User cancels → close modal, no-op
- User confirms → `POST /api/presentation.php` with scraped data → reload editor state (re-fetch presentation + slides, re-render sidebar)

**Sidebar rendering:**
- Each slide listed as a `<li>` with:
  - Display text (see §3.7 — Sidebar Labels)
  - Up / Down buttons (▲▼) — disabled when at boundary; Up always disabled for title slide
  - Delete button (✕) — hidden for title slide
- "Add Example" button on each JEP slide entry
- Clicking a slide `<li>` opens it in the edit pane (highlights active item)

**Edit pane:**
- Renders the appropriate form for the selected slide type (see §3.8)
- Each `<input>` / `<textarea>` fires a `blur` event → API call to persist

**Reorder:**
- Up/Down button click → `POST /api/slides.php?action=reorder` with `{ "id": N, "direction": "up"|"down" }`
- On success: re-fetch slides, re-render sidebar, keep the same slide selected

**Add example slide:**
- Click "Add Example" on a JEP `<li>` → `POST /api/slides.php` with `{ "parent_jep_id": N }`
- On success: re-fetch slides, re-render sidebar, select the new slide

**Delete slide:**
- Click ✕ → `DELETE /api/slides.php` with `{ "id": N }`
- On success: re-fetch slides, re-render sidebar, clear edit pane

---

### 3.7 Sidebar Slide Labels

| Slide type | Display text |
|---|---|
| `title` | The value of `presentation.title` (e.g., "JDK 25") |
| `jep` | `"JEP {jep_number} — {jep_title}"` |
| `example` | `slide_title` if non-empty; otherwise first 50 characters of `code_content` + "…"; otherwise "(New Example)" |

---

### 3.8 Edit Pane Forms by Slide Type

#### Title Slide Edit Pane
Three independently auto-saving fields (blur → `PATCH /api/presentation.php`):

| Field | Label | Maps to |
|---|---|---|
| Text input | "Presentation Title" | `presentation.title` |
| Text input | "Release Date" | `presentation.release_date` |
| Text input | "Custom Subtitle / Tagline" | `presentation.subtitle` |

Visual hint: show the field hierarchy order as it appears on the slide.

#### JEP Slide Edit Pane
Two auto-saving fields (blur → `PATCH /api/slides.php`):

| Field | Label | Maps to |
|---|---|---|
| Text input | "JEP Number" | `slides.jep_number` |
| Text input | "JEP Title" | `slides.jep_title` |

#### Code Example Slide Edit Pane
Two auto-saving fields (blur → `PATCH /api/slides.php`):

| Field | Label | Maps to |
|---|---|---|
| Text input | "Slide Title" | `slides.slide_title` |
| `<textarea>` | "Code" | `slides.code_content` |

The `<textarea>` should be tall (min 300px), use `font-family: 'Fira Code', monospace`, `white-space: pre`, and `tab-size: 4`.

---

### 3.9 `view.php` — View Mode Page

**Purpose:** Full-page Reveal.js slideshow shell.

**Responsibilities:**
- Load Reveal.js CSS + JS from CDN
- Load Google Fonts
- Load `js/view.js`
- Override Reveal.js default background to match the orange theme

**Exiting view mode:** No visible exit button. The user presses `Escape` to return to `editor.php`. This is implemented by overriding Reveal.js's default `Escape` binding (which normally triggers overview mode) via the `keyboard` config option:

```javascript
Reveal.initialize({
  // ...
  keyboard: {
    27: () => { window.location.href = 'editor.php'; }  // Escape → exit to editor
  },
});
```

**No server-side slide rendering** — all slides are built in JS after page load.

---

### 3.10 `js/view.js` — View Mode Logic

**Purpose:** Fetches slide data and dynamically builds the Reveal.js presentation.

**Responsibilities:**
- On DOMContentLoaded: fire two parallel `fetch` calls:
  - `GET /api/presentation.php` → presentation metadata
  - `GET /api/slides.php` → ordered slide list
- Wait for both, then build slide HTML:
  - For each slide in order, append a `<section>` to `.slides` in the Reveal container
  - Use slide type to determine template (see §3.11)
- Initialise Reveal.js with config (see §3.12)

---

### 3.11 Slide HTML Templates (View Mode)

All slides share the orange `#FF5722` background and white text. Applied via CSS on `section` elements.

#### Presentation Title Slide
```html
<section class="slide-title">
  <div class="slide-content">
    <h1 class="main-title">{presentation.title}</h1>
    <p class="release-date">{presentation.release_date}</p>
    <p class="custom-subtitle">{presentation.subtitle}</p>
  </div>
</section>
```

#### JEP Title Slide
```html
<section class="slide-jep">
  <div class="slide-content">
    <div class="jep-label">JEP {slide.jep_number}</div>
    <p class="jep-title">{slide.jep_title}</p>
  </div>
</section>
```

#### Code Example Slide
```html
<section class="slide-example">
  <div class="slide-content">
    <h2 class="example-title">{slide.slide_title}</h2>
    <pre><code class="example-code">{slide.code_content}</code></pre>
  </div>
</section>
```

All text content must be HTML-escaped (`htmlspecialchars` server-side in API responses; in JS use `textContent` assignment or equivalent escaping before injecting into the DOM).

---

### 3.12 Reveal.js Configuration

```javascript
Reveal.initialize({
  hash: false,
  controls: false,
  progress: false,
  slideNumber: 'c/t',   // "3 / 12" — satisfies F-26 (could-have)
  center: false,        // content starts from top; vertical position controlled via CSS padding-top
  transition: 'slide',
  backgroundTransition: 'none',
  keyboard: {
    27: () => { window.location.href = 'editor.php'; }  // Escape → exit to editor (overrides default overview mode)
  },
});
```

The `slideNumber: 'c/t'` provides the slide counter at negligible extra cost, so it is included despite being could-have.

---

### 3.13 `index.php` — Root Redirect

Simple redirect to `editor.php`:
```php
<?php header('Location: editor.php'); exit;
```

---

## 4. Data Architecture

### 4.1 SQLite Schema

```sql
-- Presentation metadata (single row; id always = 1)
CREATE TABLE IF NOT EXISTS presentation (
    id           INTEGER PRIMARY KEY,
    jdk_version  TEXT    NOT NULL DEFAULT '',
    title        TEXT    NOT NULL DEFAULT '',
    subtitle     TEXT    NOT NULL DEFAULT '',
    release_date TEXT    NOT NULL DEFAULT '',
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Slides (all types in one table)
CREATE TABLE IF NOT EXISTS slides (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    presentation_id INTEGER NOT NULL,
    type            TEXT    NOT NULL CHECK(type IN ('title', 'jep', 'example')),
    position        INTEGER NOT NULL,
    jep_number      TEXT,
    jep_title       TEXT,
    slide_title     TEXT,
    code_content    TEXT,
    parent_jep_id   INTEGER,
    FOREIGN KEY (presentation_id) REFERENCES presentation(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_slides_position
    ON slides(presentation_id, position);
```

### 4.2 Field Usage by Slide Type

| Field | `title` slide | `jep` slide | `example` slide |
|---|---|---|---|
| `type` | `'title'` | `'jep'` | `'example'` |
| `position` | Always 1 at creation | 2, 3, 4… | After parent JEP |
| `jep_number` | — | JEP number | Inherited from parent JEP (informational) |
| `jep_title` | — | JEP title | — |
| `slide_title` | — | — | Example slide title |
| `code_content` | — | — | Code snippet text |
| `parent_jep_id` | — | — | FK to parent JEP slide id |

### 4.3 Invariants

- Exactly one `presentation` row exists (or zero if no scrape has been run)
- Exactly one slide of type `title` per presentation
- `position` values are contiguous integers starting at 1 within a presentation
- The `title` slide is always at position 1 at creation time; up/down reorder is blocked for it

### 4.4 Data Volume

Expected: 1 presentation row, 25–55 slide rows. Well within SQLite limits.

---

## 5. API Specifications

All endpoints:
- Accept and return `application/json`
- Read request body via `json_decode(file_get_contents('php://input'), true)`
- Use prepared statements for all DB operations (PDO parameterised queries)
- Return `{ "error": "<message>" }` with appropriate HTTP status on failure

---

### 5.1 `POST /api/scrape.php`

Scrapes openjdk.org and returns JEP data. Does **not** write to the database.

**Request:**
```json
{ "version": "25" }
```

**Validation:**
- `version` must be present, numeric, between 8 and 99

**Success response (200):**
```json
{
  "success": true,
  "jdk_version": "25",
  "release_date": "September 2025",
  "jep_count": 24,
  "jeps": [
    { "number": "491", "title": "Synchronize Virtual Threads without Pinning" },
    { "number": "492", "title": "Flexible Constructor Bodies" }
  ]
}
```

**Error response (422):**
```json
{
  "success": false,
  "error": "No JEPs found for JDK 99. The version may not exist or the page structure may have changed."
}
```

**Error response (400):**
```json
{
  "success": false,
  "error": "Invalid version number."
}
```

---

### 5.2 `GET /api/presentation.php`

Returns the current presentation metadata.

**Success response (200):**
```json
{
  "id": 1,
  "jdk_version": "25",
  "title": "JDK 25",
  "subtitle": "The Future of Java",
  "release_date": "September 2025",
  "created_at": "2026-02-25 10:00:00"
}
```

**No presentation exists (404):**
```json
{ "error": "No presentation found." }
```

---

### 5.3 `POST /api/presentation.php`

Creates (or replaces) the entire presentation. Called after user confirms the scrape result.

**Request:**
```json
{
  "jdk_version": "25",
  "title": "JDK 25",
  "subtitle": "",
  "release_date": "September 2025",
  "jeps": [
    { "number": "491", "title": "Synchronize Virtual Threads without Pinning" },
    { "number": "492", "title": "Flexible Constructor Bodies" }
  ]
}
```

**Behaviour:**
1. Begin transaction
2. `DELETE FROM slides`
3. `DELETE FROM presentation`
4. `INSERT INTO presentation` with provided metadata (id=1)
5. `INSERT INTO slides` for the `title` slide (position=1)
6. `INSERT INTO slides` for each JEP (type=`jep`, position=2,3,4…)
7. Commit

**Success response (201):**
```json
{ "success": true, "presentation_id": 1, "slide_count": 25 }
```

---

### 5.4 `PATCH /api/presentation.php`

Updates one or more fields on the presentation (used by title slide auto-save).

**Request (only include fields to update):**
```json
{
  "title": "JDK 25",
  "subtitle": "The Future of Java",
  "release_date": "September 2025"
}
```

**Success response (200):**
```json
{ "success": true }
```

---

### 5.5 `GET /api/slides.php`

Returns all slides for the current presentation, ordered by `position` ascending.

**Success response (200):**
```json
{
  "slides": [
    {
      "id": 1,
      "type": "title",
      "position": 1,
      "jep_number": null,
      "jep_title": null,
      "slide_title": null,
      "code_content": null,
      "parent_jep_id": null
    },
    {
      "id": 2,
      "type": "jep",
      "position": 2,
      "jep_number": "491",
      "jep_title": "Synchronize Virtual Threads without Pinning",
      "slide_title": null,
      "code_content": null,
      "parent_jep_id": null
    },
    {
      "id": 7,
      "type": "example",
      "position": 3,
      "jep_number": "491",
      "jep_title": null,
      "slide_title": "Example: Virtual Thread Pinning",
      "code_content": "Thread.ofVirtual().start(() -> {\n    // ...\n});",
      "parent_jep_id": 2
    }
  ]
}
```

---

### 5.6 `POST /api/slides.php`

Creates a new `example` slide.

**Request:**
```json
{ "parent_jep_id": 2 }
```

**Insertion position logic:**
```sql
SELECT MAX(position) FROM slides
WHERE parent_jep_id = :parent_jep_id
```
If result is NULL (no existing examples for this JEP), insert after the parent JEP slide:
```sql
SELECT position FROM slides WHERE id = :parent_jep_id
```
`insertion_position = parent_position + 1`

Then: `UPDATE slides SET position = position + 1 WHERE position >= :insertion_position`

**Success response (201):**
```json
{
  "success": true,
  "slide": {
    "id": 8,
    "type": "example",
    "position": 3,
    "jep_number": "491",
    "jep_title": null,
    "slide_title": null,
    "code_content": null,
    "parent_jep_id": 2
  }
}
```

**Note:** `jep_number` on the new example slide is copied from the parent JEP slide at creation time (informational).

---

### 5.7 `PATCH /api/slides.php`

Updates editable fields on a slide. Only fields present in the request body are updated.

**Request:**
```json
{
  "id": 7,
  "slide_title": "Example: Virtual Thread Pinning",
  "code_content": "Thread.ofVirtual().start(() -> {\n    // ...\n});"
}
```

Allowed fields: `jep_number`, `jep_title`, `slide_title`, `code_content`

**Success response (200):**
```json
{ "success": true }
```

---

### 5.8 `DELETE /api/slides.php`

Deletes a slide by id. Rejects deletion of the `title`-type slide.

**Request:**
```json
{ "id": 7 }
```

**Success response (200):**
```json
{ "success": true }
```

**Rejection (403):**
```json
{ "error": "The presentation title slide cannot be deleted." }
```

After deletion: `UPDATE slides SET position = position - 1 WHERE position > :deleted_position`

---

### 5.9 `POST /api/slides.php?action=reorder`

Moves a slide up or down by swapping positions with its neighbour.

**Request:**
```json
{ "id": 7, "direction": "up" }
```

**Logic:**
- `"up"`: find slide with `position = target.position - 1`; swap positions in a transaction
- `"down"`: find slide with `position = target.position + 1`; swap positions in a transaction
- Reject if target slide is type `title` (HTTP 403)
- Reject if no neighbour exists in the given direction (HTTP 400)

**Success response (200):**
```json
{ "success": true }
```

---

## 6. Security Architecture

### Input Sanitisation
- All DB writes use PDO prepared statements with bound parameters — no SQL injection possible
- All user-supplied content returned in API responses is stored as raw text; the browser-side JavaScript must use `textContent` (not `innerHTML`) when inserting slide content into the DOM, preventing XSS
- In view mode, slide content inserted into `<pre><code>` must use `textContent` assignment or explicit HTML escaping (`&`, `<`, `>`, `"`)
- The version field in `scrape.php` is validated as numeric before being interpolated into the URL

### File System
- The SQLite database file lives at `{project_root}/var/presentation.db` — **outside the `www/` web root** — preventing direct HTTP download
- The `lib/` directory may be inside the document root but contains only PHP; Apache will execute it, not serve it as plain text. Optionally, deny direct access via `.htaccess`

### Network
- No authentication required (single-user, local machine)
- cURL requests to openjdk.org use a 15-second timeout to prevent hanging
- `CURLOPT_FOLLOWLOCATION` enabled (site may redirect); limit redirects to 3

---

## 7. Infrastructure and Deployment

### Project Directory Structure

The project is a self-contained directory that can live anywhere on disk (e.g. `/home/user/projects/jep-presenter` or cloned from git). The Apache vhost points its `DocumentRoot` at the `www/` subdirectory only — the rest of the project is never exposed to HTTP.

```
{project_root}/                        ← Git repository root
│
├── www/                               ← Apache DocumentRoot (web root only)
│   ├── index.php                      ← Redirect to editor.php
│   ├── editor.php                     ← Editor page HTML shell
│   ├── view.php                       ← View mode (Reveal.js) shell
│   │
│   ├── api/
│   │   ├── scrape.php                 ← POST: scrape endpoint (thin controller)
│   │   ├── presentation.php           ← GET / POST / PATCH: presentation CRUD
│   │   └── slides.php                 ← GET / POST / PATCH / DELETE + reorder
│   │
│   ├── css/
│   │   └── app.css                    ← Shared styles (editor + view mode)
│   │
│   └── js/
│       ├── editor.js                  ← Editor UI logic
│       ├── view.js                    ← Reveal.js init + slide rendering
│       └── vendor/
│           ├── reveal.js              ← Vendored Reveal.js (downloaded, see §8.2)
│           └── reveal.min.css         ← Vendored Reveal.js stylesheet
│
├── include/                           ← PHP library — NOT in web root
│   ├── db.php                         ← PDO connection + schema auto-init
│   ├── JdkScraper.php                 ← Scraping class
│   └── SlideRepository.php            ← Slide CRUD class
│
└── var/                               ← Runtime data — NOT in web root
    └── presentation.db                ← SQLite database (auto-created on first request)
```

**`include/` path resolution** — all `www/api/*.php` files reference includes via:
```php
require_once __DIR__ . '/../../include/db.php';
```

**`var/` path resolution** — `include/db.php` resolves the DB path via:
```php
define('DB_PATH', __DIR__ . '/../var/presentation.db');
```

Both paths are relative to `__FILE__` using `__DIR__`, making the project portable regardless of where it is cloned.

---

### Apache Virtual Host

**File:** `/etc/apache2/sites-available/jep-presenter.conf`

```apache
<VirtualHost *:80>
    ServerName jep.local
    DocumentRoot /path/to/jep-presenter/www

    <Directory /path/to/jep-presenter/www>
        AllowOverride All
        Require all granted
    </Directory>

    ErrorLog  ${APACHE_LOG_DIR}/jep-presenter-error.log
    CustomLog ${APACHE_LOG_DIR}/jep-presenter-access.log combined
</VirtualHost>
```

Replace `/path/to/jep-presenter` with the actual project root path.

**Enable and activate:**
```bash
sudo a2ensite jep-presenter.conf
sudo systemctl reload apache2
```

**`/etc/hosts` entry:**
```
127.0.0.1  jep.local
```

---

### `var/` Directory Setup

The `var/` directory must exist and be writable by the Apache process before the first request. The SQLite file itself is created automatically by `include/db.php`.

```bash
mkdir -p /path/to/jep-presenter/var
sudo chown www-data:www-data /path/to/jep-presenter/var
sudo chmod 750 /path/to/jep-presenter/var
```

> **Git:** Add `var/presentation.db` to `.gitignore`. The `var/` directory itself may be committed with a `.gitkeep` placeholder.

---

### PHP Requirements

| Requirement | Notes |
|---|---|
| PHP 8.4 | Already installed |
| PDO extension | Must be enabled |
| PDO SQLite driver | `php8.4-sqlite3` package |
| cURL extension | `php8.4-curl` package |
| `allow_url_fopen` | Not required (cURL used for scraping) |

Verify: `php -m | grep -E 'pdo|sqlite|curl'`

---

## 8. External Dependencies

### 8.1 Google Fonts (CDN)

Combined single request (place in `<head>` of all pages):

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Roboto:wght@400;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
```

Google Fonts is CDN-only. If unavailable, the browser falls back gracefully to system serif / sans-serif / monospace — the presentation remains functional.

---

### 8.2 Reveal.js — Vendored (primary) + CDN (fallback)

**Pinned version: 4.6.1**

Reveal.js is **vendored as local files** inside the project so the tool works fully offline (e.g. when presenting without internet access). The CDN is used only as a documented fallback if the vendor files are missing.

#### Downloading the vendor files

Run these commands once from the project root after cloning:

```bash
mkdir -p www/js/vendor www/css/vendor

# JavaScript
curl -L -o www/js/vendor/reveal.js \
  https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.6.1/reveal.js

# Stylesheet
curl -L -o www/css/vendor/reveal.min.css \
  https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.6.1/reveal.min.css
```

> **Git:** The vendor files may be committed to the repository so new clones work immediately without a download step. If kept out of git, add a `setup.sh` script that runs the above commands and document it in the project README.

#### Usage in `view.php`

```html
<!-- In view.php <head> — vendor file (works offline) -->
<link rel="stylesheet" href="/css/vendor/reveal.min.css">

<!-- In view.php before </body> — vendor file (works offline) -->
<script src="/js/vendor/reveal.js"></script>

<!--
  CDN fallback (uncomment and swap above if vendor files are removed):
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.6.1/reveal.min.css">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/reveal.js/4.6.1/reveal.js"></script>
-->
```

**Total external CDN dependencies at runtime: 1** (Google Fonts) — Reveal.js served locally. Well within the ≤2 library constraint.

---

## 9. Visual Design

### Theme

All slides and editor chrome use the existing orange/white theme from `template_config.py`:

| Element | Value |
|---|---|
| Background | `#FF5722` |
| Text | `#FFFFFF` |
| Title font | `Alfa Slab One`, serif |
| Body / subtitle font | `Roboto`, sans-serif |
| Code font | `Fira Code`, monospace |

### Typography Scale

| Element | Font | Weight | Size | Line-height |
|---|---|---|---|---|
| Presentation title ("JDK 25") | Alfa Slab One | — | `4rem` | `1.2` |
| Release date ("September 2025") | Roboto | 700 (bold) | `1.5rem` | `1.5` |
| Custom subtitle / tagline | Roboto | 400 (regular) | `1.5rem` | `1.5` |
| JEP label ("JEP 491") | Alfa Slab One | — | `3rem` | `1.2` |
| JEP title text | Roboto | 400 (regular) | `1.6rem` | `1.5` |
| Code example slide title | Alfa Slab One | — | `1.8rem` | `1.2` |
| Code block text | Fira Code | 400 (regular) | `1rem` | `1.4` |
| Edit pane labels | Roboto | 700 | `0.85rem` | `1.5` |
| Edit pane input text | Roboto | 400 | `0.95rem` | `1.5` |
| Sidebar labels | Roboto | 400 | `0.9rem` | `1.5` |

### Slide Layout Hierarchy

**Positioning:** All slide content is left-aligned. The `.slide-content` div uses `padding-top: 20%` to position the content block in the upper portion of the slide (Reveal.js `center: false` — no vertical centering by Reveal.js). Horizontal padding: `padding-left: 8%`, `padding-right: 8%`.

**Intra-slide spacing:** The gap between the primary title element and the text below it (e.g. "JDK 25" → "September 2025", "JEP 491" → JEP title text) is `margin-bottom: 0.5rem` on the title element. This applies consistently across all slide types.

**Presentation Title Slide:**
```
[                                         ]
[  20% top padding                        ]
[    JDK 25              ← Alfa Slab One, 4rem                 ]
[    September 2025      ← Roboto 700 (bold), 1.5rem           ]
[    The Future of Java  ← Roboto 400 (regular), 1.5rem        ]
[                                         ]
[                                         ]
```

**JEP Title Slide:**
```
[                                         ]
[  20% top padding                        ]
[    JEP 491             ← Alfa Slab One, 3rem                 ]
[    Synchronize Virtual...               ]
[    ← Roboto 400, 1.6rem                 ]
[                                         ]
[                                         ]
```

**Code Example Slide:**
```
[  (minimal top padding — title sits near top to maximise code space)  ]
[    Example: Virtual Thread Pinning ← Alfa Slab One, 1.8rem   ]
[    ┌─────────────────────────────┐                           ]
[    │ Thread.ofVirtual()...       │  ← Fira Code, 1rem        ]
[    │ ...                         │                           ]
[    └─────────────────────────────┘                           ]
```

> **Code Example Slide exception:** uses `padding-top: 5%` instead of 20% to maximise vertical space for the code block.

Code block: dark semi-transparent background (`rgba(0,0,0,0.35)`), padding `1.5rem`, `border-radius: 8px`, left-aligned text.

### Button Styles

#### Sidebar Micro-controls (▲ ▼ ✕)
Appear on each sidebar item against the dark orange `#E64A19` background.

| Property | Value |
|---|---|
| Background | transparent (no background at rest) |
| Text / icon color | `#FFFFFF` |
| Size | `28px × 28px` |
| Border | none |
| Border-radius | `4px` |
| Cursor | `pointer` |
| Hover background | `rgba(255,255,255,0.2)` |
| Disabled opacity | `0.3` (used for ▲ on position-1 slide, ▼ on last slide) |
| Transition | `background 0.15s ease` |

The ✕ delete button is **hidden** (not just disabled) on the title slide — `display: none`.

#### "Add Example" Link (on JEP sidebar items)
| Property | Value |
|---|---|
| Appearance | Plain text, white `#FFFFFF` |
| Font | Roboto 400, `0.8rem` |
| Text | `+ Add Example` |
| Default | no underline |
| Hover | `text-decoration: underline` |
| Cursor | `pointer` |

#### Primary Action Buttons ("Generate", "Present")
Appear in the header (orange `#FF5722` background).

| Property | Value |
|---|---|
| Background | `#212121` |
| Text color | `#FFFFFF` |
| Font | Roboto 700 |
| Font size | `0.95rem` |
| Padding | `10px 20px` |
| Border | none |
| Border-radius | `6px` |
| Cursor | `pointer` |
| Hover background | `#424242` |
| Transition | `background 0.15s ease` |

#### Confirmation Modal

**Overlay:**
| Property | Value |
|---|---|
| Background | `rgba(0,0,0,0.5)` |
| Position | `fixed`, covers full viewport |

**Modal card:**
| Property | Value |
|---|---|
| Background | `#FAFAFA` |
| Width | `480px` fixed |
| Border-radius | `6px` |
| Padding | `2rem` |
| Box-shadow | `0 8px 32px rgba(0,0,0,0.2)` |
| Position | Centered horizontally and vertically in viewport |

**Modal content:**
| Element | Spec |
|---|---|
| Title (e.g. "Replace presentation?") | Roboto 700, `1.1rem`, `#212121` |
| Body text (JEP count + warning) | Roboto 400, `0.95rem`, `#424242` |
| Button row | Right-aligned, `gap: 12px`, `margin-top: 1.5rem` |
| Button order | `[ Cancel ]` left, `[ Continue ]` right |

**Cancel button:**
| Property | Value |
|---|---|
| Background | `#E0E0E0` |
| Text color | `#212121` |
| Font | Roboto 700, `0.95rem` |
| Padding | `10px 20px` |
| Border-radius | `6px` |
| Hover background | `#BDBDBD` |
| Transition | `background 0.15s ease` |

**Continue (confirm) button:**
| Property | Value |
|---|---|
| Background | `#212121` |
| Text color | `#FFFFFF` |
| Font | Roboto 700, `0.95rem` |
| Padding | `10px 20px` |
| Border-radius | `6px` |
| Hover background | `#424242` |
| Transition | `background 0.15s ease` |

### Editor Chrome

The editor uses the orange theme for the sidebar and header, with white/light-grey edit pane background to visually distinguish editing from presenting:

| Area | Background |
|---|---|
| Page header | `#FF5722` |
| Sidebar | `#E64A19` (slightly darker orange) |
| Active sidebar item | `rgba(255,255,255,0.2)` |
| Hover sidebar item | `rgba(255,255,255,0.1)` |
| Edit pane | `#FAFAFA` (near-white) |
| Edit pane text | `#212121` (near-black) |

#### Editor Header

| Property | Value |
|---|---|
| Background | `#FF5722` |
| Height | `52px` |
| Layout | `display: flex; align-items: center; justify-content: space-between; padding: 0 1.5rem` |

**Left side — app + context label:**
| Property | Value |
|---|---|
| Text | `"JEP Presenter — JDK {version}"` (version filled dynamically from JS; omitted if no presentation exists) |
| Font | Roboto 700 |
| Font size | `1rem` |
| Color | `#FFFFFF` |

**Right side — action buttons (shown only when a presentation exists):**
Buttons displayed in this order, left to right: `[ Generate New ]` then `[ Present ]`

| | `Generate New` | `Present` |
|---|---|---|
| Background | `#212121` | `#212121` |
| Text color | `#FFFFFF` | `#FFFFFF` |
| Font | Roboto 700 | Roboto 700 |
| Font size | `0.85rem` | `0.95rem` |
| Padding | `6px 14px` | `10px 20px` |
| Border-radius | `6px` | `6px` |
| Hover background | `#424242` | `#424242` |
| Gap between buttons | `8px` | — |

**Empty state (no presentation exists):** Header shows app name only on the left; no buttons on the right. The scrape form is displayed prominently in the main content area.

#### Empty State (No Presentation)

Displayed in the main content area when no presentation exists. The sidebar is hidden; the scrape form occupies the full content area.

| Property | Value |
|---|---|
| Layout | Top of main content area, left-aligned — same padding as the edit pane (`1.5rem`) |
| Background | `#FAFAFA` — no card, no shadow |
| Heading | `"Generate a Presentation"` — Roboto 700, `1.2rem`, `#212121`, `margin-bottom: 1.5rem` |
| Form content | Version number `<label>` + `<input>` + error message slot + `[ Generate ]` button |
| Input width | `200px` fixed (version numbers are short) |
| Button | Follows primary action button spec — `#212121`, Roboto 700, `0.95rem`, `padding: 10px 20px`, `border-radius: 6px` |
| Button placement | Below the input, `margin-top: 1rem` |

#### Generate Button Loading State

While `POST /api/scrape.php` is in flight:

| Element | State |
|---|---|
| Button text | `"Generating…"` with a CSS spinner prepended |
| Button | `disabled`, background stays `#212121` |
| Version input | `disabled` |
| Error message | Hidden (cleared from any previous error) |

**CSS spinner** — a small rotating ring before the button text:
```css
.spinner {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255,255,255,0.3);
  border-top-color: #FFFFFF;
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
  margin-right: 6px;
  vertical-align: middle;
}
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

On completion (success or error): button re-enables, spinner removed, text reverts to `"Generate"`, version input re-enables.

#### Inline Error Messages

Displayed below the version input field (above the Generate button) when scraping fails.

| Property | Value |
|---|---|
| Background | `#FFEBEE` |
| Border | `1px solid #FFCDD2` |
| Color | `#C62828` |
| Border-radius | `6px` |
| Padding | `8px 12px` |
| Font | Roboto 400, `0.85rem` |
| Margin-top | `8px` |
| Display | `none` by default; `block` when an error exists |

#### Edit Pane Form Fields

Applies to all `<input type="text">` and `<textarea>` elements in the edit pane.

| Property | Value |
|---|---|
| Background | `#FFFFFF` |
| Border | `1px solid #E0E0E0` |
| Border-radius | `6px` |
| Padding | `10px 12px` |
| Font | Roboto 400 |
| Font size | `0.95rem` |
| Color | `#212121` |
| Width | `100%` (full width of edit pane content area) |
| Focus border | `1px solid #FF5722` |
| Focus outline | `none` (rely on border change only) |
| Transition | `border-color 0.15s ease` |

**Field labels** (the `<label>` above each input):
| Property | Value |
|---|---|
| Font | Roboto 700 |
| Font size | `0.85rem` |
| Color | `#424242` |
| Margin-bottom | `4px` |
| Display | `block` |

**Field groups** (label + input pairs):
| Property | Value |
|---|---|
| Gap between field groups | `1.25rem` |
| Edit pane padding | `1.5rem` |

**`<textarea>` (Code field on example slides):**
Overrides the general field styles above with a dark editor appearance:
| Property | Value |
|---|---|
| Background | `#1E1E1E` |
| Color | `#D4D4D4` |
| Border | `1px solid #424242` |
| Focus border | `1px solid #FF5722` |
| Font family | `Fira Code`, monospace |
| Font size | `0.9rem` |
| Line-height | `1.4` |
| Min-height | `300px` |
| White-space | `pre` |
| Tab-size | `4` |
| Resize | `vertical` |

#### Sidebar Item Sizing

| Property | Value |
|---|---|
| Padding | `10px 12px` |
| Label font | Roboto 400 |
| Label font size | `0.9rem` |
| Label color | `#FFFFFF` |
| Border-bottom | `1px solid rgba(255,255,255,0.08)` (subtle divider between items) |
| Active background | `rgba(255,255,255,0.2)` |
| Hover background | `rgba(255,255,255,0.1)` |
| Transition | `background 0.15s ease` |

---

## 10. Testing Strategy

### Manual Acceptance Tests

| Test | Expected Outcome |
|---|---|
| Enter version "25", click Generate | Loading shown; success: confirmation modal with JEP count |
| Confirm in modal | Editor populates with title slide + JEP slides; sidebar reflects all slides |
| Enter invalid version "999", click Generate | Inline error message; no modal |
| Edit Presentation Title field, blur | Sidebar label for title slide updates; refresh retains value |
| Edit JEP number, blur | Sidebar label updates immediately |
| Click "Add Example" on JEP 491 | New example slide inserted after JEP 491 (or after existing examples); selected in edit pane |
| Edit example title + code, blur | Values persist after page refresh |
| Delete a JEP slide | Slide removed from sidebar; positions re-sequenced |
| Attempt to delete title slide | Delete button absent/disabled |
| Move slide Up from position 2 | Slide and above slide swap positions |
| Move slide Up from position 1 | Up button disabled; no action |
| Click "Present" | Navigates to view.php; slides render fullscreen |
| Arrow keys in view mode | Navigate between slides |
| Slide counter | "3 / 12" format visible |
| Exit button in view mode | Returns to editor.php |
| Refresh view.php | Slides still visible (fetched fresh from API) |
| Re-scrape (new version), confirm | Old presentation cleared; new slides loaded |
| Re-scrape, cancel | Old presentation unchanged |

### Browser Compatibility
Test in latest stable Chrome, Firefox, and Safari (desktop only).

### Security Spot-Checks
- Attempt to submit `version = "25; DROP TABLE slides"` → should be rejected by numeric validation
- Insert `<script>alert(1)</script>` as a JEP title → should appear as literal text in sidebar and view mode

---

## 11. Implementation Plan

### Phase 1 — Infrastructure & Data Layer

**Components:**
- Create project directory structure (`www/`, `include/`, `var/`, `www/api/`, `www/js/vendor/`, `www/css/vendor/`)
- Configure Apache virtual host pointing `DocumentRoot` at `www/`; add `jep.local` to `/etc/hosts`
- Set `var/` directory ownership to `www-data` (see §7)
- Download vendored Reveal.js files into `www/js/vendor/` and `www/css/vendor/` (see §8.2)
- Implement `include/db.php` (PDO connection + schema auto-init)
- Implement stub `include/JdkScraper.php` and `include/SlideRepository.php` classes
- Implement `GET /api/presentation.php` (return 404 if empty)
- Implement `GET /api/slides.php` (return empty array if no presentation)

**Acceptance criteria:**
- `http://jep.local/` resolves and redirects to `editor.php`
- `GET http://jep.local/api/presentation.php` returns `{"error":"No presentation found."}` with HTTP 404
- `GET http://jep.local/api/slides.php` returns `{"slides":[]}`
- `{project_root}/var/presentation.db` is created automatically on first API request

**Dependencies:** Apache installed, PHP 8.4 with PDO SQLite and cURL available

---

### Phase 2 — Scraping & Presentation Creation

**Components:**
- Implement `POST /api/scrape.php`
- Implement `POST /api/presentation.php` (create/replace)
- Implement `PATCH /api/presentation.php`
- `editor.php` HTML shell (static layout, no dynamic content yet)
- `js/editor.js`: scrape form, loading state, confirmation modal, call POST presentation endpoint, basic reload of sidebar

**Acceptance criteria:**
- `POST /api/scrape.php` with `{"version":"25"}` returns ≥1 JEP within 30 seconds
- `POST /api/scrape.php` with `{"version":"999"}` returns a `success: false` error response
- After confirming, `GET /api/slides.php` returns the title slide + all JEP slides
- Refreshing the editor shows the scraped data persisted

---

### Phase 3 — Editor: Sidebar & Edit Pane

**Components:**
- `js/editor.js`: full sidebar rendering (labels, up/down, delete, add-example buttons)
- `js/editor.js`: edit pane forms for all three slide types
- `js/editor.js`: auto-save on blur (`PATCH /api/slides.php`, `PATCH /api/presentation.php`)
- `css/app.css`: editor layout (split pane, sidebar styling, active state, orange theme)

**Acceptance criteria:**
- All slides listed in sidebar with correct labels
- Clicking a slide opens the correct edit form
- Editing and blurring a field persists the change (verified by refreshing the page)
- Title slide delete button is absent; other slides have it

---

### Phase 4 — Editor: CRUD & Reorder

**Components:**
- Implement `POST /api/slides.php` (create example)
- Implement `DELETE /api/slides.php`
- Implement `POST /api/slides.php?action=reorder`
- `js/editor.js`: wire up add-example, delete, and up/down buttons

**Acceptance criteria:**
- "Add Example" inserts example slide after correct JEP (or after existing examples)
- Newly created example slide opens in edit pane immediately
- Delete removes slide; sidebar re-renders; positions re-sequenced
- Up/Down correctly swaps slide positions; sidebar reflects new order
- Up button on title slide is disabled; Up button on position-2 slide is enabled

---

### Phase 5 — View Mode

**Components:**
- `view.php` HTML shell with Reveal.js CDN links
- `js/view.js`: parallel fetch, slide HTML builder, Reveal.js init
- `css/app.css`: slide-specific styles for view mode (title, jep, example layouts)
- "Present" button/link in editor header → `view.php`
- "Exit" link in view.php → `editor.php`

**Acceptance criteria:**
- View mode opens and displays all slides with correct content
- Arrow keys navigate between slides
- Slide counter shows "N / Total"
- All three slide types render with correct visual hierarchy and fonts
- "Exit" returns to editor

---

## 12. Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OpenJDK page structure changes, breaking the scraper | Medium | High | PHP scraper wraps parsing in try/catch; returns structured error. Fallback: inspect page source and update XPath queries |
| Reveal.js CDN unavailable during presentation | N/A | N/A | **Resolved** — Reveal.js is vendored locally (§8.2); CDN not required at runtime |
| SQLite file permission issues on Apache | Medium | Medium | Follow §7 `var/` setup exactly; verify with `sudo -u www-data php -r "new PDO('sqlite:/path/to/project/var/test.db');"` |
| `DOMDocument` failing to parse malformed HTML from openjdk.org | Low | Medium | Use `libxml_use_internal_errors(true)` before `loadHTML()` to suppress warnings; validate JEP count post-parse |
| Fira Code or Alfa Slab One unavailable (Google Fonts outage) | Low | Low | Fonts degrade gracefully to system monospace / system serif — presentation remains functional |

---

## 13. Open Questions — Resolved

| # | Question | Resolution |
|---|---|---|
| OQ-7 | Reveal.js CDN URL and version | Reveal.js **4.6.1** pinned from `cdnjs.cloudflare.com`; vendored as local files for offline use (see §8.2) |
| OQ-8 | SQLite file location | `{project_root}/var/presentation.db` — inside project directory but outside `www/` web root (see §7) |
| Design | Separate pages or SPA? | Separate pages (`editor.php` and `view.php`) — simpler, cleaner Reveal.js initialisation |
| Design | Auto-save or Save button? | Auto-save on blur |
| Design | PHP API structure | Separate files per concern under `www/api/`; shared logic in `include/` |
| Design | Code block font | Fira Code via Google Fonts (counts as part of the single Google Fonts CDN call) |
| Design | Project layout | `www/` (web root), `include/` (PHP library), `var/` (runtime data) at project root |
| Design | Reveal.js delivery | Vendored locally in `www/js/vendor/` for offline use; CDN commented fallback in `view.php` |

---

## Appendix A — Requirement Traceability

| Req ID | Requirement | Specification Section |
|---|---|---|
| F-01 | JDK version scrape trigger | §3.2, §5.1, §3.6 |
| F-02 | Extract JEP number, title, release date | §3.2, §5.1 |
| F-03 | Confirm before replacing presentation | §3.6 (Scrape flow) |
| F-04 | Title slide + JEP slides generated | §5.3 |
| F-05 | Scrape failure message | §5.1, §3.6 |
| F-06/F-06a | Presentation Title slide fields | §3.8, §3.11 |
| F-07/F-08 | JEP Title slide fields, editable | §3.8, §3.11 |
| F-09/F-10 | Code Example slide, associated with JEP | §3.8, §5.6 |
| F-10a/F-10b | Example slides standalone after insertion | §3.4, §4.3 |
| F-11 | Syntax highlighting (could-have) | Not in scope for initial delivery |
| F-12/F-13 | Sidebar with slide list and labels | §3.6, §3.7 |
| F-14/F-15 | Click slide → edit pane | §3.6 |
| F-16 | Auto-save (blur) | §3.6, §5.4, §5.7 |
| F-17 | Add code example slide | §3.6, §5.6 |
| F-18 | Delete any slide except title | §5.8 |
| F-19/F-20 | Reorder via up/down | §3.4, §5.9 |
| F-21 | Link to view mode | §3.5 |
| F-22/F-23 | Fullscreen slideshow, arrow keys | §3.12 |
| F-24 | Exit view mode | §3.9 |
| F-25 | Slides render edited content | §3.10, §3.11 |
| F-26 | Slide counter (could-have) | §3.12 — included via `slideNumber: 'c/t'` |
| F-27 | Reveal.js via CDN | §8.2 |
