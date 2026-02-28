# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

### Setup
```bash
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Generate a presentation
```bash
# Default: JDK 25
python generate_jdk25_presentation.py

# Specific version with options
python generate_jdk25_presentation.py 26 --tagline "The Future of Java" --output JDK26.pptx
```

Output `.pptx` files are gitignored.

## Architecture

The pipeline has four modules:

**`generate_jdk25_presentation.py`** — CLI entry point. Parses args, attempts live scraping for JDK >= 25, falls back to hardcoded sample data on failure.

**`jdk_scraper.py`** — Fetches JEP list and release date from `https://openjdk.org/projects/jdk/<version>/`. Returns a dict with `version`, `release_date`, and a list of `JEP` dataclass instances. The `JEP` dataclass is defined here (separate from the one in `presentation_generator.py`).

**`presentation_generator.py`** — Contains `JDKRelease` and `JEP` dataclasses (used by the generator, distinct from the scraper's `JEP`), and `JDKPresentationGenerator` which builds the `.pptx` using `python-pptx`. Slide sequence: title slide → one slide per JEP + optional example slides → hardcoded Hello World example at the end.

**`template_config.py`** — All visual constants (colors, fonts, sizes) and three layout functions: `apply_title_slide_layout`, `apply_jep_slide_layout`, `apply_example_slide_layout`. All slides use an orange (`#FF5722`) background with white text. Fonts: `Alfa Slab One` for titles, `Roboto` for body.

### Note on duplicate `JEP` class
`jdk_scraper.py` and `presentation_generator.py` each define a `JEP` dataclass. The scraper's `JEP` objects are passed directly into the generator — they are structurally compatible but not the same class.

## personas/
Role-specific instruction files (ANALYST.md, CODE_REVIEWER.md, etc.) for use as Claude system prompts or context when working in different modes.

## openspec/
OpenSpec workflow directory — `specs/` for main specs, `changes/` for in-progress and archived changes. Managed via the `opsx:*` skills.
