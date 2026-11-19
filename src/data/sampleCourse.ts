import type { CoursePackage } from '../types';
import { createCoursePage } from '../engine/imscc';

const SYLLABUS_HTML = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
  <title>Untitled Document</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.5; max-width: 780px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    td, th { border: 1px solid #cbd5e1; padding: 8px 10px; text-align: left; }
  </style>
</head>
<body>
  <marquee style="color: #eab308; font-weight: bold;">Welcome to BIO 101! Lab safety quiz is due Friday at 5:00 PM!</marquee>

  <h1>BIO 101: Introduction to Cellular Biology</h1>
  <p style="color: #94a3b8;">Fall Semester • Instructor: Dr. Elena Morales • Office Hours: Tue/Thu 2:00–4:00 PM</p>

  <p><strong>Course Description</strong></p>
  <p>
    This course introduces foundational principles of cell structure, genetics, and metabolism.
    To review the university academic integrity policy,
    <a href="https://university.edu/policies/academic-integrity-handbook.pdf" target="_blank">click here</a>.
  </p>

  <h4>Grading Breakdown</h4>
  <table>
    <tr>
      <td>Assessment Category</td>
      <td>Weight</td>
      <td>Drop Policy</td>
    </tr>
    <tr>
      <td>Weekly Lab Reports</td>
      <td>35%</td>
      <td>Lowest 1 dropped</td>
    </tr>
    <tr>
      <td>Midterm &amp; Final Exams</td>
      <td>45%</td>
      <td>None dropped</td>
    </tr>
    <tr>
      <td>Participation &amp; Quizzes</td>
      <td>20%</td>
      <td>Lowest 2 dropped</td>
    </tr>
  </table>

  <p style="font-size: 9px; color: #9ca3af;">
    Note: Syllabus dates are subject to change with 48 hours written notice in the LMS announcements feed.
  </p>
</body>
</html>`;

const WEEK1_LECTURE_HTML = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Page</title>
  <style>
    body { font-family: Georgia, serif; line-height: 1.6; max-width: 780px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
    img { max-width: 100%; border-radius: 8px; }
  </style>
</head>
<body>
  <h1>Week 1 Lecture: Eukaryotic Cell Organelles</h1>
  <p>
    Eukaryotic cells contain membrane-bound organelles that divide metabolic work into specialized compartments.
    Watch the recorded overview below before Thursday's lab.
  </p>

  <img src="diagrams/mitochondria-cross-section.png" width="460" height="220" style="background:#e2e8f0; display:block; margin:16px 0;" />

  <p><strong>Key Organelle Functions</strong></p>
  <p>
    Mitochondria generate ATP through oxidative phosphorylation. For the full interactive textbook chapter, visit
    <a href="https://openstax.org/books/biology-2e/pages/4-3-eukaryotic-cells" target="_blank">https://openstax.org/books/biology-2e/pages/4-3-eukaryotic-cells</a>.
  </p>

  <img src="photos/IMG_4821.jpg" alt="IMG_4821.jpg" width="320" height="180" style="background:#e2e8f0; display:block; margin:16px 0;" />

  <h3>Recorded Mini-Lecture</h3>
  <iframe width="560" height="240" src="https://www.youtube.com/embed/URUJD5NEXC8"></iframe>

  <p style="color: #cbd5e1; background-color: #ffffff;">
    Tip: Focus on the structural differences between rough ER and smooth ER for Quiz 1.
  </p>
</body>
</html>`;

const LAB1_ASSIGNMENT_HTML = `<!doctype html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Document</title>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; max-width: 780px; margin: 24px auto; padding: 0 16px; color: #1e293b; }
    .callout { background: #fef9c3; padding: 12px 16px; border-radius: 6px; margin: 16px 0; }
  </style>
</head>
<body>
  <h1>Lab 1: Microscope Calibration &amp; Onion Epidermis</h1>

  <div class="callout">
    <p style="color: #ca8a04;">Important Safety Reminder: Always carry compound microscopes with two hands.</p>
  </div>

  <p><strong>Pre-Lab Demo Video</strong></p>
  <video autoplay src="media/microscope-focus-demo.mp4" width="480"></video>

  <h4>Pre-Lab Check-In</h4>
  <form>
    <p>
      Student Name:<br />
      <input type="text" name="student_name" placeholder="Enter your full name" tabindex="3" />
    </p>
    <p>
      Lab Section:<br />
      <select name="lab_section" tabindex="1">
        <option>Section A (Tuesday)</option>
        <option>Section B (Thursday)</option>
      </select>
    </p>
    <p>
      Download the printable lab worksheet:
      <a href="files/lab1-microscope-worksheet.pdf">here</a>.
    </p>
  </form>
</body>
</html>`;

export function buildSampleCourse(): CoursePackage {
  return {
    name: 'BIO 101: Introduction to Cellular Biology',
    sourceType: 'sample',
    originalFileName: 'bio-101-canvas-export.imscc',
    pages: [
      createCoursePage('wiki_content/course-syllabus.html', SYLLABUS_HTML, 'Course Syllabus'),
      createCoursePage('wiki_content/week-1-cell-organelles.html', WEEK1_LECTURE_HTML, 'Week 1: Cell Organelles'),
      createCoursePage('assignments/lab-1-microscope.html', LAB1_ASSIGNMENT_HTML, 'Lab 1: Microscope Calibration'),
    ],
  };
}
