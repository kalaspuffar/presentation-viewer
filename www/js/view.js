'use strict';

// ---------------------------------------------------------------------------
// Initialisation — fetch presentation + slides in parallel, then build slides
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
    const slideContainer = document.getElementById('slide-container');

    try {
        // 3.1 Fire two parallel fetches
        const [presResponse, slidesResponse] = await Promise.all([
            fetch('/api/presentation.php'),
            fetch('/api/slides.php'),
        ]);

        if (!presResponse.ok || !slidesResponse.ok) {
            throw new Error('API request failed');
        }

        const presentation = await presResponse.json();
        const slidesData   = await slidesResponse.json();
        const slides       = slidesData.slides || [];

        buildSlides(presentation, slides, slideContainer);

    } catch {
        // 3.3 Minimal error message on fetch failure
        slideContainer.textContent = 'Could not load presentation. Please try again.';
        return;
    }

    // 3.8 Initialise Reveal.js after slides are injected
    Reveal.initialize({
        hash:                false,
        controls:            false,
        progress:            false,
        slideNumber:         'c/t',
        center:              false,
        transition:          'slide',
        backgroundTransition: 'none',
        keyboard: {
            // Override Escape to return to the editor instead of entering overview mode
            27: () => { window.location.href = 'editor.php'; },
        },
    });
});

// ---------------------------------------------------------------------------
// 3.4 buildSlides — iterate slides and append <section> elements to the container
// ---------------------------------------------------------------------------
function buildSlides(presentation, slides, container) {
    slides.forEach((slide) => {
        let section;

        if (slide.type === 'title') {
            section = buildTitleSlide(presentation);
        } else if (slide.type === 'jep') {
            section = buildJepSlide(slide);
        } else if (slide.type === 'example') {
            section = buildExampleSlide(slide);
        }

        if (section) {
            container.appendChild(section);
        }
    });
}

// ---------------------------------------------------------------------------
// 3.5 buildTitleSlide — presentation-level title, release date, subtitle
// ---------------------------------------------------------------------------
function buildTitleSlide(presentation) {
    const section = document.createElement('section');
    section.className = 'slide-title';

    const content = document.createElement('div');
    content.className = 'slide-content';

    const heading = document.createElement('h1');
    heading.className   = 'main-title';
    heading.textContent = presentation.title || '';

    const releaseDate = document.createElement('p');
    releaseDate.className   = 'release-date';
    releaseDate.textContent = presentation.release_date || '';

    const subtitle = document.createElement('p');
    subtitle.className   = 'custom-subtitle';
    subtitle.textContent = presentation.subtitle || '';

    content.appendChild(heading);
    content.appendChild(releaseDate);
    content.appendChild(subtitle);
    section.appendChild(content);

    return section;
}

// ---------------------------------------------------------------------------
// 3.6 buildJepSlide — JEP number label and title
// ---------------------------------------------------------------------------
function buildJepSlide(slide) {
    const section = document.createElement('section');
    section.className = 'slide-jep';

    const content = document.createElement('div');
    content.className = 'slide-content';

    const label = document.createElement('div');
    label.className   = 'jep-label';
    label.textContent = `JEP ${slide.jep_number}`;

    const title = document.createElement('p');
    title.className   = 'jep-title';
    title.textContent = slide.jep_title || '';

    content.appendChild(label);
    content.appendChild(title);
    section.appendChild(content);

    return section;
}

// ---------------------------------------------------------------------------
// 3.7 buildExampleSlide — optional title + code block
// ---------------------------------------------------------------------------
function buildExampleSlide(slide) {
    const section = document.createElement('section');
    section.className = 'slide-example';

    const content = document.createElement('div');
    content.className = 'slide-content';

    // Omit <h2> if slide_title is null or empty
    if (slide.slide_title) {
        const heading = document.createElement('h2');
        heading.className   = 'example-title';
        heading.textContent = slide.slide_title;
        content.appendChild(heading);
    }

    const pre = document.createElement('pre');
    const code = document.createElement('code');
    code.className   = 'example-code';
    code.textContent = slide.code_content || '';

    pre.appendChild(code);
    content.appendChild(pre);
    section.appendChild(content);

    return section;
}
