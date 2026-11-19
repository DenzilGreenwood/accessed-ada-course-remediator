import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const OUT_DIR = path.resolve('test-course');
const HTML_OUT_DIR = path.join(OUT_DIR, 'html-pages');

fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(HTML_OUT_DIR, { recursive: true });

/**
 * Generates a byte-accurate, spec-valid PDF 1.4 containing a single full-page
 * raster image XObject with zero fonts or structure tags (triggers Scanned PDF audit).
 */
function createMinimalScannedPdf(title) {
  const objects = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`,
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width 1 /Height 1 /ColorSpace /DeviceGray /BitsPerComponent 8 /Length 1 >>\nstream\n\x80\nendstream\nendobj\n`,
    `5 0 obj\n<< /Length 33 >>\nstream\nq 612 0 0 792 0 0 cm /Im1 Do Q\nendstream\nendobj\n`,
  ];

  let pdf = `%PDF-1.4\n% ${title} (Scanned Image-Only PDF)\n`;
  const offsets = [0];

  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += `0000000000 65535 f \n`;
  for (let i = 1; i < offsets.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.from(pdf, 'binary');
}

/**
 * Generates a minimal valid .pptx OOXML archive with 2 images missing `descr` alt text.
 */
async function createUntaggedPptx(slideTitle) {
  const pptx = new JSZip();

  pptx.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>
  <Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>
</Types>`
  );

  pptx.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
</Relationships>`
  );

  pptx.file(
    'ppt/presentation.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:sldIdLst>
    <p:sldId id="256" r:id="rId1"/>
  </p:sldIdLst>
</p:presentation>`
  );

  pptx.file(
    'ppt/_rels/presentation.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>
</Relationships>`
  );

  pptx.file(
    'ppt/slides/slide1.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr/>
      <p:sp>
        <p:nvSpPr><p:cNvPr id="2" name="Title 1"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>
        <p:txBody><a:bodyPr/><a:p><a:r><a:t>${slideTitle}</a:t></a:r></a:p></p:txBody>
      </p:sp>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="3" name="Diagram_Pointer_Rotation.png"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      </p:pic>
      <p:pic>
        <p:nvPicPr><p:cNvPr id="4" name="BigO_Graph_Plot.png"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>
      </p:pic>
    </p:spTree>
  </p:cSld>
</p:sld>`
  );

  return pptx.generateAsync({ type: 'nodebuffer' });
}

function buildManifest(courseId, courseTitle, pages, attachments) {
  const orgItems = pages
    .map(
      (p, idx) => `        <item identifier="ITEM_${idx + 1}" identifierref="RES_PAGE_${idx + 1}">
          <title>${p.title}</title>
        </item>`
    )
    .join('\n');

  const pageResources = pages
    .map(
      (p, idx) => `    <resource identifier="RES_PAGE_${idx + 1}" type="webcontent" href="${p.href}">
      <file href="${p.href}"/>
    </resource>`
    )
    .join('\n');

  const fileResources = attachments
    .map(
      (a, idx) => `    <resource identifier="RES_FILE_${idx + 1}" type="webcontent" href="${a.href}">
      <file href="${a.href}"/>
    </resource>`
    )
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${courseId}" xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1" xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lom:lom>
      <lom:general>
        <lom:title>
          <lom:string language="en">${courseTitle}</lom:string>
        </lom:title>
      </lom:general>
    </lom:lom>
  </metadata>
  <organizations default="ORG_1">
    <organization identifier="ORG_1" structure="rooted-hierarchy">
      <item identifier="MODULE_1">
        <title>Course Modules &amp; Labs</title>
${orgItems}
      </item>
    </organization>
  </organizations>
  <resources>
${pageResources}
${fileResources}
  </resources>
</manifest>`;
}

const COURSES = [
  // ===========================================================================
  // 1. CS 310: Data Structures & Algorithms
  // ===========================================================================
  {
    slug: 'cs-310-data-structures-algorithms',
    id: 'COURSE_CS310_FALL2026',
    title: 'CS 310: Data Structures &amp; Algorithms',
    pages: [
      {
        href: 'wiki_content/cs310-syllabus.html',
        title: 'Syllabus &amp; Autograder Policies',
        html: `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
</head>
<body style="font-family: Arial, sans-serif; color: #333333; background: #ffffff;">
  <h1>CS 310: Data Structures &amp; Algorithms</h1>
  <p style="color: #8a94a6;">Department of Computer Science — College of Computer Arts &amp; Sciences</p>

  <p><b style="font-size: 20px;">Course Overview &amp; Prerequisites</b></p>
  <p>Students implement balanced search trees, priority queues, hash tables, and graph traversal algorithms in C++20. For the full GCC compiler flags and Valgrind setup guide, <a href="https://example.edu/cs310/setup" target="_blank">click here</a>.</p>

  <h4>Grading Breakdown (Skipped Heading Level)</h4>
  <table border="1" cellpadding="6">
    <tr>
      <td>Component</td>
      <td>Weight</td>
      <td>Late Policy</td>
    </tr>
    <tr>
      <td>Programming Labs (C++ / Valgrind)</td>
      <td>45%</td>
      <td>-10% per 24h via GitHub Classroom</td>
    </tr>
    <tr>
      <td>Asymptotic Proof Problem Sets</td>
      <td>20%</td>
      <td>No late submissions</td>
    </tr>
    <tr>
      <td>Midterm &amp; Final Exams</td>
      <td>35%</td>
      <td>In-person proctored</td>
    </tr>
  </table>

  <p style="color: #d9534f; background-color: #fff3f3; padding: 8px;">Academic Integrity: Memory leaks (&gt;0 bytes lost in Valgrind) incur an automatic 25% deduction on all pointer-based assignments.</p>
  <p style="font-size: 9px; color: #777777;">Last updated for Fall 2026 ABET accreditation review.</p>
</body>
</html>`,
      },
      {
        href: 'wiki_content/week04-avl-trees.html',
        title: 'Week 4: AVL Trees &amp; Asymptotic Complexity',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Week 4: AVL Trees &amp; Asymptotic Complexity</title>
</head>
<body>
  <h1>Week 4: Self-Balancing Binary Search Trees (AVL)</h1>
  <p>An AVL tree maintains the invariant that for every node <em>v</em>, the heights of its left and right subtrees differ by at most 1.</p>

  <p><b style="font-size: 18px;">1. Left-Right (LR) Double Rotation</b></p>
  <img src="media/avl_lr_rotation_v2.png" alt="avl_lr_rotation_v2.png" width="520" height="280">
  <p>To inspect the step-by-step pointer reassignment trace, <a href="https://example.edu/cs310/avl-trace">read more</a>.</p>

  <h3>2. C++ Node Rotation Implementation</h3>
  <pre><code>Node* rotateRight(Node* y) {
    Node* x = y->left;
    Node* T2 = x->right;
    x->right = y;
    y->left = T2;
    y->height = 1 + std::max(height(y->left), height(y->right));
    x->height = 1 + std::max(height(x->left), height(x->right));
    return x;
}</code></pre>

  <h3>3. Worst-Case vs. Amortized Complexity</h3>
  <table border="1" cellpadding="6">
    <tr>
      <td>Data Structure</td>
      <td>Search (Worst)</td>
      <td>Insert (Worst)</td>
      <td>Space</td>
    </tr>
    <tr>
      <td>Unbalanced BST</td>
      <td>O(n)</td>
      <td>O(n)</td>
      <td>O(n)</td>
    </tr>
    <tr>
      <td>AVL Tree</td>
      <td>O(log n)</td>
      <td>O(log n)</td>
      <td>O(n)</td>
    </tr>
    <tr>
      <td>Hash Table (Chaining)</td>
      <td>O(n)</td>
      <td>O(1) amortized</td>
      <td>O(n)</td>
    </tr>
  </table>
</body>
</html>`,
      },
      {
        href: 'wiki_content/lab03-valgrind-debugging.html',
        title: 'Lab 3: Debugging Heap Corruption with Valgrind &amp; GDB',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Lab 3: Debugging Heap Corruption with Valgrind &amp; GDB</title>
</head>
<body>
  <h1>Lab 3: Diagnosing Heap Corruption &amp; Dangling Pointers</h1>
  <p>Below is sample terminal output from running <code>valgrind --leak-check=full ./avl_test</code> on a buggy destructor:</p>

  <img src="media/valgrind_memcheck_segfault.png" width="640" height="320">

  <p><b style="font-size: 18px;">Live GDB Walkthrough Video</b></p>
  <video src="media/gdb-backtrace-walkthrough.mp4" autoplay controls width="560"></video>

  <form action="/submit-lab-checkoff">
    <p>Lab TA Checkoff Verification:</p>
    <input type="text" placeholder="Enter GitHub commit SHA" tabindex="3">
    <button type="submit" tabindex="1"></button>
  </form>
</body>
</html>`,
      },
    ],
    attachments: [
      {
        href: 'files/cormen-red-black-proofs-scan.pdf',
        build: async () => createMinimalScannedPdf('CLRS Red-Black Tree Induction Proofs Scan'),
      },
      {
        href: 'files/lecture04-balanced-trees.pptx',
        build: async () => createUntaggedPptx('CS 310 Lecture 04: AVL &amp; Red-Black Rotations'),
      },
    ],
  },

  // ===========================================================================
  // 2. MATH 241: Multivariable Calculus & Vector Analysis
  // ===========================================================================
  {
    slug: 'math-241-multivariable-calculus',
    id: 'COURSE_MATH241_FALL2026',
    title: 'MATH 241: Multivariable Calculus &amp; Vector Analysis',
    pages: [
      {
        href: 'wiki_content/math241-schedule.html',
        title: 'Course Schedule &amp; Exam Rules',
        html: `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
</head>
<body>
  <marquee>REMINDER: Midterm II covers Triple Integrals in Spherical Coordinates and Stokes' Theorem — No graphing calculators permitted!</marquee>
  <h1>MATH 241: Multivariable Calculus &amp; Vector Analysis</h1>
  <p style="color: #ff6b6b;">Warning: Missing more than two Friday problem-solving recitations lowers your final course grade by one full letter.</p>

  <table border="1" cellpadding="6">
    <tr>
      <td>Week</td>
      <td>Topic</td>
      <td>Stewart Section</td>
    </tr>
    <tr>
      <td>Week 9</td>
      <td>Curl, Divergence &amp; Conservative Vector Fields</td>
      <td>16.5</td>
    </tr>
    <tr>
      <td>Week 11</td>
      <td>Stokes' Theorem &amp; Oriented Surfaces</td>
      <td>16.8</td>
    </tr>
  </table>
  <p>Download the past exam archive <a href="https://example.edu/math241/exams" target="_blank">here</a>.</p>
</body>
</html>`,
      },
      {
        href: 'wiki_content/module06-stokes-theorem.html',
        title: "Module 6: Stokes' Theorem &amp; Surface Flux",
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Module 6: Stokes' Theorem &amp; Surface Flux</title>
</head>
<body>
  <h1>Module 6: Stokes' Theorem &amp; Orientation</h1>
  <p>Let <em>S</em> be an oriented piecewise-smooth surface bounded by a simple, closed, piecewise-smooth boundary curve <em>C</em> with positive orientation:</p>

  <img src="media/stokes_theorem_equation_final.png" width="420" height="90">

  <p><b style="font-size: 18px;">Rotational Vector Field Visualization</b></p>
  <svg width="260" height="180" viewBox="0 0 260 180">
    <circle cx="130" cy="90" r="65" fill="none" stroke="#2563eb" stroke-width="2" />
    <line x1="65" y1="90" x2="195" y2="90" stroke="#94a3b8" />
    <line x1="130" y1="25" x2="130" y2="155" stroke="#94a3b8" />
  </svg>

  <h4>Interactive 3D Paraboloid Explorer</h4>
  <iframe src="https://www.geogebra.org/3d" width="600" height="360"></iframe>

  <p>Instructor Audio Commentary on Right-Hand Rule Orientation:</p>
  <audio src="media/stokes-orientation-notes.mp3" controls></audio>
</body>
</html>`,
      },
    ],
    attachments: [
      {
        href: 'files/stokes-handwritten-derivations-scan.pdf',
        build: async () => createMinimalScannedPdf('Stokes Theorem Handwritten Lecture Notes'),
      },
    ],
  },

  // ===========================================================================
  // 3. CHEM 212: Organic Chemistry II
  // ===========================================================================
  {
    slug: 'chem-212-organic-chemistry-ii',
    id: 'COURSE_CHEM212_FALL2026',
    title: 'CHEM 212: Organic Chemistry II',
    pages: [
      {
        href: 'wiki_content/chem212-lab-safety.html',
        title: 'Lab Safety &amp; Spectroscopy Syllabus',
        html: `<!DOCTYPE html>
<html>
<head></head>
<body>
  <h1>CHEM 212: Organic Chemistry II &amp; Laboratory</h1>
  <p style="color: #d4a017; background-color: #ffffff;">PPE REQUIREMENT: Splash goggles, nitrile gloves, and flame-resistant lab coats are mandatory before handling Grignard reagents or pyrophoric bases.</p>

  <p><b style="font-size: 19px;">IR Spectroscopy Characteristic Absorption Bands</b></p>
  <table border="1" cellpadding="6">
    <tr>
      <td>Functional Group</td>
      <td>Wavenumber (cm^-1)</td>
      <td>Peak Appearance</td>
    </tr>
    <tr>
      <td>O-H (Alcohol, H-bonded)</td>
      <td>3200 - 3550</td>
      <td>Strong, broad</td>
    </tr>
    <tr>
      <td>C=O (Ketone / Aldehyde)</td>
      <td>1710 - 1740</td>
      <td>Strong, sharp</td>
    </tr>
    <tr>
      <td>C#N (Nitrile)</td>
      <td>2210 - 2260</td>
      <td>Medium, sharp</td>
    </tr>
  </table>
  <p style="font-size: 10px; color: #888888;">Spectra calibration values adapted from SDBS National Institute of Advanced Industrial Science and Technology.</p>
</body>
</html>`,
      },
      {
        href: 'wiki_content/unit03-sn1-sn2-mechanisms.html',
        title: 'Unit 3: SN1 vs. SN2 Stereochemistry',
        html: `<!DOCTYPE html>
<html lang="en">
<head>
  <title>Unit 3: SN1 vs. SN2 Stereochemistry</title>
</head>
<body>
  <h1>Unit 3: Nucleophilic Substitution &amp; Walden Inversion</h1>
  <p>In a concerted SN2 reaction, the nucleophile attacks the electrophilic carbon 180 degrees opposite the leaving group, inverting the stereocenter.</p>

  <img src="media/sn2_backside_attack_mechanism.png" alt="sn2_backside_attack_mechanism.png" width="540" height="240">

  <h4>Reaction Rate &amp; Solvent Comparison</h4>
  <table border="1" cellpadding="6">
    <tr>
      <td>Mechanism</td>
      <td>Rate Law</td>
      <td>Preferred Substrate</td>
      <td>Stereochemistry</td>
    </tr>
    <tr>
      <td>SN2</td>
      <td>k[R-X][Nu-]</td>
      <td>Methyl &gt; 1° &gt; 2°</td>
      <td>100% Inversion</td>
    </tr>
    <tr>
      <td>SN1</td>
      <td>k[R-X]</td>
      <td>3° &gt; 2° (allylic/benzylic)</td>
      <td>Racemization</td>
    </tr>
  </table>

  <p>Need extra practice predicting enantiomeric excess? <a href="https://example.edu/chem212/practice">Click here</a>.</p>
  <button type="button" aria-label=""><span aria-hidden="true">⚛</span></button>
</body>
</html>`,
      },
    ],
    attachments: [
      {
        href: 'files/sdbs-nmr-reference-spectra-scan.pdf',
        build: async () => createMinimalScannedPdf('1H and 13C NMR Reference Spectra Scan'),
      },
    ],
  },
];

async function main() {
  for (const course of COURSES) {
    const zip = new JSZip();

    // Write standalone HTML pages + add into .imscc archive
    const courseHtmlDir = path.join(HTML_OUT_DIR, course.slug);
    fs.mkdirSync(courseHtmlDir, { recursive: true });

    for (const page of course.pages) {
      zip.file(page.href, page.html);
      const flatName = path.basename(page.href);
      fs.writeFileSync(path.join(courseHtmlDir, flatName), page.html, 'utf8');
    }

    // Build and add attachments (scanned PDFs + untagged PPTX)
    for (const att of course.attachments) {
      const buf = await att.build();
      zip.file(att.href, buf);
    }

    // Write imsmanifest.xml
    const manifestXml = buildManifest(course.id, course.title, course.pages, course.attachments);
    zip.file('imsmanifest.xml', manifestXml);

    const imsccBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
    const outPath = path.join(OUT_DIR, `${course.slug}.imscc`);
    fs.writeFileSync(outPath, imsccBuffer);

    console.log(`Generated ${outPath} (${course.pages.length} pages, ${course.attachments.length} attachments)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
