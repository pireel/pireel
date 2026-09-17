/**
 * In-page preview stage: the assembled composition document mounted in a Shadow DOM instead of a
 * sandboxed iframe.
 *
 * The preview used to be an `<iframe srcdoc sandbox>`. That bought a trust boundary and cost the
 * editor its responsiveness: every structural change parsed a new document in a new browsing
 * context, reloaded GSAP and every font, needed a ping/pong handshake before it could be shown, and
 * could not read a parent-created blob URL or File. The stage host keeps the same document, the
 * same scripts and the same message protocol, but mounts them in the page: styles live in a shadow
 * root (isolated both ways), scripts run against a document/window facade scoped to that root, and
 * "postMessage" is a direct call. Generated block code therefore runs in the application's origin,
 * the same trust model as the desktop reference editors; the composition is the user's own project.
 *
 * The host is a drop-in for the iframe surface the workbench already drives: `srcdoc` (assign to
 * mount, empty to clear), a `load` event, `contentWindow.postMessage`, and messages back through
 * `onMessage`. Coordinates: the composition lays out at its own pixel size and the host element is
 * scaled with a CSS transform, exactly like the iframe was. Runtime code that measures elements or
 * pointer deltas converts through `window.__hfDocRect` / `window.__hfScale`, which the facade
 * provides (they are undefined in a real document, where no conversion is needed).
 */

export interface PreviewMessageEvent {
  data: unknown;
  source: PreviewContentWindow;
}

export interface PreviewContentWindow {
  postMessage(message: unknown, targetOrigin?: string, transfer?: Transferable[]): void;
}

type Listener = (event: { data: unknown; source: unknown }) => void;

type GsapContext = { revert(): void };
export type GsapLike = {
  context(fn: () => void, scope?: Element | ShadowRoot): GsapContext;
  timeline(options?: Record<string, unknown>): unknown;
  [key: string]: unknown;
};

let gsapLoad: Promise<GsapLike | null> | null = null;
/** The page loads the self-hosted GSAP once; every stage and inline preview shares it. */
export function loadGsap(): Promise<GsapLike | null> {
  const w = window as unknown as { gsap?: GsapLike };
  if (w.gsap) return Promise.resolve(w.gsap);
  gsapLoad ??= new Promise((resolve) => {
    const el = document.createElement('script');
    el.src = '/vendor/gsap.min.js';
    el.onload = () => resolve((window as unknown as { gsap?: GsapLike }).gsap ?? null);
    el.onerror = () => resolve(null);
    document.head.appendChild(el);
  });
  return gsapLoad;
}

const STAGE_BODY_CLASS = 'hf-stage-body';

/**
 * Selectors that name the document (`html`, `body`) match nothing inside a shadow root. The
 * assembler writes `html, body { width; height; overflow; background }` and `body.hf-editor …`;
 * both re-target to the stage body element.
 */
export function rewriteDocumentSelectors(css: string): string {
  return css.replace(/(^|[\s,}{;>+~])(html|body)(?=[\s{.,:[>#+~]|$)/g, (_match, lead: string) => `${lead}.${STAGE_BODY_CLASS}`);
}

/** `@font-face` rules only take effect at document level: lift them out of a stylesheet. */
export function splitFontFaces(css: string): { css: string; fontFaces: string[] } {
  const fontFaces: string[] = [];
  const rest = css.replace(/@font-face\s*\{[^}]*\}/g, (rule) => {
    fontFaces.push(rule);
    return '';
  });
  return { css: rest, fontFaces };
}

const hoistedFontFaces = new Map<string, HTMLStyleElement>();
const hoistedLinks = new Map<string, HTMLLinkElement>();

function hoistFontFace(rule: string): void {
  const key = rule.replace(/\s+/g, ' ').trim();
  if (hoistedFontFaces.get(key)?.isConnected) return;
  const style = document.createElement('style');
  style.dataset.hfStageFont = '1';
  style.textContent = rule;
  document.head.appendChild(style);
  hoistedFontFaces.set(key, style);
}

function hoistStylesheetLink(link: HTMLLinkElement): void {
  const href = link.getAttribute('href') ?? '';
  if (!href || hoistedLinks.get(href)?.isConnected) return;
  const clone = document.createElement('link');
  clone.rel = 'stylesheet';
  clone.href = href;
  if (link.crossOrigin) clone.crossOrigin = link.crossOrigin;
  document.head.appendChild(clone);
  hoistedLinks.set(href, clone);
}

export class PreviewStageHost {
  readonly element: HTMLDivElement;
  readonly contentWindow: PreviewContentWindow;
  /** Messages the mounted document sends to its parent. */
  onMessage: ((event: PreviewMessageEvent) => void) | null = null;

  private readonly shadow: ShadowRoot;
  private body: HTMLDivElement | null = null;
  private context: GsapContext | null = null;
  private messageListeners: Listener[] = [];
  private loadListeners = new Set<() => void>();
  private facadeWindow: Record<string, unknown> | null = null;
  private adoptStyle: ((node: HTMLStyleElement) => HTMLStyleElement) | null = null;
  private mountToken = 0;
  private srcdocValue = '';

  constructor(element?: HTMLDivElement) {
    this.element = element ?? document.createElement('div');
    this.element.tabIndex = -1;
    this.element.dataset.hfStage = '1';
    this.shadow = this.element.attachShadow({ mode: 'open' });
    this.contentWindow = {
      postMessage: (message) => this.deliver(message),
    };
  }

  get srcdoc(): string {
    return this.srcdocValue;
  }

  /** Assigning a document mounts it (asynchronously, like an iframe); an empty string clears the stage. */
  set srcdoc(html: string) {
    this.srcdocValue = html;
    const token = ++this.mountToken;
    this.unmount();
    if (!html) return;
    void loadGsap().then((gsap) => {
      if (token !== this.mountToken) return;
      try {
        this.mount(html, gsap);
      } catch (error) {
        console.warn('[studio] preview stage failed to mount', error);
        this.unmount();
      }
      // `load` fires after the current task, as the iframe's did: callers register the listener
      // after assigning srcdoc.
      setTimeout(() => {
        if (token === this.mountToken) for (const listener of this.loadListeners) listener();
      }, 0);
    });
  }

  addEventListener(type: 'load', listener: () => void): void {
    if (type === 'load') this.loadListeners.add(listener);
  }

  removeEventListener(type: 'load', listener: () => void): void {
    if (type === 'load') this.loadListeners.delete(listener);
  }

  focus(): void {
    this.element.focus({ preventScroll: true });
  }

  /** Current scale between composition pixels and page pixels (the host's CSS transform). */
  scale(): number {
    const layoutWidth = this.element.offsetWidth || 1;
    return (this.element.getBoundingClientRect().width || layoutWidth) / layoutWidth;
  }

  dispose(): void {
    this.mountToken += 1;
    this.unmount();
    this.loadListeners.clear();
    this.onMessage = null;
  }

  private deliver(message: unknown): void {
    const listeners = this.messageListeners;
    if (!listeners.length) return;
    const facade = this.facadeWindow;
    const event = { data: message, source: facade?.parent ?? null };
    queueMicrotask(() => {
      if (this.messageListeners !== listeners) return; // the document was replaced meanwhile
      for (const listener of [...listeners]) {
        try {
          listener(event);
        } catch (error) {
          console.warn('[studio] preview runtime handler failed', error);
        }
      }
    });
  }

  private unmount(): void {
    try {
      this.context?.revert();
    } catch {
      /* animations already gone */
    }
    this.context = null;
    this.messageListeners = [];
    this.facadeWindow = null;
    this.body = null;
    this.shadow.replaceChildren();
  }

  private mount(html: string, gsap: GsapLike | null): void {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    const width = Number(parsed.getElementById('root')?.getAttribute('data-width')) || this.element.offsetWidth || 1;
    const height = Number(parsed.getElementById('root')?.getAttribute('data-height')) || this.element.offsetHeight || 1;

    const fragment = document.createDocumentFragment();
    const adoptStyle = (node: HTMLStyleElement): HTMLStyleElement => {
      const { css, fontFaces } = splitFontFaces(node.textContent ?? '');
      fontFaces.forEach(hoistFontFace);
      const style = document.createElement('style');
      if (node.id) style.id = node.id;
      style.textContent = rewriteDocumentSelectors(css);
      return style;
    };
    this.adoptStyle = adoptStyle;
    const reset = document.createElement('style');
    reset.textContent = `:host{all:initial;display:block;position:relative;overflow:hidden;contain:layout paint;}` +
      `.${STAGE_BODY_CLASS}{position:relative;width:100%;height:100%;overflow:hidden;margin:0;}`;
    fragment.appendChild(reset);

    // Head: stylesheets stay in the shadow root (rewritten for the stage body), font faces and font
    // stylesheet links go to the document, scripts are collected and run in order below.
    const scripts: Array<{ src: string | null; code: string }> = [];
    for (const node of Array.from(parsed.head.children)) {
      if (node instanceof HTMLStyleElement) {
        fragment.appendChild(adoptStyle(node));
      } else if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
        hoistStylesheetLink(node);
      } else if (node instanceof HTMLScriptElement) {
        scripts.push({ src: node.getAttribute('src'), code: node.textContent ?? '' });
      }
    }
    const body = document.createElement('div');
    body.className = STAGE_BODY_CLASS;
    for (const node of Array.from(parsed.body.childNodes)) {
      if (node instanceof HTMLScriptElement) {
        scripts.push({ src: node.getAttribute('src'), code: node.textContent ?? '' });
        continue;
      }
      if (node instanceof HTMLStyleElement) {
        body.appendChild(adoptStyle(node));
        continue;
      }
      body.appendChild(document.importNode(node, true));
    }
    // Scripts nested inside body markup (a block's own <script>) never ran in the sandbox either:
    // the assembler lifts timeline bodies into their own scripts. Strip them so nothing runs twice.
    for (const stray of Array.from(body.querySelectorAll('script'))) {
      scripts.push({ src: stray.getAttribute('src'), code: stray.textContent ?? '' });
      stray.remove();
    }
    fragment.appendChild(body);
    this.shadow.replaceChildren(fragment);
    this.body = body;

    const facades = this.createFacades(width, height, gsap);
    this.facadeWindow = facades.window;
    const run = () => {
      for (const script of scripts) {
        if (script.src) continue; // only GSAP is loaded by URL, and the page already holds it
        if (!script.code.trim()) continue;
        try {
          new Function('window', 'document', 'gsap', 'self', 'parent', script.code)(
            facades.window, facades.document, gsap, facades.window, facades.window.parent,
          );
        } catch (error) {
          console.warn('[studio] preview document script failed', error);
        }
      }
    };
    if (gsap) this.context = gsap.context(run, this.shadow);
    else run();
  }

  private createFacades(width: number, height: number, gsap: GsapLike | null): { window: Record<string, unknown>; document: Record<string, unknown> } {
    const host = this.element;
    const shadow = this.shadow;
    const body = this.body!;
    const docRect = (el: Element): DOMRect => {
      const h = host.getBoundingClientRect();
      const scale = (h.width || host.offsetWidth || 1) / (host.offsetWidth || 1);
      const r = el.getBoundingClientRect();
      return new DOMRect((r.left - h.left) / scale, (r.top - h.top) / scale, r.width / scale, r.height / scale);
    };
    const toPage = (x: number, y: number): [number, number] => {
      const h = host.getBoundingClientRect();
      const scale = (h.width || host.offsetWidth || 1) / (host.offsetWidth || 1);
      return [h.left + x * scale, h.top + y * scale];
    };
    // Tracking a drag must follow the pointer outside the stage; everything else listens on the
    // shadow root, where targets are the composition's own elements (a listener on the host would
    // only ever see the host).
    const documentLevel = new Set(['pointermove', 'pointerup', 'pointercancel', 'mousemove', 'mouseup']);
    const scopedTarget = (type: string): EventTarget => (documentLevel.has(type) ? document : shadow);
    const parentFacade = {
      postMessage: (message: unknown) => {
        const handler = this.onMessage;
        if (!handler) return;
        queueMicrotask(() => {
          if (this.onMessage === handler) handler({ data: message, source: this.contentWindow });
        });
      },
    };
    const windowFacade: Record<string, unknown> = {
      parent: parentFacade,
      top: parentFacade,
      gsap,
      addEventListener: (type: string, listener: Listener | EventListener, options?: unknown) => {
        if (type === 'message') this.messageListeners.push(listener as Listener);
        else scopedTarget(type).addEventListener(type, listener as EventListener, options as AddEventListenerOptions);
      },
      removeEventListener: (type: string, listener: Listener | EventListener, options?: unknown) => {
        if (type === 'message') {
          const index = this.messageListeners.indexOf(listener as Listener);
          if (index >= 0) this.messageListeners.splice(index, 1); // in place: pending deliveries keep their list
        } else scopedTarget(type).removeEventListener(type, listener as EventListener, options as AddEventListenerOptions);
      },
      getComputedStyle: (el: Element, pseudo?: string | null) => window.getComputedStyle(el, pseudo),
      getSelection: () => (shadow as unknown as { getSelection?: () => Selection | null }).getSelection?.() ?? window.getSelection(),
      requestAnimationFrame: (cb: FrameRequestCallback) => window.requestAnimationFrame(cb),
      cancelAnimationFrame: (id: number) => window.cancelAnimationFrame(id),
      setTimeout: (...args: Parameters<typeof window.setTimeout>) => window.setTimeout(...args),
      clearTimeout: (id?: number) => window.clearTimeout(id),
      ResizeObserver: window.ResizeObserver,
      performance: window.performance,
      console: window.console,
      devicePixelRatio: window.devicePixelRatio,
      location: window.location,
      __hfInPage: true,
      __hfDocRect: docRect,
      /** Scoped GSAP: selector text inside a generated timeline resolves within this stage. */
      __hfScopeRun: (fn: () => void) => {
        if (!gsap) {
          fn();
          return;
        }
        gsap.context(fn, shadow);
      },
    };
    Object.defineProperty(windowFacade, 'innerWidth', { get: () => host.offsetWidth || width });
    Object.defineProperty(windowFacade, 'innerHeight', { get: () => host.offsetHeight || height });
    Object.defineProperty(windowFacade, '__hfScale', { get: () => this.scale() });
    windowFacade.self = windowFacade;
    windowFacade.window = windowFacade;

    const documentFacade: Record<string, unknown> = {
      getElementById: (id: string) => shadow.getElementById(id),
      querySelector: (selector: string) => shadow.querySelector(selector),
      querySelectorAll: (selector: string) => shadow.querySelectorAll(selector),
      elementFromPoint: (x: number, y: number) => {
        const [px, py] = toPage(x, y);
        // Hit-test the stage itself, not whatever the page stacks above it. With a shot selected,
        // the parent-side transform shell (a transparent move surface) covers the stage, and a
        // single-element hit test retargets it to the host: a click meant for a caption or a
        // component under that shell would select nothing. Walk the whole stack instead and take
        // the topmost node that lives in this shadow tree.
        const stack = typeof shadow.elementsFromPoint === 'function' ? shadow.elementsFromPoint(px, py) : [];
        const inside = stack.find((candidate) => candidate.getRootNode() === shadow);
        return inside ?? shadow.elementFromPoint(px, py);
      },
      createElement: (tag: string) => document.createElement(tag),
      createElementNS: (ns: string, tag: string) => document.createElementNS(ns, tag),
      createRange: () => document.createRange(),
      createTreeWalker: (root: Node, whatToShow?: number, filter?: NodeFilter | null) => document.createTreeWalker(root, whatToShow, filter),
      caretRangeFromPoint: (x: number, y: number): Range | null => {
        const positionFromPoint = (document as Document & {
          caretPositionFromPoint?: (x: number, y: number, options?: { shadowRoots?: ShadowRoot[] }) => { offsetNode: Node; offset: number } | null;
        }).caretPositionFromPoint;
        if (positionFromPoint) {
          const position = positionFromPoint.call(document, x, y, { shadowRoots: [shadow] });
          if (position && shadow.contains(position.offsetNode)) {
            const range = document.createRange();
            range.setStart(position.offsetNode, position.offset);
            range.collapse(true);
            return range;
          }
          return null;
        }
        return document.caretRangeFromPoint?.(x, y) ?? null;
      },
      addEventListener: (type: string, listener: EventListener, options?: unknown) => scopedTarget(type).addEventListener(type, listener, options as AddEventListenerOptions),
      removeEventListener: (type: string, listener: EventListener, options?: unknown) => scopedTarget(type).removeEventListener(type, listener, options as AddEventListenerOptions),
      contains: (node: Node) => shadow.contains(node),
      body,
      documentElement: host,
      // Runtime scripts append styles and font links to the head. Styles belong to this stage
      // (a leaked `[contenteditable]` outline once dressed the page's own inputs); only font
      // stylesheets go to the page, where @font-face takes effect.
      head: {
        appendChild: (node: Node) => {
          if (node instanceof HTMLLinkElement && node.rel === 'stylesheet') {
            hoistStylesheetLink(node);
            return node;
          }
          const adopted = node instanceof HTMLStyleElement && this.adoptStyle ? this.adoptStyle(node) : node;
          shadow.appendChild(adopted);
          return node;
        },
        querySelector: (selector: string) => shadow.querySelector(selector) ?? document.head.querySelector(selector),
        contains: (node: Node) => shadow.contains(node) || document.head.contains(node),
      },
      fonts: document.fonts,
      defaultView: windowFacade,
    };
    Object.defineProperty(documentFacade, 'activeElement', { get: () => shadow.activeElement });
    Object.defineProperty(documentFacade, 'hidden', { get: () => document.hidden });
    windowFacade.document = documentFacade;
    return { window: windowFacade, document: documentFacade };
  }
}
