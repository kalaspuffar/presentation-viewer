<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>JEP Presenter — Editor</title>

    <!-- Google Fonts: Alfa Slab One (titles), Roboto (body), Fira Code (code) -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Roboto:wght@400;700&family=Fira+Code:wght@400;600&display=swap">

    <link rel="stylesheet" href="/css/app.css">
</head>
<body>

    <header id="app-header">
        <span id="header-title">JEP Presenter</span>

        <!-- Hidden until a presentation is loaded; shown by editor.js -->
        <div id="header-actions" style="display:none" aria-label="Presentation actions">
            <button id="btn-generate-new" type="button">Generate New</button>
            <a href="/view.php" id="btn-present">Present</a>
        </div>
    </header>

    <main id="app-main">

        <!-- Sidebar — hidden until a presentation is loaded -->
        <aside id="sidebar" style="display:none" aria-label="Slide list"></aside>

        <!-- Edit pane — hidden until a slide is selected -->
        <section id="edit-pane" style="display:none" aria-label="Slide editor"></section>

        <!-- Empty state — shown when no presentation exists -->
        <div id="empty-state">
            <h2>Generate a Presentation</h2>

            <div class="form-group">
                <label for="version-input">JDK Version</label>
                <input type="text"
                       id="version-input"
                       name="version"
                       placeholder="e.g. 25"
                       inputmode="numeric"
                       pattern="[0-9]{1,2}"
                       aria-describedby="scrape-error">
            </div>

            <div id="scrape-error" role="alert" aria-live="polite" style="display:none"></div>

            <button id="btn-generate" type="button">Generate</button>
        </div>

    </main>

    <!-- Confirmation modal — shown before persisting a scraped presentation -->
    <div id="modal-overlay" style="display:none" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div id="modal-card">
            <h2 id="modal-title"></h2>
            <p  id="modal-body"></p>
            <div id="modal-actions">
                <button id="modal-cancel" type="button">Cancel</button>
                <button id="modal-confirm" type="button">Continue</button>
            </div>
        </div>
    </div>

    <script src="/js/editor.js" defer></script>

</body>
</html>
