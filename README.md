# AccessEd — ADA Title II & WCAG 2.1 AA Course Remediation Studio

AccessEd is a **100% client-side** (zero backend server) web application that audits school and university course materials for **ADA Title II / WCAG 2.1 Level AA** barriers, applies deterministic accessibility fixes offline, remediates non-HTML and STEM/CS assets, and exports compliant packages ready to re-import into Canvas, Blackboard, Moodle, or D2L.

---

## Key Capabilities

### 1. LMS Package, HTML & Workspace Import
- **IMS Common Cartridge & ZIP (`.imscc`, `.zip`):** Parses `imsmanifest.xml`, preserves course structure and media assets, and supports round-trip export with newly generated companion pages registered in `imsmanifest.xml`.
- **Single/Multi-Page HTML & Paste:** Upload `.html` / `.htm` / `.xhtml` files or paste HTML directly from an LMS Rich Content Editor.
- **Built-In & Test Courses:** Includes a built-in **BIO 101 Sample Course** plus sample `.imscc` and HTML courses in `test-course/` (`cs-310-data-structures-algorithms.imscc`, `math-241-multivariable-calculus.imscc`, `chem-212-organic-chemistry-ii.imscc`, `hist-204-modern-world-history.imscc`).
- **Local Persistence & Portable Workspaces:** Auto-saves active work in browser IndexedDB (`accessed_workspace_db`) and supports exporting/re-importing portable `.accessed` workspace files.

### 2. Deterministic HTML WCAG 2.1 AA Engine (100% Offline)
- **Document Structure (3.1.1, 2.4.2, 2.4.1, 1.4.4):** Sets `<html lang>`, descriptive `<title>`, `<main>` landmark, skip-to-content link, and re-enables pinch-to-zoom.
- **Headings (1.3.1):** Converts styled bold/large `<p>` fake headings to semantic headings, removes empty headings, and normalizes skipped heading levels.
- **Color Contrast (1.4.3):** Computes WCAG 2.1 relative luminance ratios and adjusts foreground colors to meet `>= 4.5:1` (`>= 3.0:1` for large text) while preserving hue.
- **Data Tables (1.3.1):** Promotes header rows to `<th scope="col">` inside `<thead>` and adds descriptive `<caption>` elements.
- **Links (2.4.4, 3.2.5):** Replaces generic `"click here"` / raw URL links with descriptive labels and adds screen-reader new-tab notices (`rel="noopener noreferrer"`).
- **Images, Media, Iframes & Forms (1.1.1, 1.2.2, 1.4.2, 4.1.2):** Flags missing or suspicious `alt` text with inline editing and decorative marking (`alt=""`), adds descriptive `<iframe>` titles, disables `<video>`/`<audio>` autoplay, adds caption/transcript placeholders, and labels unlabeled form controls.
- **Typography & Keyboard Focus (1.4.4, 2.2.2, 2.4.3):** Raises `< 12px` text to `14px`, replaces `<marquee>`/`<blink>`, removes positive `tabindex`, and injects accessible focus-ring & skip-link CSS.

### 3. Non-HTML & STEM/CS Accessibility Remediation
- **Scanned & Untagged PDFs → Accessible HTML Study Guides (`src/engine/pdfRemediator.ts`):**
  - Renders PDF pages to offscreen `<canvas>` elements via `pdfjs-dist`.
  - Extracts structured semantic HTML via **BYOK Vision AI** (if enabled) or **offline `tesseract.js` OCR** with live page-by-page progress.
  - Wraps output in a full WCAG 2.1 AA HTML page, adds it to the course, registers it in `imsmanifest.xml`, and marks the PDF as remediated in the Compliance Report.
- **PowerPoint (`.pptx`) & Word (`.docx`) In-Place Repair + Outline Extraction (`src/engine/officeRemediator.ts`):**
  - Deep OOXML inspection checking `descr`, `title`, and `<adec:decorative val="1"/>` flags on `<p:cNvPr>` and `<wp:docPr>`.
  - Expand any `.pptx` / `.docx` attachment to inspect embedded image thumbnails, edit alt text (or generate via Vision AI), mark images decorative, patch the Office XML **in-place** for `.imscc` export, or extract a structured **Accessible HTML Outline**.
- **Code Screenshots & ASCII Diagrams → Semantic `<pre><code>` & `<figure role="img">`:**
  - Automatically detects ASCII box-drawing/arrow diagrams in `<pre>` blocks and wraps them in `<figure role="img" aria-label="..."><pre aria-hidden="true">...</pre><figcaption>...</figcaption></figure>`.
  - Converts code/terminal screenshot `<img>` issues into semantic `<figure><pre><code>` blocks via Vision AI or offline `tesseract.js` OCR + editable preview.
- **Equation Images & Raw LaTeX → Semantic MathML (`src/engine/mathRemediator.ts`):**
  - Deterministically upgrades raw LaTeX delimiters (`$$...$$`, `\[...\]`, `\(...\)`) into navigable `<math xmlns="http://www.w3.org/1998/Math/MathML">` with plain-English `aria-label` via `katex`.
  - Converts equation screenshot `<img>` issues to MathML with live KaTeX preview and Vision AI or manual LaTeX entry.
- **Complex Charts, Spectra & Graphs → Companion Data Tables:**
  - Extracts chart titles, headers, and rows (via Vision AI or manual entry) and injects a collapsible WCAG 1.1.1 `<details class="accessed-data-table">` table directly beneath the `<img>`.

### 4. Assistive Studio, Video ADA Studio & Sandboxed Previews
- **Sandboxed Side-by-Side Preview (`src/components/PreviewPane.tsx`):** Sanitizes HTML with `DOMPurify` inside `<iframe sandbox="">` with a **Highlight ADA Improvements** mode (visualizing `alt`, `aria-label`, `th[scope]`, `<caption>`, MathML, and auto-expanded companion tables).
- **Screen-Reader Simulator & Captioning (`src/components/AssistiveStudio.tsx`):** Linearizes headings, landmarks, images, diagrams, and MathML with Web Speech API read-aloud preview and `.vtt`/`.srt` attachment.
- **Video ADA Studio (`src/components/VideoStudio.tsx`):** Client-side WebVTT closed-caption & audio-description authoring with standalone accessible HTML5 video player export.
- **Exports:** Remediated `.imscc` / `.zip` / `.html`, LMS-safe HTML clipboard copy, and formal **ADA Title II & WCAG 2.1 AA Compliance Reports**.

---

## AI Enhancement, Data Privacy & API Key Disclaimer

AccessEd’s core WCAG 2.1 AA HTML engine, OOXML Office repair, KaTeX MathML conversion, and `tesseract.js` OCR run **100% locally in your browser** with no backend server.

Optional AI features (Google Gemini, OpenAI / OpenAI-compatible endpoints, or experimental Chrome Built-In Local AI) can be enabled in **AI Settings**:
- **Local Key Storage:** External API keys are stored only in your browser’s `localStorage` (`accessed_ai_config_v1`) and are **not** included in exported `.imscc` packages or `.accessed` workspace files. On shared computers, clear or disable your key when finished.
- **Data Retention & Model Training Warning:** When using an external AI API key (Gemini, OpenAI, or compatible endpoints), any course text, images, PDF pages, or media snippets you choose to enhance are sent directly from your browser to that provider. **Depending on your API plan and provider terms (especially free-tier API keys), the provider may log, retain, or use submitted data to train or improve its models.**
- **FERPA & Sensitive Content:** Do **not** submit FERPA-protected student records, unpublished exams, or proprietary/sensitive materials using an external API key unless your institution’s paid API agreement guarantees zero data retention. Otherwise, keep external AI disabled and use AccessEd’s offline engine (or Chrome’s on-device Gemini Nano where supported).
- **Chrome Built-In Local AI (`chrome-nano`) Limitations:** Runs on-device with no cloud inference or API key, and AccessEd destroys each session immediately after the prompt completes (subject to Chrome’s own browser telemetry/crash-reporting settings). It is **text-only** (filename/context alt-text, link rewriting, plain-language summaries, and ASCII diagram descriptions) and does **not** support image/vision tasks (PDF Vision, Office image pixels, code/equation screenshots, or chart-to-table extraction), which use offline `tesseract.js` OCR / manual entry or require Gemini/OpenAI.

---

## Project Structure

- `src/App.tsx` — Main workspace UI, course/attachment state, and export orchestration
- `src/engine/auditor.ts` — WCAG 2.1 AA HTML auditor (structure, contrast, tables, links, media, ASCII diagrams, raw LaTeX)
- `src/engine/remediator.ts` — Deterministic HTML remediator and STEM/CS DOM transformers
- `src/engine/pdfRemediator.ts` — `pdfjs-dist` canvas renderer + Vision AI / `tesseract.js` OCR → WCAG HTML study guides
- `src/engine/officeRemediator.ts` — `.pptx` / `.docx` image extraction, in-place XML patching, and HTML outline extraction
- `src/engine/mathRemediator.ts` — `katex` MathML rendering, raw LaTeX upgrade, and spoken `aria-label` generation
- `src/engine/attachments.ts` — PDF binary structure inspector and OOXML `.pptx` / `.docx` auditor
- `src/engine/aiEnhancer.ts` — Optional BYOK Gemini, OpenAI-compatible, and Chrome Built-In AI helpers
- `src/engine/imscc.ts` — `.imscc` / `.zip` parser, `imsmanifest.xml` updater, and round-trip exporter
- `src/engine/report.ts` — ADA Title II / WCAG 2.1 AA Compliance Report generator
- `src/components/` — `IssueList.tsx`, `PreviewPane.tsx`, `AssistiveStudio.tsx`, `VideoStudio.tsx`, `AiSettingsModal.tsx`, `ReportExportModal.tsx`, `ImportView.tsx`, `LandingPage.tsx`

---

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
