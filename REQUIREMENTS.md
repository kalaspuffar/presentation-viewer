# Requirements Document: JDK JEP Web Presentation Tool

**Version:** 1.1
**Date:** 2026-02-25
**Status:** Draft — Open Questions Resolved

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Business Context](#2-business-context)
3. [Goals and Objectives](#3-goals-and-objectives)
4. [Scope](#4-scope)
5. [Stakeholders](#5-stakeholders)
6. [User Personas / Actors](#6-user-personas--actors)
7. [Functional Requirements](#7-functional-requirements)
8. [Non-Functional Requirements](#8-non-functional-requirements)
9. [Data Requirements](#9-data-requirements)
10. [Integration Requirements](#10-integration-requirements)
11. [Constraints](#11-constraints)
12. [Assumptions](#12-assumptions)
13. [Dependencies](#13-dependencies)
14. [Risks](#14-risks)
15. [Success Criteria](#15-success-criteria)
16. [Open Questions](#16-open-questions)

---

## 1. Executive Summary

This project replaces an existing Python/PowerPoint pipeline with a **self-hosted, browser-based presentation tool** for discussing Java Enhancement Proposals (JEPs). The tool scrapes JEP data from the OpenJDK website, stores it locally, and provides a two-mode interface: an **editor** for building and refining the presentation, and a **view mode** for delivering it as a slideshow. The solution runs on an existing Apache server using PHP 8.4 and SQLite, with a plain JS/HTML/CSS frontend and minimal external dependencies.

---

## 2. Business Context

### Background
An existing Python pipeline scrapes JEP data from `https://openjdk.org/projects/jdk/<version>/` and generates `.pptx` files. While functional, PowerPoint presentations are inconvenient to display in a browser context and the workflow is inflexible — changes require regenerating the file and the format is not easily editable mid-presentation.

### Current Pain Points
- `.pptx` files do not display well natively in a browser
- No in-browser editing of slide content after generation
- Cannot insert example slides without regenerating the whole file
- No interactive view mode optimised for presenting in a browser

### Desired State
A fully browser-based tool that scrapes, stores, edits, and presents JEP information — all from a single web interface hosted on the local machine.

---

## 3. Goals and Objectives

### Business Goals
- Eliminate dependency on PowerPoint for JEP-based presentations
- Enable live, in-browser slide editing before and between presentations
- Support a smooth, keyboard-driven presentation delivery experience

### User Goals
- Quickly generate a structured presentation from a JDK version number
- Annotate JEP slides with custom code examples
- Edit scraped content to suit the presentation narrative
- Present slides fullscreen with simple navigation

### Success Criteria
- A JDK version number can be entered and a complete presentation skeleton is generated in under 30 seconds
- All slides are editable before entering view mode
- View mode supports fullscreen, arrow-key navigation
- The presentation persists between browser sessions

---

## 4. Scope

### In Scope
- PHP backend to scrape JEP data from `openjdk.org`
- SQLite storage for one active presentation at a time
- Presentation editor with:
  - Left sidebar listing all slides by title
  - Detail edit pane for the selected slide
  - Ability to add, delete, and reorder slides
- Slide types: **Presentation Title**, **JEP Title**, **Code Example**
- Fullscreen slide view mode with keyboard (arrow key) navigation
- Slide library loaded via CDN (Reveal.js or equivalent)
- Hosted on Apache with a dedicated virtual host

### Out of Scope
- User authentication or multi-user support
- Multiple concurrent presentations / presentation library
- Non-code content on example slides (images, rich text, diagrams)
- Export to PowerPoint or PDF
- Mobile / touch interface optimisation
- Real-time collaboration
- The existing Python pipeline (retained for reference only)

### Future Considerations
- Slide counter / progress indicator in view mode *(low priority)*
- Syntax highlighting on code example slides *(low priority)*
- Multiple saved presentations / presentation library
- PDF export

---

## 5. Stakeholders

| Stakeholder | Role | Interest |
|---|---|---|
| Primary User | Presenter / Developer | Build and deliver JEP presentations |
| Solutions Architect | Designer | Receives this document to design the solution |

---

## 6. User Personas / Actors

### The Presenter (sole user)
- A developer or technical advocate preparing talks about Java releases
- Comfortable with browsers and basic editing interfaces
- Runs the tool locally; no network access by others required
- Presents directly from the browser in fullscreen mode
- Single concurrent user — no concurrency concerns

---

## 7. Functional Requirements

### 7.1 Presentation Initialisation

| ID | Requirement | Priority |
|---|---|---|
| F-01 | The user can enter a JDK version number (e.g. `25`) and trigger a scrape of `https://openjdk.org/projects/jdk/<version>/` | Must-have |
| F-02 | The scrape extracts: JEP number, JEP title (what the JEP is about), and release date for the overall presentation | Must-have |
| F-03 | On successful scrape, the system **asks the user for confirmation** before emptying the current presentation and replacing it with the newly scraped data | Must-have |
| F-04 | The generated presentation contains: one **Presentation Title** slide, followed by one **JEP Title** slide per JEP in the order returned by the scraper | Must-have |
| F-05 | The user is informed if the scrape fails (e.g. version not found, network error) with a human-readable message | Must-have |

### 7.2 Slide Types

#### Presentation Title Slide
| ID | Requirement | Priority |
|---|---|---|
| F-06 | Contains three elements, visually consistent with the orange/white theme of the existing Python tool: | Must-have |
| | **1. Main title** — the JDK version displayed large (e.g. "JDK 25"), editable, pre-filled from scrape | |
| | **2. Release date** — scraped from OpenJDK, shown as a subtitle line, editable | |
| | **3. Custom subtitle** — a free-text tagline the user provides via the edit pane (e.g. "The Future of Java"), editable | |
| F-06a | The three fields are independently editable in the edit pane; their visual hierarchy on the slide is: large title → release date → custom subtitle | Must-have |

#### JEP Title Slide
| ID | Requirement | Priority |
|---|---|---|
| F-07 | Contains: "JEP" label and JEP number (e.g. "JEP 491"), and the JEP title as a subtitle | Must-have |
| F-08 | Both the JEP number and title are editable by the user | Must-have |

#### Code Example Slide
| ID | Requirement | Priority |
|---|---|---|
| F-09 | Contains: a slide title (editable) and a code block (editable, plain text) | Must-have |
| F-10 | Each code example slide is **associated with a specific JEP** at creation time and inserted directly after that JEP's title slide (or after other examples already associated with the same JEP) | Must-have |
| F-10a | Example slides are **standalone** — deleting a JEP slide does **not** automatically delete its associated example slides; they remain in the presentation at their current position | Must-have |
| F-10b | The `parent_jep_id` association on example slides is informational (used for insertion positioning) and is **not** a cascading hard constraint | Must-have |
| F-11 | Syntax highlighting on code blocks | Could-have (low priority) |

### 7.3 Editor Interface

| ID | Requirement | Priority |
|---|---|---|
| F-12 | The editor displays a **left sidebar** listing all slides in order | Must-have |
| F-13 | Each slide in the sidebar is represented by its title. For JEP slides: "JEP \<number\> — \<title\>". For example slides: a brief excerpt of the code snippet. For the title slide: the presentation title | Must-have |
| F-14 | Clicking a slide in the sidebar opens it in the **edit pane** on the right | Must-have |
| F-15 | The edit pane displays the editable fields for the selected slide type | Must-have |
| F-16 | Changes in the edit pane are saved (persisted to SQLite) — either on blur/change or via an explicit Save button | Must-have |
| F-17 | The user can **add a code example slide** associated with a JEP, inserted after that JEP's title slide (and after any existing examples for that JEP) | Must-have |
| F-18 | The user can **delete** any slide except the Presentation Title slide | Must-have |
| F-19 | The user can **reorder** slides via up/down controls in the sidebar | Must-have |
| F-20 | All slides (including example slides) can be freely reordered via up/down controls — there is no enforced ordering constraint after initial insertion | Must-have |
| F-21 | A button or link to enter **View Mode** is accessible from the editor | Must-have |

### 7.4 View Mode

| ID | Requirement | Priority |
|---|---|---|
| F-22 | View mode displays slides fullscreen in a slideshow format | Must-have |
| F-23 | The user navigates between slides using the **left and right arrow keys** | Must-have |
| F-24 | A visible control (button or link) allows the user to **exit view mode** and return to the editor | Must-have |
| F-25 | Slides render consistently with their edited content | Must-have |
| F-26 | A slide counter (e.g. "3 / 12") is displayed during presentation | Could-have (low priority) |
| F-27 | The slide library used for view mode is **Reveal.js loaded via CDN** (or a comparable lightweight alternative if Reveal.js proves unsuitable) | Must-have |

---

## 8. Non-Functional Requirements

### 8.1 Performance
- Scraping and presentation generation should complete in **under 30 seconds** on a normal connection
- The editor UI should feel responsive — slide selection and field edits should reflect immediately (no perceptible lag)
- View mode transitions should be smooth (no flash/flicker between slides)

### 8.2 Security
- No authentication required (single-user, local machine only)
- The PHP backend should sanitise all inputs before storing to SQLite to prevent SQL injection
- Scraped content should be HTML-escaped before rendering to prevent XSS

### 8.3 Availability & Reliability
- The tool runs locally on Apache; uptime is tied to the machine uptime — no additional availability requirement
- SQLite file should not become corrupted on normal browser close or server restart

### 8.4 Usability
- The interface must work in a modern desktop browser (Chrome, Firefox, Safari — latest stable versions)
- No mobile optimisation required
- No accessibility (WCAG) compliance required at this stage

### 8.5 Maintainability
- **No npm or package manager** — all dependencies loaded via CDN `<script>`/`<link>` tags or vendored as single files
- Code should be organised into logical files (e.g. separate PHP files per concern, separate JS files per feature area)
- SQLite schema should be simple and human-readable

---

## 9. Data Requirements

### 9.1 Data Entities

#### Presentation
| Field | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key, single row expected |
| jdk_version | TEXT | e.g. "25" |
| title | TEXT | Editable presentation title |
| subtitle | TEXT | Editable tagline / subtitle |
| release_date | TEXT | Scraped then editable |
| created_at | DATETIME | Timestamp of last scrape/creation |

#### Slide
| Field | Type | Notes |
|---|---|---|
| id | INTEGER | Primary key |
| presentation_id | INTEGER | Foreign key to Presentation |
| type | TEXT | `title` \| `jep` \| `example` |
| position | INTEGER | Ordering index |
| jep_number | TEXT | JEP slides and example slides |
| jep_title | TEXT | JEP slides only |
| slide_title | TEXT | Example slides: title of the example |
| code_content | TEXT | Example slides: code snippet body |
| parent_jep_id | INTEGER | Example slides: FK to the parent JEP slide |

### 9.2 Data Volume
- Expected: 10–50 JEP slides per presentation, with a small number of example slides added manually
- SQLite is well within capacity for this workload

### 9.3 Data Retention
- Only one active presentation is stored at a time
- Re-scraping **clears all existing slides** and repopulates from the fresh scrape — the user must confirm this action before it proceeds
- Example slides added manually are lost on re-scrape (no merge/preservation)
- No archiving or history required

### 9.4 Data Migration
- No migration from the existing Python/PowerPoint pipeline is required

---

## 10. Integration Requirements

### 10.1 OpenJDK Website Scraper
- **Endpoint:** `https://openjdk.org/projects/jdk/<version>/`
- **Method:** PHP HTTP request (e.g. `file_get_contents` or `cURL`)
- **Data extracted:** List of JEPs (number + title), release date
- **Error handling:** If the page is unreachable or the version doesn't exist, return a clear error to the UI — do not store partial data
- **Authentication:** None (public page)

### 10.2 Reveal.js (CDN)
- Loaded via `<script>` and `<link>` tags from a public CDN (e.g. `cdnjs.cloudflare.com`)
- Used exclusively in view mode
- If CDN is unavailable, view mode will not function — acceptable given local-machine context

### 10.3 SQLite
- Accessed via PHP's built-in `PDO` with the SQLite driver
- Database file stored in a location writable by the Apache process (e.g. outside the web root for security)

---

## 11. Constraints

### Technical Constraints
- **Frontend:** Plain HTML, CSS, vanilla JavaScript only — no build tools, no npm
- **Backend:** PHP 8.4 — no Composer or external PHP packages unless vendored as a single file
- **Database:** SQLite (via PHP PDO)
- **Web server:** Apache on local machine; new virtual host to be configured
- **External JS/CSS:** Loaded via CDN `<script>`/`<link>` tags only; minimal (≤2 external libraries)

### Business Constraints
- Single-user tool; no need to design for concurrency
- One active presentation at a time

### Regulatory / Compliance
- None applicable

---

## 12. Assumptions

1. The OpenJDK website structure at `https://openjdk.org/projects/jdk/<version>/` remains consistent enough for the PHP scraper to parse reliably (same as the existing Python scraper assumption)
2. The machine running Apache has outbound HTTP/HTTPS access to `openjdk.org` for scraping
3. The machine has outbound HTTPS access to a CDN to load Reveal.js in view mode
4. PHP's `cURL` or `file_get_contents` with URL wrappers is enabled on the server
5. PHP's PDO SQLite extension is enabled
6. A single user operates the tool; no concurrent editing or viewing conflicts will occur
7. The existing Python scraper code can serve as a reference for the scraping logic but will not be called directly by the PHP backend

---

## 13. Dependencies

| Dependency | Type | Notes |
|---|---|---|
| Apache virtual host configuration | Infrastructure | Must be set up before the app can be accessed |
| PHP 8.4 with PDO + SQLite | Runtime | Already installed on the machine |
| `openjdk.org` website availability | External | Required at scrape time only |
| Reveal.js CDN availability | External | Required in view mode only |
| Write permissions for SQLite file location | Infrastructure | Apache process must be able to write the DB file |

---

## 14. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| OpenJDK page structure changes, breaking the scraper | Medium | High | Scraper should fail gracefully and report an error; page structure can be inspected and scraper updated |
| Reveal.js CDN unavailable during presentation | Low | High | Consider vendoring Reveal.js as a fallback (single file download) |
| SQLite file permissions issue on Apache | Medium | Medium | Document the correct file path and permissions in setup instructions |
| Reveal.js API incompatibility with desired slide structure | Low | Medium | Evaluate Reveal.js first; requirement explicitly allows swapping it for an alternative |

---

## 15. Success Criteria

- [ ] Entering a valid JDK version number produces a complete presentation with a title slide and one JEP slide per JEP, populated with scraped data
- [ ] All slide fields are editable and changes persist after a browser refresh
- [ ] Code example slides can be added after any JEP slide, edited, reordered (within their JEP group), and deleted
- [ ] The sidebar correctly reflects the current slide order with appropriate titles/excerpts
- [ ] View mode opens fullscreen, displays all slides, and responds correctly to left/right arrow key navigation
- [ ] View mode can be exited to return to the editor
- [ ] The entire tool works with no npm, no build step — just files served by Apache

---

## 16. Open Questions

All previously listed open questions have been resolved. The table below records the decisions made:

| # | Question | Resolution |
|---|---|---|
| OQ-1 | Should reordering of JEP slides be allowed? | ✅ Yes — all slides can be freely reordered |
| OQ-2 | When a JEP slide is deleted, what happens to its example slides? | ✅ Example slides are standalone; they remain in place, user deletes them manually if desired |
| OQ-3 | Should re-scraping preserve manually added example slides? | ✅ No — re-scrape clears everything; user is asked to confirm before proceeding |
| OQ-4 | Drag-and-drop or up/down buttons for reordering? | ✅ Up/down buttons (baseline); drag-and-drop deferred to future |
| OQ-5 | Visual theme — match existing orange/white style? | ✅ Yes — match the orange (`#FF5722`) background, white text, `Alfa Slab One` titles, `Roboto` body from `template_config.py` |
| OQ-6 | Scraper invocable via CLI as well as browser? | ✅ Browser web form only |

### Remaining Open Questions
| # | Question | Owner | Notes |
|---|---|---|---|
| OQ-7 | Which exact CDN URL should be used for Reveal.js, and which version should be pinned? | Architect | Recommend pinning to a specific version for stability |
| OQ-8 | Where on the filesystem should the SQLite database file be stored relative to the Apache document root? | Architect | Should be outside the web root for security |

---

## Appendices

### A. Existing Codebase Reference
The following Python modules exist and contain scraping + generation logic that can be referenced when building the PHP equivalent:

| File | Purpose |
|---|---|
| `jdk_scraper.py` | Scrapes `openjdk.org` — source of truth for parsing logic |
| `presentation_generator.py` | Slide structure and content model |
| `template_config.py` | Visual design constants (colours, fonts) |
| `generate_jdk25_presentation.py` | CLI entry point |

### B. Slide Structure (Visual Reference)

```
[ Presentation Title Slide ]
  - [LARGE] "JDK 25"                        ← from scrape, editable
  - [SUBTITLE] "September 2025"             ← release date from scrape, editable
  - [SUBTITLE] "The Future of Java"         ← user-provided tagline, editable

[ JEP Title Slide ]
  - [LABEL]  "JEP 491"                      ← from scrape, editable
  - [SUBTITLE] "Synchronize Virtual Threads without Pinning"

[ Code Example Slide ]          ← inserted after JEP 491; standalone after that
  - [TITLE] "Example: Virtual Thread Pinning"
  - [CODE]  ... code block ...

[ Code Example Slide ]          ← also associated with JEP 491 at creation
  - [TITLE] "Before vs After"
  - [CODE]  ... code block ...

[ JEP Title Slide ]
  - [LABEL]  "JEP 492"
  - [SUBTITLE] "Flexible Constructor Bodies"

... and so on
```

### B2. Visual Theme (from `template_config.py`)

All slides use the same visual theme as the existing Python tool:

| Element | Value |
|---|---|
| Background colour | `#FF5722` (deep orange) |
| Text colour | White (`#FFFFFF`) |
| Title font | `Alfa Slab One` |
| Body / subtitle font | `Roboto` |
| Code block font | Monospace (e.g. `Courier New`, `Fira Code`) |

### C. Technology Stack Summary

| Layer | Technology |
|---|---|
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Slide View Library | Reveal.js (CDN) |
| Backend | PHP 8.4 |
| Database | SQLite (via PHP PDO) |
| Web Server | Apache (local machine, new vhost) |
| Package Management | None |
