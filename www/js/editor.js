/**
 * editor.js — scrape flow and initial editor state management.
 *
 * Phase 2 scope:
 *   - On load: check whether a presentation already exists
 *   - Show empty-state (scrape form) or editor chrome accordingly
 *   - Handle the full scrape → confirmation modal → persist → reload cycle
 *
 * Phase 3 will add the sidebar slide list and edit pane details.
 */

'use strict';

// ---------------------------------------------------------------------------
// Cached DOM references (populated after DOMContentLoaded)
// ---------------------------------------------------------------------------
let versionInput, btnGenerate, btnGenerateNew;
let scrapeError, emptyState;
let sidebar, editPane, headerActions, headerTitle;
let modalOverlay, modalMessage, modalCancel, modalConfirm;

// Holds the last successful scrape result while the modal is open.
let pendingScrapeData = null;

// ---------------------------------------------------------------------------
// Initialisation
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
    versionInput    = document.getElementById('version-input');
    btnGenerate     = document.getElementById('btn-generate');
    btnGenerateNew  = document.getElementById('btn-generate-new');
    scrapeError     = document.getElementById('scrape-error');
    emptyState      = document.getElementById('empty-state');
    sidebar         = document.getElementById('sidebar');
    editPane        = document.getElementById('edit-pane');
    headerActions   = document.getElementById('header-actions');
    headerTitle     = document.getElementById('header-title');
    modalOverlay    = document.getElementById('modal-overlay');
    modalMessage    = document.getElementById('modal-message');
    modalCancel     = document.getElementById('modal-cancel');
    modalConfirm    = document.getElementById('modal-confirm');

    btnGenerate.addEventListener('click', generatePresentation);
    btnGenerateNew.addEventListener('click', showScrapeForm);
    modalCancel.addEventListener('click', handleModalCancel);
    modalConfirm.addEventListener('click', handleModalConfirm);

    checkExistingPresentation();
});

// ---------------------------------------------------------------------------
// Check whether a presentation already exists in the database
// ---------------------------------------------------------------------------
async function checkExistingPresentation() {
    try {
        const response = await fetch('/api/presentation.php');

        if (response.status === 404) {
            showEmptyState();
        } else if (response.ok) {
            const presentation = await response.json();
            showEditorChrome(presentation);
            loadSlides(); // stub — populated in Phase 3
        } else {
            // Unexpected error — default to empty state so the user can still generate.
            showEmptyState();
        }
    } catch {
        showEmptyState();
    }
}

// ---------------------------------------------------------------------------
// Scrape flow
// ---------------------------------------------------------------------------
async function generatePresentation() {
    const version = versionInput.value.trim();
    hideScrapeError();

    setGenerateLoadingState(true);

    try {
        const response = await fetch('/api/scrape.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ version }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            showScrapeError(data.error || 'An unexpected error occurred.');
            setGenerateLoadingState(false);
            return;
        }

        // Store for use when the user confirms in the modal.
        pendingScrapeData = data;
        showConfirmationModal(data);

    } catch {
        showScrapeError('Could not connect to the server. Please try again.');
        setGenerateLoadingState(false);
    }
}

function setGenerateLoadingState(loading) {
    versionInput.disabled = loading;
    btnGenerate.disabled  = loading;
    btnGenerate.textContent = loading ? 'Generating…' : 'Generate';

    if (loading) {
        btnGenerate.classList.add('is-loading');
    } else {
        btnGenerate.classList.remove('is-loading');
    }
}

// ---------------------------------------------------------------------------
// Confirmation modal
// ---------------------------------------------------------------------------
function showConfirmationModal(data) {
    const existingPresentation = headerActions.style.display !== 'none';
    const replacementWarning   = existingPresentation
        ? ' This will replace your current presentation.'
        : '';

    modalMessage.textContent =
        `Found ${data.jep_count} JEP${data.jep_count !== 1 ? 's' : ''} for JDK ${data.jdk_version}.`
        + replacementWarning
        + ' Continue?';

    modalOverlay.style.display = 'flex';
    modalConfirm.focus();
}

function handleModalCancel() {
    modalOverlay.style.display = 'none';
    pendingScrapeData = null;
    setGenerateLoadingState(false);
}

async function handleModalConfirm() {
    if (!pendingScrapeData) {
        return;
    }

    const scrapeData = pendingScrapeData;
    pendingScrapeData = null;

    modalConfirm.disabled = true;
    modalCancel.disabled  = true;

    try {
        const response = await fetch('/api/presentation.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
                jdk_version:  scrapeData.jdk_version,
                title:        `JDK ${scrapeData.jdk_version}`,
                subtitle:     '',
                release_date: scrapeData.release_date,
                jeps:         scrapeData.jeps,
            }),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
            modalMessage.textContent = data.error || 'Failed to save presentation.';
            modalConfirm.disabled = false;
            modalCancel.disabled  = false;
            return;
        }

        modalOverlay.style.display = 'none';
        reloadEditorState();

    } catch {
        modalMessage.textContent = 'Could not connect to the server. Please try again.';
        modalConfirm.disabled = false;
        modalCancel.disabled  = false;
    }
}

// ---------------------------------------------------------------------------
// Reload editor state after a successful presentation save
// ---------------------------------------------------------------------------
async function reloadEditorState() {
    try {
        const [presentationResponse] = await Promise.all([
            fetch('/api/presentation.php'),
            fetch('/api/slides.php'),  // pre-fetched; used by Phase 3 loadSlides()
        ]);

        if (!presentationResponse.ok) {
            return;
        }

        const presentation = await presentationResponse.json();

        showEditorChrome(presentation);
        loadSlides(); // stub — populated in Phase 3
    } catch {
        // Silently fail — the page is still usable.
    }
}

// ---------------------------------------------------------------------------
// UI state helpers
// ---------------------------------------------------------------------------
function showEmptyState() {
    emptyState.style.display    = '';
    sidebar.style.display       = 'none';
    editPane.style.display      = 'none';
    headerActions.style.display = 'none';
    setGenerateLoadingState(false);
}

function showEditorChrome(presentation) {
    emptyState.style.display    = 'none';
    sidebar.style.display       = '';
    editPane.style.display      = '';
    headerActions.style.display = '';
    headerTitle.textContent     = `JEP Presenter \u2014 JDK ${presentation.jdk_version}`;
}

function showScrapeForm() {
    // Clicking "Generate New" in the header brings back the scrape form while
    // keeping the existing presentation intact (until the user confirms).
    emptyState.style.display = '';
    versionInput.value       = '';
    hideScrapeError();
    setGenerateLoadingState(false);
    versionInput.focus();
}

function showScrapeError(message) {
    scrapeError.textContent    = message;
    scrapeError.style.display  = '';
}

function hideScrapeError() {
    scrapeError.textContent   = '';
    scrapeError.style.display = 'none';
}

// ---------------------------------------------------------------------------
// Stub — replaced in Phase 3 (feature-editor-sidebar-and-edit-pane)
// ---------------------------------------------------------------------------
function loadSlides() {
    // Phase 3 will populate the sidebar with the slide list from GET /api/slides.php
}
