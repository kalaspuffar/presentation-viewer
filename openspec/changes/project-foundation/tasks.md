## 1. Git & Directory Structure

- [x] 1.1 Create branch `feature/project-foundation` from `main`
- [x] 1.2 Create directories: `www/api/`, `www/css/`, `www/js/vendor/`, `include/`, `var/`, `apache/`
- [x] 1.3 Add `var/presentation.db` to `.gitignore`
- [x] 1.4 Add a `.gitkeep` file inside `var/` so the directory is tracked by git

## 2. Apache Virtual Host

- [x] 2.1 Create `apache/jep-presenter.conf` with `DocumentRoot` pointing to `{project_root}/www`, a commented `ServerName jep-presenter.local` placeholder, `AllowOverride None`, and appropriate `<Directory>` block
- [x] 2.2 Add commented `chown`/`chmod` instructions in the conf file for granting the Apache process user write access to `var/`

## 3. Database Bootstrap (`include/db.php`)

- [x] 3.1 Define `DB_PATH` constant using `__DIR__` relative path to `{project_root}/var/presentation.db`
- [x] 3.2 Open PDO connection with `PDO::ERRMODE_EXCEPTION` and `PDO::FETCH_ASSOC` as defaults
- [x] 3.3 Execute `PRAGMA foreign_keys = ON` immediately after opening the connection
- [x] 3.4 Execute `CREATE TABLE IF NOT EXISTS presentation` with columns: `id INTEGER PRIMARY KEY`, `jdk_version TEXT NOT NULL DEFAULT ''`, `title TEXT NOT NULL DEFAULT ''`, `subtitle TEXT NOT NULL DEFAULT ''`, `release_date TEXT NOT NULL DEFAULT ''`, `created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP`
- [x] 3.5 Execute `CREATE TABLE IF NOT EXISTS slides` with columns: `id INTEGER PRIMARY KEY AUTOINCREMENT`, `presentation_id INTEGER NOT NULL`, `type TEXT NOT NULL CHECK(type IN ('title','jep','example'))`, `position INTEGER NOT NULL`, `jep_number TEXT`, `jep_title TEXT`, `slide_title TEXT`, `code_content TEXT`, `parent_jep_id INTEGER`, and `FOREIGN KEY (presentation_id) REFERENCES presentation(id)`
- [x] 3.6 Execute `CREATE UNIQUE INDEX IF NOT EXISTS idx_slides_position ON slides(presentation_id, position)`

## 4. Root Redirect

- [x] 4.1 Create `www/index.php` with a single `header('Location: editor.php'); exit;` redirect

## 5. PHP Stub Entry Points

- [x] 5.1 Create `www/editor.php` returning HTTP 501 JSON `{"error":"not implemented"}`
- [x] 5.2 Create `www/view.php` returning HTTP 501 JSON `{"error":"not implemented"}`
- [x] 5.3 Create `www/api/scrape.php` returning HTTP 501 JSON `{"error":"not implemented"}`
- [x] 5.4 Create `www/api/presentation.php` returning HTTP 501 JSON `{"error":"not implemented"}`
- [x] 5.5 Create `www/api/slides.php` returning HTTP 501 JSON `{"error":"not implemented"}`

## 6. JS & CSS Stubs

- [x] 6.1 Create `www/js/editor.js` as an empty file (or single-line comment)
- [x] 6.2 Create `www/js/view.js` as an empty file (or single-line comment)
- [x] 6.3 Create `www/css/app.css` as an empty file (or single-line comment)

## 7. Verification

- [x] 7.1 Confirm `git status` does not show `var/presentation.db` (gitignore working)
- [x] 7.2 Confirm `include/db.php` can be required from a test script and creates the DB file + tables without errors
- [x] 7.3 Confirm all stub PHP files return HTTP 501 when requested via Apache
- [x] 7.4 Confirm `www/index.php` redirects to `editor.php` when the vhost is active
