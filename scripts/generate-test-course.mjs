import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';

const outDir = path.resolve('test-course');
const pagesDir = path.join(outDir, 'html-pages');
fs.mkdirSync(pagesDir, { recursive: true });

const imsManifest = `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="hist204_manifest"
  xmlns="http://www.imsglobal.org/xsd/imsccv1p1/imscp_v1p1"
  xmlns:lom="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/resource"
  xmlns:lomimscc="http://ltsc.ieee.org/xsd/imsccv1p1/LOM/manifest">
  <metadata>
    <schema>IMS Common Cartridge</schema>
    <schemaversion>1.1.0</schemaversion>
    <lomimscc:lom>
      <lomimscc:general>
        <lomimscc:title>
          <lomimscc:string>HIST 204: Modern World History (1750–Present)</lomimscc:string>
        </lomimscc:title>
      </lomimscc:general>
    </lomimscc:lom>
  </metadata>
  <organizations>
    <organization identifier="org_1" structure="rooted-hierarchy">
      <item identifier="root">
        <item identifier="mod_welcome">
          <title>Course Overview</title>
          <item identifier="item_syllabus" identifierref="res_syllabus">
            <title>Course Syllabus &amp; Schedule</title>
          </item>
        </item>
        <item identifier="mod_week1">
          <title>Module 1: The Industrial Revolution</title>
          <item identifier="item_week1" identifierref="res_week1">
            <title>Week 1 Lecture: Steam, Rail &amp; Urbanization</title>
          </item>
          <item identifier="item_essay" identifierref="res_essay">
            <title>Assignment 1: Primary Source Analysis</title>
          </item>
        </item>
        <item identifier="mod_midterm">
          <title>Exam Preparation</title>
          <item identifier="item_midterm" identifierref="res_midterm">
            <title>Midterm Study Guide &amp; Key Dates</title>
          </item>
        </item>
      </item>
    </organization>
  </organizations>
  <resources>
    <resource identifier="res_syllabus" type="webcontent" href="wiki_content/course-syllabus.html">
      <file href="wiki_content/course-syllabus.html"/>
    </resource>
    <resource identifier="res_week1" type="webcontent" href="wiki_content/week-1-industrial-revolution.html">
      <file href="wiki_content/week-1-industrial-revolution.html"/>
    </resource>
    <resource identifier="res_essay" type="webcontent" href="assignments/primary-source-essay.html">
      <file href="assignments/primary-source-essay.html"/>
    </resource>
    <resource identifier="res_midterm" type="webcontent" href="assessments/midterm-study-guide.html">
      <file href="assessments/midterm-study-guide.html"/>
    </resource>
  </resources>
</manifest>
`;

const files = {
  'wiki_content/course-syllabus.html': `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Untitled Document</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.55; max-width: 800px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td, th { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
  </style>
</head>
<body>
  <marquee style="color: #eab308; font-weight: bold;">Reminder: First primary source discussion post is due Wednesday at 11:59 PM!</marquee>

  <h1>HIST 204: Modern World History (1750–Present)</h1>
  <p style="color: #94a3b8;">Spring Term • Prof. Marcus Vance • Office Hours: Mon/Wed 1:00–3:00 PM (Room 312)</p>

  <p><strong>Course Overview</strong></p>
  <p>
    This course traces major global transformations from the Industrial Revolution through the
    twenty-first century, examining trade networks, political revolutions, decolonization, and
    technological change. For the university attendance and accommodation handbook,
    <a href="https://school.edu/policies/student-accommodations-guide.pdf" target="_blank">click here</a>.
  </p>

  <h4>Grading Policy</h4>
  <table>
    <tr>
      <td>Component</td>
      <td>Percentage</td>
      <td>Notes</td>
    </tr>
    <tr>
      <td>Primary Source Essays (3)</td>
      <td>40%</td>
      <td>Submitted via LMS Turnitin dropbox</td>
    </tr>
    <tr>
      <td>Midterm &amp; Final Exam</td>
      <td>45%</td>
      <td>Essay + short-answer timeline IDs</td>
    </tr>
    <tr>
      <td>Weekly Seminar Discussions</td>
      <td>15%</td>
      <td>Lowest 2 weeks automatically dropped</td>
    </tr>
  </table>

  <p style="font-size: 9px; color: #a1a1aa;">
    Fine print: Late essays incur a 5% deduction per day unless an approved extension is arranged in advance.
  </p>
</body>
</html>`,

  'wiki_content/week-1-industrial-revolution.html': `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Page</title>
  <style>
    body { font-family: Georgia, serif; line-height: 1.6; max-width: 800px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
    .note-box { background: #ffffff; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 6px; margin: 16px 0; }
  </style>
</head>
<body>
  <h1>Week 1: Steam, Rail &amp; Urbanization</h1>
  <p>
    Between 1760 and 1840, mechanized textile production and coal-fired steam engines reshaped
    labor, migration, and global trade. Review the map and short lecture clip below.
  </p>

  <img src="images/british-railway-expansion-1850.png" width="480" height="220" style="background:#e2e8f0; display:block; margin:16px 0;" />

  <p><strong>Primary Reading &amp; Archival Map</strong></p>
  <p>
    Explore the digitized parliamentary factory testimonies at
    <a href="https://historyarchive.edu/collections/sadler-committee-report-1832" target="_blank">https://historyarchive.edu/collections/sadler-committee-report-1832</a>.
  </p>

  <img src="images/IMG_9042.jpg" alt="IMG_9042.jpg" width="340" height="190" style="background:#e2e8f0; display:block; margin:16px 0;" />

  <h4>Documentary Excerpt</h4>
  <iframe width="560" height="260" src="https://www.youtube.com/embed/zhL5DCizj5c"></iframe>

  <div class="note-box">
    <p style="color: #cbd5e1;">
      Exam Tip: Be prepared to compare urban working conditions in Manchester with Osaka during Meiji industrialization.
    </p>
  </div>
</body>
</html>`,

  'assignments/primary-source-essay.html': `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Document</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
  </style>
</head>
<body>
  <h1>Assignment 1: Primary Source Analysis Essay</h1>

  <p><strong>Instructor Walkthrough Video</strong></p>
  <video autoplay src="media/essay-rubric-walkthrough.mp4" width="480"></video>

  <p>Listen to the 1898 archival audio recording excerpt:</p>
  <audio autoplay src="media/archival-speech-clip.mp3"></audio>

  <p>
    Download the Chicago-style citation template
    <a href="files/chicago-citation-template.docx">read more</a>.
  </p>

  <h4>Topic Selection Form</h4>
  <form>
    <p>
      Student Full Name:<br />
      <input type="text" name="student_full_name" placeholder="Enter your full name" tabindex="5" />
    </p>
    <p>
      Chosen Primary Source Set:<br />
      <select name="source_set" tabindex="2">
        <option>Set A: 1832 Sadler Committee Interviews</option>
        <option>Set B: 1868 Meiji Charter Oath</option>
        <option>Set C: 1919 Versailles Petition Letters</option>
      </select>
    </p>
  </form>
</body>
</html>`,

  'assessments/midterm-study-guide.html': `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Index</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td, th { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
  </style>
</head>
<body>
  <h1>Midterm Exam Study Guide</h1>
  <h3></h3>

  <p style="color: #f87171;">
    Important: Bring two blue exam booklets and a pen. Electronic devices are not permitted unless covered by an approved accommodation plan.
  </p>

  <table>
    <thead>
      <tr>
        <th>Year</th>
        <th>Historical Event</th>
        <th>Region</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>1776</td>
        <td>James Watt commercializes improved steam engine</td>
        <td>Great Britain</td>
      </tr>
      <tr>
        <td>1804</td>
        <td>Haitian Independence declared</td>
        <td>Caribbean</td>
      </tr>
      <tr>
        <td>1868</td>
        <td>Meiji Restoration begins</td>
        <td>Japan</td>
      </tr>
    </tbody>
  </table>

  <p style="font-size: 10px; color: #9ca3af;">
    Practice essay prompts will be posted 72 hours before the exam in the Modules tab.
  </p>
</body>
</html>`,
};

const zip = new JSZip();
zip.file('imsmanifest.xml', imsManifest);

for (const [relPath, content] of Object.entries(files)) {
  zip.file(relPath, content);
  const flatName = path.basename(relPath);
  fs.writeFileSync(path.join(pagesDir, flatName), content, 'utf8');
}

const imsccBuffer = await zip.generateAsync({ type: 'nodebuffer' });
const imsccPath = path.join(outDir, 'hist-204-modern-world-history.imscc');
fs.writeFileSync(imsccPath, imsccBuffer);

console.log(`Created LMS package: ${imsccPath}`);
console.log(`Created ${Object.keys(files).length} standalone HTML pages in: ${pagesDir}`);
