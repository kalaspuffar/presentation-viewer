<?php

// Path to the SQLite database, resolved relative to this file so it works
// regardless of which www/ subdirectory requires this file.
define('DB_PATH', __DIR__ . '/../var/presentation.db');

$pdo = new PDO('sqlite:' . DB_PATH, null, null, [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
]);

// SQLite disables foreign-key enforcement by default; enable it per-connection.
$pdo->exec('PRAGMA foreign_keys = ON');

// Auto-initialise the schema on every request — CREATE IF NOT EXISTS makes
// this a cheap no-op after the database has already been set up.
$pdo->exec("
    CREATE TABLE IF NOT EXISTS presentation (
        id           INTEGER  PRIMARY KEY,
        jdk_version  TEXT     NOT NULL DEFAULT '',
        title        TEXT     NOT NULL DEFAULT '',
        subtitle     TEXT     NOT NULL DEFAULT '',
        release_date TEXT     NOT NULL DEFAULT '',
        created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
");

$pdo->exec("
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
    )
");

$pdo->exec("
    CREATE UNIQUE INDEX IF NOT EXISTS idx_slides_position
        ON slides(presentation_id, position)
");
