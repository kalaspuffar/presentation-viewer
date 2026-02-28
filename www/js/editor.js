/**
 * editor.js — scrape flow, sidebar, and edit pane.
 *
 * Phase 2 scope:
 *   - On load: check whether a presentation already exists
 *   - Show empty-state (scrape form) or editor chrome accordingly
 *   - Handle the full scrape → confirmation modal → persist → reload cycle
 *
 * Phase 3 additions:
 *   - loadSlides() fetches GET /api/slides.php and renders the sidebar
 *   - Sidebar shows each slide with a label, ▲ ▼ ✕ controls
 *   - Clicking a sidebar item opens the appropriate edit form in the edit pane
 *   - Edit form fields auto-save on blur via PATCH endpoints
 */

'use strict';

// ---------------------------------------------------------------------------
// Cached DOM references (populated after DOMContentLoaded)
// ---------------------------------------------------------------------------
let versionInput, btnGenerate, btnGenerateNew;
let scrapeError, emptyState;
let sidebar, editPane, headerActions, headerTitle;
let modalOverlay, modalTitle, modalBody, modalCancel, modalConfirm;

// Holds the last successful scrape result while the modal is open.
let pendingScrapeData = null;

// ---------------------------------------------------------------------------
// Phase 3: in-memory editor state
// ---------------------------------------------------------------------------
let cachedPresentation = null; // Full presentation row from GET /api/presentation.php
let cachedSlides       = [];   // Ordered array of slide rows from GET /api/slides.php
let selectedSlideId    = null; // ID of the currently active slide

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
    modalTitle      = document.getElementById('modal-title');
    modalBody       = document.getElementById('modal-body');
    modalCancel     = document.getElementById('modal-cancel');
    modalConfirm    = document.getElementById('modal-confirm');

    btnGenerate.addEventListener('click', generatePresentation);
    versionInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') generatePresentation();
    });
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
            cachedPresentation = await response.json();
            showEditorChrome(cachedPresentation);
            loadSlides();
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

    modalTitle.textContent = 'Confirm';
    modalBody.textContent  =
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
            modalBody.textContent = data.error || 'Failed to save presentation.';
            modalConfirm.disabled = false;
            modalCancel.disabled  = false;
            return;
        }

        modalOverlay.style.display = 'none';
        reloadEditorState();

    } catch {
        modalBody.textContent = 'Could not connect to the server. Please try again.';
        modalConfirm.disabled = false;
        modalCancel.disabled  = false;
    }
}

// ---------------------------------------------------------------------------
// Reload editor state after a successful presentation save
// ---------------------------------------------------------------------------
async function reloadEditorState() {
    try {
        // Fetch presentation metadata and slides in parallel.
        const [presResponse, slidesResponse] = await Promise.all([
            fetch('/api/presentation.php'),
            fetch('/api/slides.php'),
        ]);

        if (!presResponse.ok) {
            // Presentation was saved but re-fetch failed; a page reload will recover.
            window.location.reload();
            return;
        }

        cachedPresentation = await presResponse.json();
        const slidesData   = slidesResponse.ok ? await slidesResponse.json() : { slides: [] };
        cachedSlides       = slidesData.slides || [];

        showEditorChrome(cachedPresentation);
        renderSidebar(cachedSlides);
    } catch {
        // Network failure after a successful save — reload to restore a consistent state.
        window.location.reload();
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
    // editPane stays hidden until a slide is selected
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

// Transient error banner shown inside the sidebar for slide CRUD failures.
function showOperationError(message) {
    let banner = sidebar.querySelector('.sidebar-error');
    if (!banner) {
        banner = document.createElement('p');
        banner.className = 'sidebar-error';
        banner.setAttribute('role', 'alert');
        banner.setAttribute('aria-live', 'polite');
        sidebar.prepend(banner);
    }
    banner.textContent   = message;
    banner.style.display = '';
}

function hideOperationError() {
    const banner = sidebar.querySelector('.sidebar-error');
    if (banner) {
        banner.style.display = 'none';
    }
}

// ---------------------------------------------------------------------------
// 2.1 loadSlides — fetch slide list and hand off to the sidebar renderer
// ---------------------------------------------------------------------------
async function loadSlides() {
    try {
        const response = await fetch('/api/slides.php');
        if (!response.ok) return;
        const data = await response.json();
        cachedSlides = data.slides || [];
        renderSidebar(cachedSlides);
    } catch {
        // Network errors during slide load are non-fatal; sidebar stays empty.
    }
}

// ---------------------------------------------------------------------------
// 2.2 renderSidebar — build or rebuild the <ul> inside #sidebar
// ---------------------------------------------------------------------------
function renderSidebar(slides) {
    let ul = sidebar.querySelector('ul');
    if (!ul) {
        ul = document.createElement('ul');
        sidebar.appendChild(ul);
    }
    ul.innerHTML = '';

    slides.forEach((slide, index) => {
        const isLast = index === slides.length - 1;
        const li     = createSidebarItem(slide, isLast);
        ul.appendChild(li);

        // 2.2.3 — insert "Add Example" affordance after every jep slide
        if (slide.type === 'jep') {
            const addRow = document.createElement('li');
            addRow.className = 'add-example-row';

            const addBtn = document.createElement('button');
            addBtn.type      = 'button';
            addBtn.className = 'add-example-link';
            addBtn.textContent = '+ Add Example';
            addBtn.addEventListener('click', () => addExampleSlide(slide.id));

            addRow.appendChild(addBtn);
            ul.appendChild(addRow);
        }
    });

    // 2.2.4 — re-select the previously active slide, or fall back to the first
    const targetId = (selectedSlideId !== null && slides.some(s => s.id === selectedSlideId))
        ? selectedSlideId
        : (slides[0]?.id ?? null);

    if (targetId !== null) {
        selectSlide(targetId);
    }
}

// Build a single <li class="sidebar-item"> for the given slide.
function createSidebarItem(slide, isLast) {
    const li = document.createElement('li');
    li.className       = 'sidebar-item';
    li.dataset.slideId = slide.id;

    // 2.3 — label text follows §3.7 rules
    const label = document.createElement('span');
    label.className   = 'sidebar-label';
    label.textContent = getSidebarLabel(slide);

    // ▲ Up button — disabled for the title slide (position 1) and the slide
    // immediately below it (position 2), because moving position-2 up would
    // swap it with the title slide and displace the title from position 1.
    const btnUp = document.createElement('button');
    btnUp.type      = 'button';
    btnUp.className = 'sidebar-btn btn-up';
    btnUp.textContent = '▲';
    btnUp.setAttribute('aria-label', 'Move slide up');
    btnUp.disabled = slide.type === 'title' || slide.position <= 2;

    // ▼ Down button — disabled if this is the last slide
    const btnDown = document.createElement('button');
    btnDown.type      = 'button';
    btnDown.className = 'sidebar-btn btn-down';
    btnDown.textContent = '▼';
    btnDown.setAttribute('aria-label', 'Move slide down');
    btnDown.disabled = isLast;

    // ✕ Delete button — hidden for the title slide
    const btnDelete = document.createElement('button');
    btnDelete.type      = 'button';
    btnDelete.className = 'sidebar-btn btn-delete';
    btnDelete.textContent = '✕';
    btnDelete.setAttribute('aria-label', 'Delete slide');
    if (slide.type === 'title') {
        btnDelete.style.display = 'none';
    }

    // Wire reorder buttons — stop propagation so the <li> click handler
    // (which selects the slide) does not also fire.
    btnUp.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderSlide(slide.id, 'up');
    });

    btnDown.addEventListener('click', (e) => {
        e.stopPropagation();
        reorderSlide(slide.id, 'down');
    });

    // Wire delete button.
    btnDelete.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteSlide(slide.id);
    });

    // 2.4 — clicking anywhere on the <li> selects the slide
    li.addEventListener('click', () => selectSlide(slide.id));

    li.appendChild(label);
    li.appendChild(btnUp);
    li.appendChild(btnDown);
    li.appendChild(btnDelete);

    return li;
}

// ---------------------------------------------------------------------------
// 2.3 getSidebarLabel — compute the display label for a slide per §3.7
// ---------------------------------------------------------------------------
function getSidebarLabel(slide) {
    if (slide.type === 'title') {
        return cachedPresentation ? cachedPresentation.title : 'Title Slide';
    }

    if (slide.type === 'jep') {
        return `JEP ${slide.jep_number} \u2014 ${slide.jep_title}`;
    }

    // example type
    if (slide.slide_title) {
        return slide.slide_title;
    }
    if (slide.code_content) {
        const snippet = slide.code_content.trim().slice(0, 50);
        return snippet + '\u2026';
    }
    return '(New Example)';
}

// Update just the label span of one sidebar item — avoids a full re-render.
function updateSidebarLabel(slideId) {
    if (slideId === null) return;

    const slide = cachedSlides.find(s => s.id === slideId);
    if (!slide) return;

    const li = sidebar.querySelector(`[data-slide-id="${slideId}"]`);
    if (!li) return;

    const labelEl = li.querySelector('.sidebar-label');
    if (labelEl) {
        labelEl.textContent = getSidebarLabel(slide);
    }
}

// ---------------------------------------------------------------------------
// 3.1 selectSlide — activate a slide and show its edit form
// ---------------------------------------------------------------------------
function selectSlide(slideId) {
    selectedSlideId = slideId;

    // Update active class on sidebar items
    sidebar.querySelectorAll('.sidebar-item').forEach(item => {
        const isActive = parseInt(item.dataset.slideId, 10) === slideId;
        item.classList.toggle('active', isActive);
    });

    const slide = cachedSlides.find(s => s.id === slideId);
    if (!slide) return;

    renderEditPane(slide, cachedPresentation);
    editPane.style.display = '';
}

// ---------------------------------------------------------------------------
// 3.2 renderEditPane — dispatch to the correct sub-renderer
// ---------------------------------------------------------------------------
function renderEditPane(slide, presentation) {
    editPane.innerHTML = '';

    if (slide.type === 'title') {
        renderTitleSlideForm(presentation);
    } else if (slide.type === 'jep') {
        renderJepSlideForm(slide);
    } else if (slide.type === 'example') {
        renderExampleSlideForm(slide);
    }
}

// ---------------------------------------------------------------------------
// 3.3 renderTitleSlideForm — edits the presentation-level metadata
// ---------------------------------------------------------------------------
function renderTitleSlideForm(presentation) {
    const fields = [
        { id: 'field-pres-title',    label: 'Presentation Title',        key: 'title',        value: presentation?.title        ?? '' },
        { id: 'field-pres-date',     label: 'Release Date',              key: 'release_date', value: presentation?.release_date ?? '' },
        { id: 'field-pres-subtitle', label: 'Custom Subtitle / Tagline', key: 'subtitle',     value: presentation?.subtitle     ?? '' },
    ];

    fields.forEach(({ id, label, key, value }) => {
        const group   = makeInputField(id, label, value);
        const input   = group.querySelector('input');
        // lastSaved tracks the most recently confirmed server value so that a
        // failed save does not reset the change-detection baseline, allowing
        // the user to blur again and trigger a retry.
        let lastSaved = value;

        // 3.3.2 — auto-save on blur
        input.addEventListener('blur', async () => {
            if (input.value === lastSaved) return; // nothing changed

            try {
                const res = await fetch('/api/presentation.php', {
                    method:  'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ [key]: input.value }),
                });
                if (!res.ok) return;

                // Advance baseline only after a confirmed save.
                lastSaved = input.value;

                // 3.3.3 — refresh cached presentation, update header & sidebar label
                const refreshed = await fetch('/api/presentation.php');
                if (refreshed.ok) {
                    cachedPresentation = await refreshed.json();
                    headerTitle.textContent = `JEP Presenter \u2014 JDK ${cachedPresentation.jdk_version}`;
                    const titleSlide = cachedSlides.find(s => s.type === 'title');
                    if (titleSlide) {
                        updateSidebarLabel(titleSlide.id);
                    }
                }
            } catch (err) {
                console.warn('Auto-save failed for presentation field:', key, err);
            }
        });

        editPane.appendChild(group);
    });
}

// ---------------------------------------------------------------------------
// 3.4 renderJepSlideForm — edits jep_number and jep_title
// ---------------------------------------------------------------------------
function renderJepSlideForm(slide) {
    const fields = [
        { id: 'field-jep-number', label: 'JEP Number', key: 'jep_number', value: slide.jep_number ?? '' },
        { id: 'field-jep-title',  label: 'JEP Title',  key: 'jep_title',  value: slide.jep_title  ?? '' },
    ];

    fields.forEach(({ id, label, key, value }) => {
        const group   = makeInputField(id, label, value);
        const input   = group.querySelector('input');
        // lastSaved tracks the most recently confirmed server value so that a
        // failed save does not reset the change-detection baseline.
        let lastSaved = value;

        // 3.4.2 — auto-save on blur
        input.addEventListener('blur', async () => {
            if (input.value === lastSaved) return; // nothing changed

            // jep_number must be a positive integer; reject non-numeric input silently.
            if (key === 'jep_number' && !/^\d+$/.test(input.value)) return;

            try {
                const res = await fetch('/api/slides.php', {
                    method:  'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body:    JSON.stringify({ id: slide.id, [key]: input.value }),
                });
                if (!res.ok) return;

                // Advance baseline only after a confirmed save.
                lastSaved  = input.value;

                // 3.4.3 — update in-memory slide and refresh sidebar label
                slide[key] = input.value;
                updateSidebarLabel(slide.id);
            } catch (err) {
                console.warn('Auto-save failed for JEP field:', key, err);
            }
        });

        editPane.appendChild(group);
    });
}

// ---------------------------------------------------------------------------
// 3.5 renderExampleSlideForm — edits slide_title and code_content
// ---------------------------------------------------------------------------
function renderExampleSlideForm(slide) {
    // 3.5.1 — Slide Title input
    // lastSavedTitle tracks the most recently confirmed server value so that a
    // failed save does not reset the change-detection baseline.
    let lastSavedTitle = slide.slide_title ?? '';
    const titleGroup   = makeInputField('field-ex-title', 'Slide Title', lastSavedTitle);
    const titleInput   = titleGroup.querySelector('input');

    titleInput.addEventListener('blur', async () => {
        if (titleInput.value === lastSavedTitle) return; // nothing changed
        const saved = await patchSlideField(slide, 'slide_title', titleInput.value);
        if (saved) lastSavedTitle = titleInput.value;
    });

    editPane.appendChild(titleGroup);

    // 3.5.2 — Code textarea
    // lastSavedCode tracks the most recently confirmed server value so that a
    // failed save does not reset the change-detection baseline.
    let lastSavedCode = slide.code_content ?? '';
    const codeId      = 'field-ex-code';
    const codeGroup   = document.createElement('div');
    codeGroup.className = 'field-group';

    const codeLabel = document.createElement('label');
    codeLabel.htmlFor     = codeId;
    codeLabel.textContent = 'Code';

    const codeArea = document.createElement('textarea');
    codeArea.id        = codeId;
    codeArea.className = 'code-textarea';
    codeArea.value     = lastSavedCode;

    // 3.5.2 — auto-save on blur
    codeArea.addEventListener('blur', async () => {
        if (codeArea.value === lastSavedCode) return; // nothing changed
        const saved = await patchSlideField(slide, 'code_content', codeArea.value);
        if (saved) lastSavedCode = codeArea.value;
    });

    codeGroup.appendChild(codeLabel);
    codeGroup.appendChild(codeArea);
    editPane.appendChild(codeGroup);
}

// ---------------------------------------------------------------------------
// Phase 4 CRUD actions
// ---------------------------------------------------------------------------

// Delete a slide; reload the sidebar and clear the edit pane on success.
async function deleteSlide(slideId) {
    hideOperationError();
    try {
        const res = await fetch('/api/slides.php', {
            method:  'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: slideId }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showOperationError(data.error ?? 'Could not delete slide. Please try again.');
            return;
        }

        // Clear the selection; renderSidebar will auto-select the title slide.
        selectedSlideId = null;
        await loadSlides();

    } catch {
        showOperationError('Could not connect to the server. Please try again.');
    }
}

// Add a new example slide beneath the given JEP slide; select it immediately.
async function addExampleSlide(parentJepId) {
    hideOperationError();
    try {
        const res = await fetch('/api/slides.php', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ parent_jep_id: parentJepId }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showOperationError(data.error ?? 'Could not add example slide. Please try again.');
            return;
        }

        const data     = await res.json();
        const newSlide = data.slide;

        // Reload the sidebar, then open the new slide in the edit pane.
        await loadSlides();
        if (newSlide?.id) {
            selectSlide(newSlide.id);
        }

    } catch {
        showOperationError('Could not connect to the server. Please try again.');
    }
}

// Move a slide up or down; keep the same slide selected after re-render.
async function reorderSlide(slideId, direction) {
    hideOperationError();
    try {
        const res = await fetch('/api/slides.php?action=reorder', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: slideId, direction }),
        });

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            showOperationError(data.error ?? 'Could not reorder slide. Please try again.');
            // Re-render to reflect accurate button state even after a rejection.
            await loadSlides();
            return;
        }

        // loadSlides → renderSidebar preserves selectedSlideId automatically.
        await loadSlides();

    } catch {
        showOperationError('Could not connect to the server. Please try again.');
    }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

// PATCH a single slide field; update in-memory state and label on success.
// Returns true when the server confirmed the save, false otherwise — so
// callers can advance their own lastSaved baseline only on confirmed writes.
async function patchSlideField(slide, key, newValue) {
    try {
        const res = await fetch('/api/slides.php', {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ id: slide.id, [key]: newValue }),
        });
        if (!res.ok) return false;

        slide[key] = newValue;
        updateSidebarLabel(slide.id);
        return true;
    } catch (err) {
        console.warn('Auto-save failed for slide field:', key, err);
        return false;
    }
}

// Build a .field-group containing a <label> and an <input type="text">.
function makeInputField(id, labelText, value) {
    const group = document.createElement('div');
    group.className = 'field-group';

    const label = document.createElement('label');
    label.htmlFor     = id;
    label.textContent = labelText;

    const input = document.createElement('input');
    input.type  = 'text';
    input.id    = id;
    input.value = value;

    group.appendChild(label);
    group.appendChild(input);
    return group;
}
