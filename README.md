# AccessEd — ADA Title II & WCAG 2.1 AA Course Remediation Studio

AccessEd is a browser-based web application that audits school and university course materials for **ADA Title II / WCAG 2.1 Level AA** barriers, automatically applies deterministic accessibility fixes offline, and exports remediated courses ready to re-import into Canvas, Blackboard, Moodle, or D2L.

## Features

- **LMS Package & HTML Import**
  - Upload Canvas / Blackboard / D2L **`.imscc`** or **`.zip`** course packages (parses `imsmanifest.xml` and preserves assets for round-trip export).
  - Upload individual **`.html` / `.htm`** pages or paste HTML directly from an LMS Rich Content Editor.
  - Includes a built-in **BIO 101 Sample Course** (Syllabus, Week 1 Lecture, Lab 1 Assignment) to test the workflow immediately.
- **15+ Deterministic WCAG 2.1 AA Checks & Auto-Fixes (100% Offline)**
  - **Document structure (3.1.1, 2.4.2, 2.4.1, 1.4.4):** Sets `<html lang>`, descriptive `<title>`, `<main>` landmark, skip-to-content link, and re-enables pinch-to-zoom.
  - **Headings (1.3.1):** Converts styled bold/large `<p>` fake headings to semantic headings, removes empty headings, and normalizes skipped heading levels.
  - **Color contrast (1.4.3):** Computes exact WCAG 2.1 luminance ratios and automatically adjusts foreground colors to meet `>= 4.5:1` (`>= 3.0:1` for large text) while preserving hue.
  - **Data tables (1.3.1):** Converts header rows to `<th scope="col">` inside `<thead>` and adds descriptive `<caption>` elements.
  - **Links (2.4.4, 3.2.5):** Replaces generic `"click here"` / raw URL links with descriptive labels and adds screen-reader new-tab notices (`rel="noopener noreferrer"`).
  - **Images, Media, Iframes & Forms (1.1.1, 1.2.2, 1.4.2, 4.1.2):** Flags missing or filename-based `alt` text with inline editing, adds descriptive `<iframe>` titles, disables `<video>`/`<audio>` autoplay, adds caption track placeholders, and labels unlabeled form controls.
  - **Typography & Keyboard Focus (1.4.4, 2.2.2, 2.4.3):** Bumps `< 12px` text to `14px`, replaces `<marquee>`/`<blink>`, normalizes positive `tabindex`, and injects accessible focus-ring & skip-link CSS.
- **Optional AI Enhancement (Gemini or OpenAI-Compatible)**
  - Optionally add your own API key in **AI Settings** (stored only in browser `localStorage`) to generate contextual `alt` text, rewrite vague links, and create **Plain-Language Student Summaries (WCAG 3.1.5)**.
- **Before / After Preview & ADA Compliance Reports**
  - Sandboxed side-by-side preview of Original vs. Remediated course pages.
  - Export remediated `.imscc` / `.zip` / `.html` files plus a formal Markdown **ADA Title II & WCAG 2.1 AA Compliance Report**.

## Getting Started

```bash
npm install
npm run dev
```

Run tests and production build:

```bash
npm test
npm run build
```
