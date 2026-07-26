/**
 * Just enough DOM to execute collectVisibleJobPage().
 *
 * That function is injected into the job page, so it has no unit tests and nothing
 * in the repo ever ran it. It has now broken twice that way — most recently a const
 * declared after the function's `return`, which parses cleanly, passes every static
 * check, and throws ReferenceError on the first line that reads it. "It compiles"
 * was never evidence that it runs.
 *
 * Supports only the selector forms that function actually uses: tag, .class, #id,
 * [attr], [attr='value'], [attr*='value'], compound (tag[attr]), descendant
 * ("main article"), and comma-separated lists. Anything else should be added here
 * rather than worked around in a test.
 */

class StubText {
  constructor(text) {
    this.nodeType = 3;
    this.data = String(text);
    this.parent = null;
  }
  get textContent() { return this.data; }
  cloneNode() { return new StubText(this.data); }
  remove() { detach(this); }
}

class StubElement {
  constructor(tag, attrs = {}, children = []) {
    this.nodeType = 1;
    this.tag = String(tag).toLowerCase();
    this.attrs = { ...attrs };
    this.children = [];
    this.parent = null;
    for (const child of children) this.appendChild(typeof child === "string" ? new StubText(child) : child);
  }

  get className() { return this.attrs.class || ""; }
  getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }

  get textContent() {
    return this.children.map((child) => child.textContent).join("");
  }

  appendChild(node) {
    node.parent = this;
    this.children.push(node);
    return node;
  }

  remove() { detach(this); }

  cloneNode(deep = false) {
    const copy = new StubElement(this.tag, this.attrs);
    if (deep) for (const child of this.children) copy.appendChild(child.cloneNode(true));
    return copy;
  }

  /** Depth-first document order, matching what a browser returns. */
  descendants() {
    return this.children.flatMap((child) => (child.nodeType === 1 ? [child, ...child.descendants()] : []));
  }

  querySelectorAll(selectorList) {
    const found = [];
    for (const selector of String(selectorList).split(",").map((part) => part.trim()).filter(Boolean)) {
      for (const node of matchSelector(this, selector)) if (!found.includes(node)) found.push(node);
    }
    // Document order across the whole list, as a real NodeList would be.
    const order = this.descendants();
    return found.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function detach(node) {
  if (!node.parent) return;
  node.parent.children = node.parent.children.filter((child) => child !== node);
  node.parent = null;
}

/** "main article" — every node matching the last part that descends from an earlier match. */
function matchSelector(root, selector) {
  const parts = selector.split(/\s+/).filter(Boolean);
  let scope = [root];
  for (const part of parts) {
    scope = scope.flatMap((node) => node.descendants().filter((candidate) => matchesCompound(candidate, part)));
  }
  return scope;
}

function matchesCompound(node, compound) {
  // A compound is a tag and/or a run of .class / #id / [attr...] pieces.
  const pieces = compound.match(/^[a-zA-Z][\w-]*|\.[\w-]+|#[\w-]+|\[[^\]]+\]/g) || [];
  if (!pieces.length) return false;
  return pieces.every((piece) => matchesPiece(node, piece));
}

function matchesPiece(node, piece) {
  if (piece.startsWith(".")) return node.className.split(/\s+/).includes(piece.slice(1));
  if (piece.startsWith("#")) return node.attrs.id === piece.slice(1);
  if (piece.startsWith("[")) {
    const inner = piece.slice(1, -1);
    const match = inner.match(/^([\w-]+)(\*?=)?\s*(?:'([^']*)'|"([^"]*)"|([^\]]*))?$/);
    if (!match) return false;
    const [, name, operator, quoted, doubleQuoted, bare] = match;
    const actual = node.attrs[name];
    if (actual === undefined) return false;
    if (!operator) return true;
    const expected = quoted ?? doubleQuoted ?? bare ?? "";
    return operator === "*=" ? String(actual).includes(expected) : String(actual) === expected;
  }
  return node.tag === piece.toLowerCase();
}

export function element(tag, attrs, children) { return new StubElement(tag, attrs, children); }

/**
 * Installs the globals the injected function reads. Returns a restore function so a
 * test cannot leak its document into the next one.
 */
export function installDom({ body, title = "Engineer | Example Health", url = "https://example.com/jobs/1" }) {
  const previous = { document: globalThis.document, location: globalThis.location };
  const documentElement = new StubElement("html", { class: "" }, [body]);
  globalThis.document = {
    title,
    body,
    documentElement,
    createTextNode: (text) => new StubText(text),
    querySelectorAll: (selector) => documentElement.querySelectorAll(selector),
    querySelector: (selector) => documentElement.querySelector(selector)
  };
  globalThis.location = { href: url, hostname: new URL(url).hostname };
  return () => {
    globalThis.document = previous.document;
    globalThis.location = previous.location;
  };
}
