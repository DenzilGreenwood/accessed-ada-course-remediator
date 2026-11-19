import katex from 'katex';

const RAW_LATEX_REGEX = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|\\\(([\s\S]+?)\\\)/g;

export function renderLatexToMathMl(latex: string, displayMode = false): string {
  const rendered = katex.renderToString(latex.trim(), {
    output: 'mathml',
    displayMode,
    throwOnError: false,
  });
  // KaTeX wraps MathML in <span class="katex">...</span>; extract inner <math> if present
  const mathMatch = rendered.match(/<math[\s\S]*<\/math>/i);
  return mathMatch ? mathMatch[0] : rendered;
}

export function renderLatexPreviewHtml(latex: string, displayMode = false): string {
  return katex.renderToString(latex.trim(), {
    output: 'htmlAndMathml',
    displayMode,
    throwOnError: false,
  });
}

export function latexToAccessibleLabel(latex: string): string {
  let spoken = latex.trim();
  spoken = spoken
    .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, '$1 over $2')
    .replace(/\\sqrt\{([^}]+)\}/g, 'square root of $1')
    .replace(/\\sum_\{([^}]+)\}\^\{([^}]+)\}/g, 'sum from $1 to $2 of')
    .replace(/\\int_\{([^}]+)\}\^\{([^}]+)\}/g, 'integral from $1 to $2 of')
    .replace(/\^2\b/g, ' squared')
    .replace(/\^3\b/g, ' cubed')
    .replace(/\^\{([^}]+)\}/g, ' to the power of $1')
    .replace(/\^([a-zA-Z0-9])/g, ' to the power of $1')
    .replace(/_\{([^}]+)\}/g, ' sub $1')
    .replace(/_([a-zA-Z0-9])/g, ' sub $1')
    .replace(/\\(pm|times|cdot|div|leq|geq|neq|approx|infty|alpha|beta|gamma|delta|theta|lambda|mu|pi|sigma|omega|Delta|Sigma|Omega|rightarrow|to)/g, (_, cmd: string) => {
      const map: Record<string, string> = {
        pm: ' plus or minus ',
        times: ' times ',
        cdot: ' times ',
        div: ' divided by ',
        leq: ' less than or equal to ',
        geq: ' greater than or equal to ',
        neq: ' not equal to ',
        approx: ' approximately equal to ',
        infty: ' infinity ',
        alpha: ' alpha ',
        beta: ' beta ',
        gamma: ' gamma ',
        delta: ' delta ',
        theta: ' theta ',
        lambda: ' lambda ',
        mu: ' mu ',
        pi: ' pi ',
        sigma: ' sigma ',
        omega: ' omega ',
        Delta: ' Delta ',
        Sigma: ' Sigma ',
        Omega: ' Omega ',
        rightarrow: ' approaches ',
        to: ' to ',
      };
      return map[cmd] || ` ${cmd} `;
    })
    .replace(/[{}]/g, ' ')
    .replace(/\\/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return spoken ? `Math equation: ${spoken}` : 'Math equation';
}

export function hasRawLatexInText(text: string): boolean {
  RAW_LATEX_REGEX.lastIndex = 0;
  return RAW_LATEX_REGEX.test(text);
}

function isInsideSkippedElement(node: Node): boolean {
  let cur: Element | null = node.parentElement;
  while (cur) {
    const tag = cur.tagName.toLowerCase();
    if (
      tag === 'pre' ||
      tag === 'code' ||
      tag === 'script' ||
      tag === 'style' ||
      tag === 'math' ||
      tag === 'textarea' ||
      cur.classList.contains('katex') ||
      cur.classList.contains('accessed-math')
    ) {
      return true;
    }
    cur = cur.parentElement;
  }
  return false;
}

export function collectRawLatexTextNodes(doc: Document): Text[] {
  const result: Text[] = [];
  if (!doc.body) return result;
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  let node: Node | null = walker.nextNode();
  while (node) {
    if (
      node.nodeType === Node.TEXT_NODE &&
      node.textContent &&
      !isInsideSkippedElement(node) &&
      hasRawLatexInText(node.textContent)
    ) {
      result.push(node as Text);
    }
    node = walker.nextNode();
  }
  return result;
}

export function upgradeRawLatexInDocument(doc: Document): number {
  const nodes = collectRawLatexTextNodes(doc);
  let upgradedCount = 0;

  for (const textNode of nodes) {
    const raw = textNode.textContent || '';
    RAW_LATEX_REGEX.lastIndex = 0;
    const frag = doc.createDocumentFragment();
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = RAW_LATEX_REGEX.exec(raw)) !== null) {
      if (match.index > lastIndex) {
        frag.appendChild(doc.createTextNode(raw.slice(lastIndex, match.index)));
      }
      const isDisplay = Boolean(match[1] !== undefined || match[2] !== undefined);
      const latex = (match[1] ?? match[2] ?? match[3] ?? '').trim();
      if (latex) {
        const mathMl = renderLatexToMathMl(latex, isDisplay);
        const span = doc.createElement(isDisplay ? 'div' : 'span');
        span.className = 'accessed-math';
        span.setAttribute('role', 'math');
        span.setAttribute('aria-label', latexToAccessibleLabel(latex));
        span.innerHTML = mathMl;
        frag.appendChild(span);
        upgradedCount += 1;
      } else {
        frag.appendChild(doc.createTextNode(match[0]));
      }
      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < raw.length) {
      frag.appendChild(doc.createTextNode(raw.slice(lastIndex)));
    }
    textNode.parentNode?.replaceChild(frag, textNode);
  }

  return upgradedCount;
}
