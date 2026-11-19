import JSZip from 'jszip';
import type { CoursePackage, CoursePage } from '../types';
import { auditHtml, isFullHtmlDocument } from './auditor';
import { auditArchiveAttachments } from './attachments';

function extractTitleFromHtml(html: string, fallback: string): string {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (titleMatch && titleMatch[1].trim() && !/^untitled$/i.test(titleMatch[1].trim())) {
    return titleMatch[1].trim();
  }
  const h1Match = html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1Match) {
    const clean = h1Match[1].replace(/<[^>]+>/g, '').trim();
    if (clean) return clean;
  }
  return fallback
    .replace(/^.*[\\/]/, '')
    .replace(/\.(html?|xhtml)$/i, '')
    .replace(/[-_]+/g, ' ');
}

function parseManifestMetadata(xmlText: string): {
  courseTitle?: string;
  pageTitles: Map<string, string>;
} {
  const pageTitles = new Map<string, string>();
  try {
    const parser = new DOMParser();
    const xml = parser.parseFromString(xmlText, 'application/xml');

    const titleNode =
      xml.querySelector('metadata title string, metadata lom general title string') ||
      xml.querySelector('organizations organization title');
    const courseTitle = titleNode?.textContent?.trim() || undefined;

    // Map resource identifier -> href
    const idToHref = new Map<string, string>();
    xml.querySelectorAll('resource').forEach((res) => {
      const id = res.getAttribute('identifier');
      const href = res.getAttribute('href') || res.querySelector('file')?.getAttribute('href');
      if (id && href) {
        idToHref.set(id, href.replace(/^\.?\//, ''));
      }
    });

    // Map item identifierref -> title
    xml.querySelectorAll('item').forEach((item) => {
      const ref = item.getAttribute('identifierref');
      const title = item.querySelector(':scope > title')?.textContent?.trim();
      if (ref && title && idToHref.has(ref)) {
        pageTitles.set(idToHref.get(ref)!, title);
      }
    });

    return { courseTitle, pageTitles };
  } catch {
    return { pageTitles };
  }
}

export function createCoursePage(
  path: string,
  html: string,
  titleOverride?: string
): CoursePage {
  const audit = auditHtml(html);
  return {
    id: `${path}-${Math.random().toString(36).slice(2, 8)}`,
    path,
    title: titleOverride || extractTitleFromHtml(html, path),
    originalHtml: html,
    remediatedHtml: html,
    isFullDocument: isFullHtmlDocument(html),
    isRemediated: false,
    originalAudit: audit,
    remediatedAudit: audit,
    changes: [],
  };
}

export async function parseCourseArchive(file: File): Promise<CoursePackage> {
  const buffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(buffer);

  let courseName = file.name.replace(/\.(imscc|zip)$/i, '');
  let pageTitles = new Map<string, string>();

  const manifestFile = zip.file('imsmanifest.xml');
  if (manifestFile) {
    const xmlText = await manifestFile.async('string');
    const meta = parseManifestMetadata(xmlText);
    if (meta.courseTitle) courseName = meta.courseTitle;
    pageTitles = meta.pageTitles;
  }

  const htmlEntries = Object.values(zip.files).filter(
    (entry) =>
      !entry.dir &&
      /\.(html?|xhtml)$/i.test(entry.name) &&
      !entry.name.startsWith('__MACOSX/')
  );

  const pages: CoursePage[] = [];
  for (const entry of htmlEntries) {
    const html = await entry.async('string');
    const normalizedPath = entry.name.replace(/^\.?\//, '');
    const manifestTitle = pageTitles.get(normalizedPath);
    pages.push(createCoursePage(normalizedPath, html, manifestTitle));
  }

  pages.sort((a, b) => a.path.localeCompare(b.path));
  const attachments = await auditArchiveAttachments(zip);

  return {
    name: courseName,
    sourceType: file.name.toLowerCase().endsWith('.imscc') ? 'imscc' : 'zip',
    originalFileName: file.name,
    zipArrayBuffer: buffer,
    attachments,
    pages,
  };
}

export async function parseHtmlFiles(files: File[]): Promise<CoursePackage> {
  const pages: CoursePage[] = [];
  for (const file of files) {
    const html = await file.text();
    pages.push(createCoursePage(file.name, html));
  }
  const name =
    files.length === 1
      ? files[0].name.replace(/\.(html?|xhtml)$/i, '')
      : `Course Upload (${files.length} pages)`;

  return {
    name,
    sourceType: 'html',
    originalFileName: files.length === 1 ? files[0].name : 'course-pages.zip',
    pages,
  };
}

function registerNewPagesInManifest(xmlText: string, pages: CoursePage[]): string {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, 'application/xml');
    const resourcesEl = doc.querySelector('resources');
    if (!resourcesEl) return xmlText;

    const existingHrefs = new Set<string>();
    resourcesEl.querySelectorAll('resource').forEach((res) => {
      const href = res.getAttribute('href') || res.querySelector('file')?.getAttribute('href');
      if (href) existingHrefs.add(href.replace(/^\.?\//, ''));
    });

    const orgEl = doc.querySelector('organizations > organization');
    const ns = doc.documentElement.namespaceURI;
    const createEl = (tag: string) =>
      ns ? doc.createElementNS(ns, tag) : doc.createElement(tag);

    let modified = false;
    pages.forEach((page, idx) => {
      const cleanPath = page.path.replace(/^\.?\//, '');
      if (existingHrefs.has(cleanPath)) return;

      const resId = `res-accessed-${idx}-${Math.random().toString(36).slice(2, 7)}`;
      const resEl = createEl('resource');
      resEl.setAttribute('identifier', resId);
      resEl.setAttribute('type', 'webcontent');
      resEl.setAttribute('href', cleanPath);
      const fileEl = createEl('file');
      fileEl.setAttribute('href', cleanPath);
      resEl.appendChild(fileEl);
      resourcesEl.appendChild(resEl);

      if (orgEl) {
        const itemEl = createEl('item');
        itemEl.setAttribute('identifier', `item-${resId}`);
        itemEl.setAttribute('identifierref', resId);
        const titleEl = createEl('title');
        titleEl.textContent = page.title;
        itemEl.appendChild(titleEl);
        orgEl.appendChild(itemEl);
      }
      modified = true;
    });

    if (!modified) return xmlText;
    return new XMLSerializer().serializeToString(doc);
  } catch {
    return xmlText;
  }
}

export async function exportRemediatedPackage(pkg: CoursePackage): Promise<Blob> {
  if (pkg.zipArrayBuffer) {
    const zip = await JSZip.loadAsync(pkg.zipArrayBuffer);
    for (const page of pkg.pages) {
      zip.file(page.path, page.remediatedHtml);
    }
    const manifestFile = zip.file('imsmanifest.xml');
    if (manifestFile) {
      const xmlText = await manifestFile.async('string');
      const updatedManifest = registerNewPagesInManifest(xmlText, pkg.pages);
      zip.file('imsmanifest.xml', updatedManifest);
    }
    if (pkg.extraFiles) {
      for (const [relPath, content] of Object.entries(pkg.extraFiles)) {
        zip.file(relPath, content);
      }
    }
    if (pkg.extraBinaryFiles) {
      for (const [relPath, bytes] of Object.entries(pkg.extraBinaryFiles)) {
        zip.file(relPath, bytes);
      }
    }
    return zip.generateAsync({ type: 'blob' });
  }

  // Build a fresh ZIP archive for multi-page HTML/sample courses
  const zip = new JSZip();
  for (const page of pkg.pages) {
    const safePath = page.path.endsWith('.html') ? page.path : `${page.path}.html`;
    zip.file(safePath, page.remediatedHtml);
  }
  if (pkg.extraFiles) {
    for (const [relPath, content] of Object.entries(pkg.extraFiles)) {
      zip.file(relPath, content);
    }
  }
  if (pkg.extraBinaryFiles) {
    for (const [relPath, bytes] of Object.entries(pkg.extraBinaryFiles)) {
      zip.file(relPath, bytes);
    }
  }
  return zip.generateAsync({ type: 'blob' });
}
