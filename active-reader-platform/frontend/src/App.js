import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import ReactMarkdown from 'react-markdown';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './App.css';
import tutorAvatar from './tutor-avatar.png';
import tutorAvatar2 from './tutor-avatar-2.png'; // reserved for future use
import { detectChapter } from './lessonHelpers';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const BACKEND = 'http://localhost:3003';

// ── Viz renderer ─────────────────────────────────────────
const BG = '#1e1e1e';
const BG_INJECT = `<style>html,body{background:${BG}!important;margin:0}</style>`;

// ── CSS injected into every figure iframe on load ─────────
// Overrides popup/tooltip styles from cached old-generation figures
const FIGURE_OVERRIDE_CSS = `
#pop,#popup,.popup,.info-panel,.node-info,.detail-panel,
[id*="popup"],[id*="pop"],[class*="popup"],[class*="panel"],[class*="info"] {
  background:rgba(0,0,0,0.50)!important;
  color:#fff!important;font-size:11px!important;line-height:1.5!important;
  padding:8px 12px!important;max-height:26%!important;
  border:1px solid rgba(255,255,255,0.1)!important;
  border-radius:9px!important;box-shadow:0 4px 16px rgba(0,0,0,0.15)!important;
  backdrop-filter:blur(14px)!important;-webkit-backdrop-filter:blur(14px)!important;
}
#tt,.tooltip,[id*="tooltip"],[class*="tooltip"] {
  background:rgba(0,0,0,0.55)!important;color:#fff!important;
  font-size:11px!important;white-space:nowrap!important;
  padding:3px 8px!important;border-radius:4px!important;
  border:none!important;max-width:160px!important;
  box-shadow:0 2px 6px rgba(0,0,0,0.25)!important;
}
`;

function injectFigureOverrides(iframeEl, overlayId, pdfScale) {
  try {
    const doc = iframeEl?.contentDocument;
    if (!doc?.head) return;
    if (doc.getElementById('_alex_overrides')) return; // already injected
    const s = doc.createElement('style');
    s.id = '_alex_overrides';
    s.textContent = FIGURE_OVERRIDE_CSS;
    // For equation iframes: normalize font size to match current PDF zoom
    if (iframeEl.title?.startsWith('equation-') && pdfScale) {
      const px = (10 * pdfScale).toFixed(1);
      s.textContent += `\nbody{font-size:${px}px!important;line-height:1.5!important;padding:4px 6px!important}td{padding:0 3px!important}`;
    }
    doc.head.appendChild(s);
    // Inject overlay-ID tracker so parent keeps hoveredOverlayIdRef correct even when
    // mouse is inside the iframe (React onMouseLeave fires on the wrapper div when entering iframes).
    if (overlayId) {
      const enterScript = doc.createElement('script');
      enterScript.textContent = `(function(){
  var entered=false,id=${JSON.stringify(overlayId)};
  document.addEventListener('mouseover',function(){
    if(!entered){entered=true;window.parent.postMessage({type:'alex-iframe-enter',overlayId:id},'*');}
  });
  document.addEventListener('mouseleave',function(){
    entered=false;window.parent.postMessage({type:'alex-iframe-leave',overlayId:id},'*');
  });
})();`;
      doc.head.insertBefore(enterScript, doc.head.firstChild);
    }
    // Intercept inline popups in cached figures → forward via postMessage, then hide
    const script = doc.createElement('script');
    script.textContent = `
      var _popSel = '#pop,#popup,.popup,.info-panel,[id*="popup"],[class*="popup"],[id*="panel"],[class*="panel"]';
      function _isPopEl(el) {
        if (!el || el.nodeType !== 1) return false;
        var id = (el.id||'').toLowerCase(), cls = (el.className||'').toLowerCase();
        return id.includes('pop')||id.includes('panel')||id.includes('info')||
               cls.includes('pop')||cls.includes('panel')||cls.includes('info');
      }
      function _forwardAndHide(el) {
        var cs = window.getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return;
        var titleEl = el.querySelector('strong,b,h3,h4,[id*="title"],[id*="name"]');
        var title = titleEl ? titleEl.textContent.trim() : '';
        var body = el.textContent.trim().replace(title,'').replace(/press esc.*?close/gi,'').replace(/×/g,'').trim();
        if (title || body) window.parent.postMessage({type:'alex-popup',title:title||'Info',body:body},'*');
        el.style.setProperty('display','none','important');
      }
      // On load: silently hide any visible popup elements without forwarding them.
      // Only forward when the user triggers a visibility change (MutationObserver below).
      setTimeout(function() {
        document.querySelectorAll(_popSel).forEach(function(el) {
          var cs = window.getComputedStyle(el);
          if (cs.display !== 'none' && cs.visibility !== 'hidden') {
            el.style.setProperty('display','none','important');
          }
          new MutationObserver(function() { _forwardAndHide(el); })
            .observe(el, {attributes:true, attributeFilter:['style','class']});
        });
        // Intercept #tt tooltip (cached equations) → forward as alex-tooltip to parent
        var ttEl = document.getElementById('tt');
        if (ttEl) {
          var _lastMX = 0, _lastMY = 0;
          document.addEventListener('mousemove', function(ev) { _lastMX=ev.clientX; _lastMY=ev.clientY; });
          new MutationObserver(function() {
            var cs = window.getComputedStyle(ttEl);
            if (cs.display !== 'none' && cs.visibility !== 'hidden') {
              var text = ttEl.textContent.trim();
              if (text) window.parent.postMessage({type:'alex-tooltip', text:text, mx:_lastMX, my:_lastMY}, '*');
              ttEl.style.setProperty('display','none','important');
            } else {
              window.parent.postMessage({type:'alex-tooltip', text:null}, '*');
            }
          }).observe(ttEl, {attributes:true, attributeFilter:['style']});
        }
      }, 80);
      // Watch for dynamically created popup elements
      new MutationObserver(function(muts) {
        muts.forEach(function(m) {
          m.addedNodes.forEach(function(n) {
            if (_isPopEl(n)) _forwardAndHide(n);
            else if (n.querySelectorAll) n.querySelectorAll(_popSel).forEach(_forwardAndHide);
          });
        });
      }).observe(document.body||document.documentElement, {childList:true, subtree:true});
    `;
    doc.body?.appendChild(script);
  } catch {}
}

function injectBg(html) {
  if (html.includes('</head>')) return html.replace('</head>', BG_INJECT + '</head>');
  if (html.includes('<body')) return html.replace(/(<body[^>]*>)/, '$1' + BG_INJECT);
  return BG_INJECT + html;
}

// ── MCQ detection ─────────────────────────────────────────
function parseMcq(text) {
  const matches = [...text.matchAll(/\b([A-D])\)\s+/g)];
  if (matches.length < 2) return null;
  const stem = text.slice(0, matches[0].index).trim();
  if (!stem) return null;
  const options = matches.map((m, i) => {
    const start = m.index + m[0].length;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    return { letter: m[1], content: text.slice(start, end).trim() };
  });
  return { stem, options };
}

function MessageContent({ content, onChoice }) {
  content = content.replace(/—/g, ' - ');
  const [chosen, setChosen] = useState(null);

  // Render as interactive MCQ if the message looks like a multiple-choice question
  const mcq = onChoice ? parseMcq(content) : null;
  if (mcq) {
    return (
      <div className="mcq">
        <div className="md"><ReactMarkdown>{mcq.stem}</ReactMarkdown></div>
        <div className="mcq-options">
          {mcq.options.map(opt => (
            <button
              key={opt.letter}
              className={`mcq-btn${chosen === opt.letter ? ' chosen' : ''}`}
              disabled={chosen !== null}
              onClick={() => { setChosen(opt.letter); onChoice(`${opt.letter}) ${opt.content}`); }}
            >
              <span className="mcq-letter">{opt.letter}</span>
              {opt.content}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const parts = [];
  const regex = /```html\r?\n([\s\S]*?)```/g;
  let last = 0, match;
  while ((match = regex.exec(content)) !== null) {
    if (match.index > last) parts.push({ type: 'md', content: content.slice(last, match.index) });
    parts.push({ type: 'html', content: match[1] });
    last = match.index + match[0].length;
  }
  if (last < content.length) parts.push({ type: 'md', content: content.slice(last) });

  // If there's any HTML visualization, show only the iframes — skip surrounding markdown
  const hasHtml = parts.some(p => p.type === 'html');

  return (
    <>
      {parts.map((part, i) =>
        part.type === 'html'
          ? <div key={i} className="viz-frame-wrap"><iframe className="viz-frame" srcDoc={injectBg(part.content)} sandbox="allow-scripts allow-same-origin" title="visualization" /></div>
          : hasHtml ? null
          : <div key={i} className="md"><ReactMarkdown>{part.content}</ReactMarkdown></div>
      )}
    </>
  );
}

// ── Parse / strip [HIGHLIGHT:"..."] tags from tutor replies ──
const HIGHLIGHT_RE = /\[HIGHLIGHT:"([^"]{3,120})"\]/g;
function parseHighlights(text) {
  const out = [];
  let m;
  HIGHLIGHT_RE.lastIndex = 0;
  while ((m = HIGHLIGHT_RE.exec(text)) !== null) out.push(m[1]);
  return out;
}
function stripHighlights(text) {
  return text.replace(HIGHLIGHT_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Parse / strip [GOTO:N] cross-page navigation tags ────
const GOTO_RE = /\[GOTO:(\d+)\]/;
function parseGoto(text) {
  const m = GOTO_RE.exec(text);
  return m ? parseInt(m[1], 10) : null;
}
function stripGoto(text) {
  return text.replace(GOTO_RE, '').replace(/\n{3,}/g, '\n\n').trim();
}

// ── Extract section text at a scroll fraction ────────────
function getSectionAtFraction(text, fraction) {
  if (!text) return '';
  const pos = Math.floor(fraction * text.length);
  const raw = text.slice(Math.max(0, pos - 50), Math.min(text.length, pos + 400));
  const dot = raw.indexOf('. ');
  return (dot > 0 && dot < 80) ? raw.slice(dot + 2) : raw;
}

// ── Flatten PDF outline into p.N: Title lines for tutor ──
function flattenOutline(items, depth = 0, out = []) {
  items.forEach(item => {
    if (item.pageNum) out.push(`p.${item.pageNum}: ${'  '.repeat(depth)}${item.title}`);
    if (item.items?.length) flattenOutline(item.items, depth + 1, out);
  });
  return out;
}

// ── Flatten all outline page numbers ─────────────────────
function collectPageNums(items, out = []) {
  items.forEach(item => {
    if (item.pageNum != null) out.push(item.pageNum);
    if (item.items?.length) collectPageNums(item.items, out);
  });
  return out;
}

// Returns the highest pageNum across ALL outline items that is ≤ currentPage
function getActivePageNum(outline, currentPage) {
  const all = collectPageNums(outline);
  const candidates = all.filter(p => p <= currentPage);
  return candidates.length ? Math.max(...candidates) : null;
}

// ── Annotation persistence ────────────────────────────────
function annKey(title) { return `annotations:${title}`; }

function loadAnnotations(title) {
  if (!title) return [];
  try { return JSON.parse(localStorage.getItem(annKey(title)) || '[]'); } catch { return []; }
}

function saveAnnotations(title, anns) {
  if (!title) return;
  try { localStorage.setItem(annKey(title), JSON.stringify(anns)); } catch {}
}

function makeAnnId() { return 'ann_' + Math.random().toString(36).slice(2, 9); }

// ── Chapter mastery — localStorage persistence ────────────
function masteryKey(title) { return `mastery:${title}`; }

function loadMastery(title) {
  if (!title) return { chapters: {} };
  try { return JSON.parse(localStorage.getItem(masteryKey(title)) || '{"chapters":{}}'); }
  catch { return { chapters: {} }; }
}

function saveMastery(title, data) {
  if (!title) return;
  try { localStorage.setItem(masteryKey(title), JSON.stringify(data)); } catch {}
}

// Summarises gaps for backend prompt injection (max ~500 chars)
function buildLearnerHistory(title) {
  const mastery = loadMastery(title);
  const entries = Object.entries(mastery.chapters || {});
  if (!entries.length) return '';
  const lines = entries
    .filter(([, ch]) => ch.wrong > 0 || (ch.gaps || []).some(g => !g.resolved))
    .map(([pg, ch]) => {
      const openGaps = (ch.gaps || []).filter(g => !g.resolved).map(g => g.gap);
      return `p.${pg}: wrong=${ch.wrong}, gaps: ${openGaps.length ? openGaps.join('; ') : 'none'}`;
    });
  return lines.join('\n');
}

// ── Outline sidebar item ──────────────────────────────────
function OutlineItem({ item, activePageNum, onNavigate, depth = 0 }) {
  const [open, setOpen] = useState(depth === 0);
  const active = item.pageNum != null && item.pageNum === activePageNum;
  const hasKids = item.items?.length > 0;
  return (
    <div>
      <div
        className={`outline-item${active ? ' active' : ''}`}
        style={{ paddingLeft: `${8 + depth * 10}px` }}
        onClick={() => {
          if (item.pageNum) onNavigate(item.pageNum);
          if (hasKids) setOpen(o => !o);
        }}
      >
        <span className="outline-arrow">{hasKids ? (open ? '▾' : '▸') : ''}</span>
        <span className="outline-title">{item.title}</span>
      </div>
      {hasKids && open && item.items.map((child, i) => (
        <OutlineItem key={i} item={child} activePageNum={activePageNum} onNavigate={onNavigate} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function App() {
  // PDF state
  const [pdfUrl, setPdfUrl]           = useState(null);
  const [title, setTitle]             = useState('');
  const [numPages, setNumPages]       = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale]             = useState(1.2);
  const [pageInput, setPageInput]     = useState('1');
  const [pdfError, setPdfError]       = useState(null);
  const [pageHeight, setPageHeight]   = useState(null); // measured height of one rendered page
  const [pageWidth,  setPageWidth]    = useState(null); // measured width of one rendered page
  const [outline, setOutline]         = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Tutor / page-awareness state
  const [tutorMode, setTutorMode]     = useState(true);
  const [pageText, setPageText]       = useState('');
  const pageTextCache                 = useRef(new Map()); // page# → extracted text
  const [ragStatus, setRagStatus]     = useState('idle'); // 'idle' | 'indexing' | 'ready'

  // Chat state
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState('');
  const [selectedText, setSelectedText]   = useState('');
  const [pinnedContext, setPinnedContext] = useState('');
  const [loading, setLoading]             = useState(false);

  // ── Concept-graph awareness ───────────────────────────────────
  // The tutor uses the chapter's concept nodes as grounding context. There
  // is no "linear lesson" — transitions are event-driven (see lesson_state).
  const [availableChapters, setAvailableChapters] = useState([]); // /api/lessons/chapters
  const [detectedChapter, setDetectedChapter]     = useState(null);
  const [chapterConcepts, setChapterConcepts]     = useState([]); // raw concept nodes for current chapter
  const [activeConcepts, setActiveConcepts]       = useState([]); // concepts relevant to current PDF position

  // Split
  const [splitPos, setSplitPos] = useState(58);
  const dragging = useRef(false);

  // Figure select
  const [selectMode, setSelectMode] = useState(false);
  const [selRect, setSelRect]       = useState(null);
  const [popupPos, setPopupPos]     = useState(null);
  const [capturing, setCapturing]   = useState(false);
  const dragStartRef = useRef(null);

  // Inline interactive figure overlays — persisted to localStorage keyed by PDF title
  const [figureOverlays, setFigureOverlaysRaw] = useState([]);
  const overlayIdRef = useRef(0);

  // Figure customization — tracks which overlay the user is currently modifying via chat
  const [customizeOverlayId, setCustomizeOverlayId] = useState(null);
  const btnDragRef = useRef(null);

  // PDF text highlights — phrases the tutor wants to highlight in the PDF
  const [pdfHighlights, setPdfHighlights] = useState([]);

  // ── Annotations (persistent, per book) ───────────────────
  const [annotations, setAnnotationsRaw] = useState([]);
  const [activeAnnotation, setActiveAnnotation] = useState(null); // { ann } — preview mode
  const annotationsRef = useRef([]);
  const setAnnotations = useCallback((updater) => {
    setAnnotationsRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      annotationsRef.current = next;
      saveAnnotations(titleRef.current, next);
      return next;
    });
  }, []);


  // Back-navigation state — saved before a cross-page jump so user can return
  const [backState, setBackState] = useState(null); // { page, scrollTop }

  // Figure popup — rendered OUTSIDE iframes so it never obstructs figure content
  const [figurePopup, setFigurePopup]     = useState(null); // { title, body, left, top }
  const [figureTooltip, setFigureTooltip] = useState(null); // { text, x, y }
  const [hoveredOverlayId, setHoveredOverlayId] = useState(null);
  const hoveredOverlayIdRef = useRef(null);
  const figureOverlaysRef   = useRef([]);
  const mousePosRef         = useRef({ x: 0, y: 0 });
  const popupDismissTimer   = useRef(null);

  const setFigureOverlays = useCallback((updater) => {
    setFigureOverlaysRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      figureOverlaysRef.current = next;
      // Persist only completed overlays (not loading ones) keyed by document title
      try {
        const key = `overlays:${title || '_'}`;
        const toSave = next.filter(o => !o.loading && o.html);
        localStorage.setItem(key, JSON.stringify(toSave));
      } catch {}
      // ── Log newly completed overlays to chapter mastery ──
      try {
        if (titleRef.current) {
          const prevIds = new Set(prev.filter(o => !o.loading && o.html).map(o => o.id));
          const newlyDone = next.filter(o => !o.loading && o.html && !prevIds.has(o.id));
          if (newlyDone.length) {
            const mastery = loadMastery(titleRef.current);
            if (!mastery.chapters) mastery.chapters = {};
            newlyDone.forEach(o => {
              const pg = o.page || currentPageRef.current;
              const ch = mastery.chapters[pg] || { correct: 0, wrong: 0, gaps: [], timeMs: 0, augments: [] };
              ch.augments = [...(ch.augments || []), { type: o.type || 'figure', page: pg, ts: Date.now() }];
              mastery.chapters[pg] = ch;
            });
            saveMastery(titleRef.current, mastery);
          }
        }
      } catch {}
      return next;
    });
  }, [title]);

  const fileInputRef       = useRef(null);
  const chatBottomRef      = useRef(null);
  const chatInputRef       = useRef(null);
  const pageRefs           = useRef([]);
  const scrollContainerRef = useRef(null);
  const pageVisibility     = useRef(new Map());
  const pdfDocRef          = useRef(null);
  const tutorTimerRef       = useRef(null);
  const dwellTimerRef       = useRef(null);
  const scrollFractionRef   = useRef(0);
  const lastCheckinRef      = useRef(0);
  const chapterQCountRef    = useRef({});   // { chapterPage: count } — max 4 per chapter
  const totalTutorAsksRef   = useRef(0);    // total auto-questions fired this session

  // ── Tutor Gate FSM ────────────────────────────────────────
  // States: IDLE | QUESTION | SCORING | REMEDIATE | REASK | ADVANCE
  const [tutorGate, setTutorGate]   = useState('IDLE');
  const tutorGateRef                = useRef('IDLE');
  const pendingTutorQuestion        = useRef(null); // { text, chapterPage }
  const pendingGap                  = useRef(null); // gap string from last scoring

  // ── Learner tracking ──────────────────────────────────────
  const pageArrivalTimeRef          = useRef(Date.now()); // reset on page change

  // Stable refs so dwell callback reads current values without re-attaching scroll listeners
  const tutorModeRef        = useRef(tutorMode);
  const loadingRef          = useRef(loading);
  const messagesRef         = useRef(messages);
  const titleRef            = useRef(title);
  const currentPageRef      = useRef(currentPage);
  const outlineRef          = useRef(outline);
  const navigateWithBackRef = useRef(null); // filled after navigateWithBack is defined
  tutorModeRef.current   = tutorMode;
  tutorGateRef.current   = tutorGate;
  loadingRef.current     = loading;
  messagesRef.current    = messages;
  titleRef.current       = title;
  currentPageRef.current = currentPage;
  outlineRef.current     = outline;

  // ── File open ────────────────────────────────────────────
  const onFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    const url = URL.createObjectURL(file);
    const docTitle = file.name.replace(/\.pdf$/i, '');
    setPdfUrl(url);
    setTitle(docTitle);
    setCurrentPage(1); setPageInput('1'); setNumPages(null); setPageHeight(null); setPageWidth(null);
    setOutline([]); setMessages([]);
    setSelectMode(false); setSelRect(null); setPopupPos(null);
    pageTextCache.current.clear(); setPageText('');
    setActiveAnnotation(null);
    // Load saved annotations for this document
    const savedAnns = loadAnnotations(file.name.replace(/\.pdf$/i, ''));
    setAnnotationsRaw(savedAnns);
    annotationsRef.current = savedAnns;
    // Reset tutor gate so first question fires promptly after PDF load
    lastCheckinRef.current = 0;
    totalTutorAsksRef.current = 0;
    chapterQCountRef.current = {};
    pendingTutorQuestion.current = null;
    pendingGap.current = null;
    setTutorGate('IDLE');
    // Restore saved overlays for this document
    try {
      const saved = localStorage.getItem(`overlays:${docTitle}`);
      console.log(`[overlays] key="overlays:${docTitle}" found=${!!saved} length=${saved?.length ?? 0}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        console.log(`[overlays] loaded ${parsed.length} overlays:`, parsed.map(o => ({ id: o.id, type: o.type, page: o.page })));
        setFigureOverlaysRaw(parsed);
        overlayIdRef.current = parsed.length ? Math.max(...parsed.map(o => o.id)) : 0;
      } else {
        // Check what overlay keys exist in localStorage
        const allKeys = Object.keys(localStorage).filter(k => k.startsWith('overlays:'));
        console.log('[overlays] no match. existing overlay keys:', allKeys);
        setFigureOverlaysRaw([]);
      }
    } catch (err) { console.error('[overlays] parse error:', err); setFigureOverlaysRaw([]); }
    e.target.value = '';
  }, [pdfUrl]);

  // ── PDF load ─────────────────────────────────────────────
  // ── Extract text from a page ─────────────────────────────
  const extractPageText = useCallback(async (pageNum) => {
    const pdf = pdfDocRef.current;
    if (!pdf) return '';
    if (pageTextCache.current.has(pageNum)) return pageTextCache.current.get(pageNum);
    try {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const text = content.items.map(item => item.str).join(' ').replace(/\s+/g, ' ').trim().slice(0, 3000);
      pageTextCache.current.set(pageNum, text);
      return text;
    } catch { return ''; }
  }, []);

  const onLoadSuccess = useCallback(async (pdf) => {
    pageRefs.current = [];
    pageVisibility.current.clear();
    pdfDocRef.current = pdf;
    setNumPages(pdf.numPages);
    setPdfError(null);
    try {
      const raw = await pdf.getOutline();
      if (!raw?.length) { setOutline([]); return; }
      const resolve = async (items) =>
        Promise.all(items.map(async (item) => {
          let pageNum = null;
          try {
            let dest = item.dest;
            if (typeof dest === 'string') dest = await pdf.getDestination(dest);
            if (dest) pageNum = (await pdf.getPageIndex(dest[0])) + 1;
          } catch {}
          return { title: item.title, pageNum, items: item.items?.length ? await resolve(item.items) : [] };
        }));
      setOutline(await resolve(raw));
    } catch { setOutline([]); }
  }, []);

  // ── Concept graph: fetch available chapters once ──────────
  useEffect(() => {
    fetch(`${BACKEND}/api/lessons/chapters`)
      .then(r => r.json())
      .then(setAvailableChapters)
      .catch(err => console.warn('[concepts] chapters fetch failed:', err.message));
  }, []);

  // ── Detect which chapter the open PDF maps to ─────────────
  useEffect(() => {
    setDetectedChapter(null);
    setChapterConcepts([]);
    if (!title || !availableChapters.length || !pdfDocRef.current) return;
    let cancelled = false;
    (async () => {
      let firstText = '';
      try {
        for (const p of [1, 2]) {
          if (p <= numPages) firstText += ' ' + (await extractPageText(p));
        }
      } catch {}
      if (cancelled) return;
      const match = detectChapter(title, firstText, availableChapters);
      if (!match) return;
      setDetectedChapter(match);
      if (match.has_plans) {
        try {
          const chap = await fetch(`${BACKEND}/api/lessons/chapter/${match.chapter}`).then(r => r.json());
          if (!cancelled) setChapterConcepts(chap.concepts || []);
        } catch (e) { console.warn('[concepts] chapter fetch failed:', e.message); }
      }
    })();
    return () => { cancelled = true; };
  }, [title, availableChapters, numPages, extractPageText]);

  // ── Tutor event logger (for student model + state transitions) ─
  const logTutorEvent = useCallback((concept_id, event, payload) => {
    fetch(`${BACKEND}/api/lessons/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: title || 'anon', concept_id, event, payload: payload || null }),
    }).catch(() => {});
  }, [title]);

  // ── Recompute active concepts whenever currentPage / pageText / chapter changes.
  // Heuristic: a concept is "active" for the current page if either
  //   (a) its position.section_title appears in the current page text, OR
  //   (b) its key_passage quote appears in the current page text.
  // We rank by overlap so the most-mentioned concept comes first.
  useEffect(() => {
    if (!chapterConcepts.length || !pageText) { setActiveConcepts([]); return; }
    const txt = pageText.toLowerCase();
    const scored = chapterConcepts.map(c => {
      let score = 0;
      const sectionTitle = (c.position?.section_title || '').toLowerCase();
      if (sectionTitle && txt.includes(sectionTitle)) score += 3;
      const title = (c.title || '').toLowerCase();
      if (title && txt.includes(title)) score += 4;
      const aliases = c.aliases || [];
      for (const a of aliases) if (a && txt.includes(a.toLowerCase())) score += 2;
      const kp = c.key_passage?.quote ? c.key_passage.quote.toLowerCase() : '';
      if (kp && txt.includes(kp.slice(0, 40))) score += 5;
      return { ...c, _score: score };
    }).filter(c => c._score > 0)
      .sort((a, b) => b._score - a._score);
    setActiveConcepts(scored.slice(0, 4));
  }, [chapterConcepts, pageText, currentPage]);

  // ── Page nav ─────────────────────────────────────────────
  const goTo = useCallback((p) => {
    const clamped = Math.min(Math.max(1, p), numPages || 1);
    setCurrentPage(clamped); setPageInput(String(clamped));
    pageRefs.current[clamped - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [numPages]);

  // Navigate to a page (saving back state if changing page) and apply highlights
  const navigateWithBack = useCallback((targetPage, phrases) => {
    const curPage = currentPageRef.current;
    if (targetPage && targetPage !== curPage) {
      setBackState({ page: curPage, scrollTop: scrollContainerRef.current?.scrollTop || 0 });
      goTo(targetPage);
    }
    if (phrases?.length) setPdfHighlights(phrases);
  }, [goTo]);
  navigateWithBackRef.current = navigateWithBack;

  const goBack = useCallback(() => {
    if (!backState) return;
    const { page, scrollTop } = backState;
    goTo(page);
    // Restore scroll position after page renders
    setTimeout(() => {
      if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollTop;
    }, 350);
    setBackState(null);
    setPdfHighlights([]);
  }, [backState, goTo]);

  // ── Scroll → page tracking ───────────────────────────────
  useEffect(() => {
    if (!numPages || !scrollContainerRef.current) return;
    pageVisibility.current.clear();
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(e => pageVisibility.current.set(Number(e.target.dataset.page), e.intersectionRatio));
      let best = 1, bestRatio = -1;
      pageVisibility.current.forEach((r, p) => { if (r > bestRatio) { bestRatio = r; best = p; } });
      if (bestRatio >= 0) { setCurrentPage(best); setPageInput(String(best)); }
    }, { root: scrollContainerRef.current, threshold: [0, 0.25, 0.5, 0.75, 1] });
    pageRefs.current.forEach((ref, i) => {
      if (ref) { ref.dataset.page = String(i + 1); observer.observe(ref); }
    });
    return () => observer.disconnect();
  }, [numPages]);

  useEffect(() => {
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = 0;
  }, [pdfUrl]);

  // ── Page text extraction ──────────────────────────────────
  useEffect(() => {
    if (!pdfDocRef.current) return;
    extractPageText(currentPage).then(text => setPageText(text));
  }, [currentPage, extractPageText]);

  // ── RAG: index all pages on PDF load ─────────────────────
  useEffect(() => {
    if (!numPages || !title || !pdfDocRef.current) return;
    let cancelled = false;
    (async () => {
      try {
        // Skip if server already has this book indexed (same server session)
        const status = await fetch(`${BACKEND}/api/embed-status?title=${encodeURIComponent(title)}`).then(r => r.json()).catch(() => ({}));
        if (status.indexed) { setRagStatus('ready'); setTimeout(() => setRagStatus('idle'), 2000); return; }

        const pages = [];
        // Extract all pages concurrently in batches of 10
        for (let start = 1; start <= numPages; start += 10) {
          if (cancelled) return;
          const batch = Array.from({ length: Math.min(10, numPages - start + 1) }, (_, i) => start + i);
          const texts = await Promise.all(batch.map(p => extractPageText(p)));
          texts.forEach((text, i) => { if (text) pages.push({ pageNum: batch[i], text }); });
        }
        if (cancelled) return;
        const res = await fetch(`${BACKEND}/api/embed-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, pages }),
        });
        if (!cancelled) { setRagStatus(res.ok ? 'ready' : 'idle'); if (res.ok) setTimeout(() => setRagStatus('idle'), 2000); }
      } catch { if (!cancelled) setRagStatus('idle'); }
    })();
    return () => { cancelled = true; };
  }, [numPages, title, extractPageText]);

  // ── PDF annotation highlights (amber, permanent, clickable) ─
  useEffect(() => {
    // Clear previous annotation marks
    document.querySelectorAll('.pdf-ann-hl').forEach(el => {
      el.style.backgroundColor = '';
      el.style.cursor = '';
      el.classList.remove('pdf-ann-hl');
      delete el.dataset.annId;
    });
    const pageAnns = annotationsRef.current.filter(a => a.page === currentPage);
    if (!pageAnns.length) return;

    const apply = setTimeout(() => {
      const spans = document.querySelectorAll('.react-pdf__Page__textContent span');
      pageAnns.forEach(ann => {
        const lPhrase = ann.phrase.toLowerCase().trim();
        const minLen = Math.max(10, Math.floor(lPhrase.length * 0.4));
        spans.forEach(span => {
          const st = span.textContent.trim().toLowerCase();
          if (st.length < minLen) return;
          if (lPhrase.includes(st) || st.includes(lPhrase)) {
            span.style.backgroundColor = 'rgba(251,191,36,0.35)';
            span.style.borderRadius = '2px';
            span.style.cursor = 'pointer';
            span.classList.add('pdf-ann-hl');
            span.dataset.annId = ann.id;
          }
        });
      });
    }, 200);
    return () => clearTimeout(apply);
  }, [annotations, currentPage]);

  // ── PDF text highlighting (tutor — yellow, temporary) ────
  useEffect(() => {
    const clearHl = () => document.querySelectorAll('.pdf-hl').forEach(el => {
      el.style.backgroundColor = '';
      el.style.borderRadius = '';
      el.classList.remove('pdf-hl');
    });
    clearHl();
    if (!pdfHighlights.length) return;

    const apply = setTimeout(() => {
      const spans = document.querySelectorAll('.react-pdf__Page__textContent span');
      pdfHighlights.forEach(phrase => {
        const lPhrase = phrase.toLowerCase().trim();
        // Require span to be at least half the phrase length — prevents single short
        // words from matching long phrases and blanketing the page in yellow
        const minLen = Math.max(12, Math.floor(lPhrase.length * 0.5));
        spans.forEach(span => {
          const st = span.textContent.trim().toLowerCase();
          if (st.length < minLen) return;
          if (lPhrase.includes(st) || st.includes(lPhrase)) {
            span.style.backgroundColor = 'rgba(255,220,0,0.45)';
            span.style.borderRadius = '2px';
            span.classList.add('pdf-hl');
          }
        });
      });
    }, 150);

    // Auto-clear highlights after 8s — they are transient indicators, not permanent marks
    const autoClear = setTimeout(() => {
      clearHl();
      setPdfHighlights([]);
    }, 8000);

    return () => { clearTimeout(apply); clearTimeout(autoClear); };
  }, [pdfHighlights, currentPage]);

  // Blue figure-link PDF highlights removed — too noisy.

  // ── Draggable overlay buttons ─────────────────────────────────
  useEffect(() => {
    const onMove = (e) => {
      if (!btnDragRef.current) return;
      const { overlayId, startX, startY, startOx, startOy } = btnDragRef.current;
      const dx = e.clientX - startX, dy = e.clientY - startY;
      setFigureOverlays(prev => prev.map(o =>
        o.id === overlayId ? { ...o, btnOffset: { x: startOx + dx, y: startOy + dy } } : o
      ));
    };
    const onUp = () => { btnDragRef.current = null; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [setFigureOverlays]);

  // ── Track mouse position for tooltip placement ──────────────
  useEffect(() => {
    const onMove = (e) => { mousePosRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // ── Figure popup + tooltip via postMessage (rendered outside iframe) ──
  useEffect(() => {
    const onMessage = (e) => {
      // Restore hoveredOverlayIdRef when mouse is inside an iframe (React onMouseLeave fires
      // on the wrapper div when the cursor crosses into the iframe's browsing context).
      if (e.data?.type === 'alex-iframe-enter') {
        hoveredOverlayIdRef.current = e.data.overlayId;
        return;
      }
      if (e.data?.type === 'alex-iframe-leave') {
        if (hoveredOverlayIdRef.current === e.data.overlayId) hoveredOverlayIdRef.current = null;
        return;
      }
      // Hover tooltip from equation iframe
      // Live cursor-move update from inside iframe
      if (e.data?.type === 'alex-tooltip-move') {
        const overlay = figureOverlaysRef.current.find(o => o.id === hoveredOverlayIdRef.current);
        const container = scrollContainerRef.current;
        if (overlay && container) {
          const cRect = container.getBoundingClientRect();
          const iframeLeft = cRect.left + overlay.scrollRect.x;
          const iframeTop  = cRect.top - container.scrollTop + overlay.scrollRect.y;
          const x = Math.min(iframeLeft + e.data.mx + 12, window.innerWidth - 228);
          const y = Math.max(4, iframeTop + e.data.my - 28);
          setFigureTooltip(prev => prev ? { ...prev, x, y } : prev);
        }
        return;
      }
      if (e.data?.type === 'alex-tooltip') {
        if (e.data.text) {
          // Use iframe cursor coords + overlay offset for accurate position
          const overlay = figureOverlaysRef.current.find(o => o.id === hoveredOverlayIdRef.current);
          const container = scrollContainerRef.current;
          let x = mousePosRef.current.x + 12;
          let y = mousePosRef.current.y - 28;
          if (overlay && container && e.data.mx !== undefined) {
            const cRect = container.getBoundingClientRect();
            const iframeLeft = cRect.left + overlay.scrollRect.x;
            const iframeTop  = cRect.top - container.scrollTop + overlay.scrollRect.y;
            x = iframeLeft + e.data.mx + 12;
            y = iframeTop  + e.data.my - 28;
          }
          x = Math.min(x, window.innerWidth - 228);
          y = Math.max(4, y);
          setFigureTooltip({ text: e.data.text, x, y });
        } else {
          setFigureTooltip(null);
        }
        return;
      }
      // Strip literal HTML tags from body (figure JS sometimes stores HTML as plain text)
      const stripHtml = (s) => (s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      // Click popup
      if (e.data?.type === 'alex-popup') {
        if (e.data.title !== null && e.data.title !== undefined) {
          // Compute position: equations → right side; figures → below
          const container = scrollContainerRef.current;
          const overlay = figureOverlaysRef.current.find(o => o.id === hoveredOverlayIdRef.current);
          let left = (container?.getBoundingClientRect().left ?? 16) + 8;
          let top  = null;
          if (overlay && container) {
            const cRect   = container.getBoundingClientRect();
            const scrollTop = container.scrollTop;
            const isEq    = overlay.type === 'equation';
            const oLeft   = cRect.left + overlay.scrollRect.x;
            const oTop    = cRect.top - scrollTop + overlay.scrollRect.y;
            const oRight  = oLeft + overlay.scrollRect.w;
            const oBottom = oTop  + overlay.scrollRect.h;
            if (isEq) {
              left = Math.max(8, Math.min(oLeft, window.innerWidth - 284));
              top  = oBottom + 6;
              if (top + 120 > window.innerHeight) top = Math.max(8, oTop - 126);
            } else {
              left = oLeft;
              top  = oBottom + 6;
              if (top + 160 > window.innerHeight) top = oTop - 164;
              top  = Math.max(8, top);
            }
          }
          clearTimeout(popupDismissTimer.current);
          setFigurePopup({ title: stripHtml(e.data.title), body: stripHtml(e.data.body), left, top });
          popupDismissTimer.current = setTimeout(() => setFigurePopup(null), 15000);
        } else {
          clearTimeout(popupDismissTimer.current);
          setFigurePopup(null);
        }
      }
    };
    const onDocClick = (e) => {
      // Close popup on click outside the popup panel
      if (!e.target.closest?.('.figure-popup-panel')) {
        clearTimeout(popupDismissTimer.current);
        setFigurePopup(null);
      }
    };
    window.addEventListener('message', onMessage);
    document.addEventListener('click', onDocClick, true);
    return () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('click', onDocClick, true);
    };
  }, []);

  // ── Dwell-based tutor check-in ────────────────────────────
  // Fires ONE short question after the user has been on a section for 10s.
  // Resets whenever the user scrolls significantly (>5% of page height).
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const fireDwellCheckin = async () => {
      if (!tutorModeRef.current || loadingRef.current) return;
      if (!pdfDocRef.current) return; // no PDF loaded yet — don't burn the cooldown
      if (tutorGateRef.current !== 'IDLE') return; // gate is active — wait for current exchange to resolve
      const now = Date.now();
      if (now - lastCheckinRef.current < 120000) return; // 2min cooldown between auto-questions

      // Primary guard: never ask if the last message is ANY assistant message the user hasn't replied to
      const visible = messagesRef.current.filter(m => !m._tutorCheckin);
      const lastVisible = visible[visible.length - 1];
      if (lastVisible?.role === 'assistant') return; // wait for user to reply first

      // Limit: max 1 auto-question before user has replied at all this session
      const userReplies = visible.filter(m => m.role === 'user');
      if (userReplies.length === 0 && totalTutorAsksRef.current >= 1) return;

      // Limit: max 2 auto-questions per chapter section
      const chapterPage = getActivePageNum(outlineRef.current, currentPageRef.current) || 0;
      const chapterCount = chapterQCountRef.current[chapterPage] || 0;
      if (chapterCount >= 5) return;

      lastCheckinRef.current = now;

      const page = currentPageRef.current;
      const frac = scrollFractionRef.current;
      const text = await extractPageText(page);
      if (!text) return;
      const readingSection = getSectionAtFraction(text, frac);

      setLoading(true);
      const history = messagesRef.current.filter(m => !m._tutorCheckin);
      const needsUserEnd = history.length === 0 || history[history.length - 1].role !== 'user';
      const checkinMsg = { role: 'user', content: `[CHECKIN]`, _tutorCheckin: true };
      const apiMsgs = needsUserEnd ? [...history, checkinMsg] : history;

      try {
        const res = await fetch(`${BACKEND}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: apiMsgs,
            bookTitle: titleRef.current,
            currentPage: page,
            pageText: text,
            readingSection,
            tutorMode: true,
            isTutorCheckin: true,
            outlineContext: flattenOutline(outlineRef.current).join('\n'),
            learnerHistory: buildLearnerHistory(titleRef.current),
          }),
        });
        const data = await res.json();
        if (res.ok && data.reply) {
          chapterQCountRef.current[chapterPage] = chapterCount + 1;
          totalTutorAsksRef.current++;
          const hlTutor = parseHighlights(data.reply);
          const gotoTutor = parseGoto(data.reply);
          const stripped = gotoTutor ? stripGoto(data.reply) : data.reply;
          const cleanTutor = hlTutor.length ? stripHighlights(stripped) : stripped;
          const msgPage = currentPageRef.current;
          if (hlTutor.length) setPdfHighlights(hlTutor);
          setMessages(m => [...m, {
            role: 'assistant', content: cleanTutor, _tutorAsk: true,
            hlPhrases: hlTutor.length ? hlTutor : undefined,
            hlPage: msgPage,
          }]);
          if (gotoTutor && gotoTutor !== msgPage) {
            setTimeout(() => navigateWithBackRef.current?.(gotoTutor, hlTutor), 900);
          }
          // ── Advance gate to QUESTION state — waiting for user reply ──
          pendingTutorQuestion.current = { text: cleanTutor, chapterPage };
          setTutorGate('QUESTION');
        }
      } catch {} finally { setLoading(false); }
    };

    const startDwellTimer = () => {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = setTimeout(fireDwellCheckin, 20000); // 20s dwell before asking
    };

    const onScroll = () => {
      const ref = pageRefs.current[currentPageRef.current - 1];
      if (ref) {
        const cr = container.getBoundingClientRect();
        const pr = ref.getBoundingClientRect();
        const newFrac = Math.max(0, Math.min(1, (cr.top + cr.height * 0.4 - pr.top) / pr.height));
        const moved = Math.abs(newFrac - scrollFractionRef.current) > 0.05;
        scrollFractionRef.current = newFrac;
        if (moved) startDwellTimer();
      }
    };

    // Also start timer on page arrival
    startDwellTimer();

    container.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      container.removeEventListener('scroll', onScroll);
      clearTimeout(dwellTimerRef.current);
    };
  // Re-attach when page changes so startDwellTimer fires for the new page.
  // tutorMode changes are handled via ref — no re-attach needed.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, extractPageText, title]);

  // ── Annotation click / double-click on PDF text layer ────
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    let lastClick = { target: null, time: 0 };

    const onClick = (e) => {
      const span = e.target.closest('.pdf-ann-hl');
      if (!span) return;
      const annId = span.dataset.annId;
      const ann = annotationsRef.current.find(a => a.id === annId);
      if (!ann) return;

      const now = Date.now();
      if (lastClick.target === span && now - lastClick.time < 400) {
        // Double-click → delete annotation
        setAnnotations(prev => prev.filter(a => a.id !== annId));
        setActiveAnnotation(cur => cur?.ann?.id === annId ? null : cur);
      } else {
        // Single click — check if live message exists in current session
        const liveEl = document.querySelector(`[data-ann-msg-id="${ann.msgId}"]`);
        if (liveEl) {
          // Same session: scroll to the message in chat
          liveEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          liveEl.classList.add('ann-flash');
          setTimeout(() => liveEl.classList.remove('ann-flash'), 1200);
        } else {
          // Future session: open the stored explainer preview panel
          setActiveAnnotation({ ann });
        }
      }
      lastClick = { target: span, time: now };
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, [setAnnotations]);

  // ── Figure select ─────────────────────────────────────────
  // Convert viewport coords → pdf-scroll-inner coords (accounts for padding + scroll)
  const toScrollCoords = (clientX, clientY) => {
    const c = scrollContainerRef.current;
    const r = c.getBoundingClientRect();
    const pl = parseFloat(getComputedStyle(c).paddingLeft) || 0;
    const pt = parseFloat(getComputedStyle(c).paddingTop) || 0;
    return {
      x: clientX - r.left - pl + c.scrollLeft,
      y: clientY - r.top  - pt + c.scrollTop,
    };
  };

  const onSelMouseDown = useCallback((e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const { x, y } = toScrollCoords(e.clientX, e.clientY);
    dragStartRef.current = { x, y };
    setSelRect({ x, y, w: 0, h: 0 }); setPopupPos(null);
  }, []);

  const onSelMouseMove = useCallback((e) => {
    if (!dragStartRef.current) return;
    const { x: cx, y: cy } = toScrollCoords(e.clientX, e.clientY);
    const { x: sx, y: sy } = dragStartRef.current;
    setSelRect({ x: Math.min(sx, cx), y: Math.min(sy, cy), w: Math.abs(cx - sx), h: Math.abs(cy - sy) });
  }, []);

  const onSelMouseUp = useCallback((_e) => {
    if (!dragStartRef.current) return;
    dragStartRef.current = null;
    setSelRect(prev => {
      if (!prev || prev.w < 10 || prev.h < 10) { setPopupPos(null); return null; }
      setPopupPos({ x: prev.x, y: prev.y + prev.h + 8 });
      return prev;
    });
  }, []);

  useEffect(() => {
    if (!selectMode) return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setSelectMode(false); setSelRect(null); setPopupPos(null); dragStartRef.current = null;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectMode]);

  const captureAndSend = useCallback(async () => {
    if (!selRect || selRect.w < 10 || selRect.h < 10) return;
    setCapturing(true);
    try {
      const container = scrollContainerRef.current;
      const containerRect = container.getBoundingClientRect();
      const outCanvas = document.createElement('canvas');
      outCanvas.width  = Math.round(selRect.w);
      outCanvas.height = Math.round(selRect.h);
      const ctx = outCanvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);

      container.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => {
        const canvas = wrapper.querySelector('canvas');
        if (!canvas) return;
        const cr = canvas.getBoundingClientRect();
        const pl = parseFloat(getComputedStyle(container).paddingLeft) || 0;
        const pt = parseFloat(getComputedStyle(container).paddingTop)  || 0;
        const canvasLeft = cr.left - containerRect.left - pl + container.scrollLeft;
        const canvasTop  = cr.top  - containerRect.top  - pt + container.scrollTop;
        const ix1 = Math.max(selRect.x, canvasLeft), iy1 = Math.max(selRect.y, canvasTop);
        const ix2 = Math.min(selRect.x + selRect.w, canvasLeft + cr.width);
        const iy2 = Math.min(selRect.y + selRect.h, canvasTop + cr.height);
        if (ix2 <= ix1 || iy2 <= iy1) return;
        const dpr = canvas.width / cr.width;
        ctx.drawImage(canvas,
          (ix1 - canvasLeft) * dpr, (iy1 - canvasTop) * dpr, (ix2 - ix1) * dpr, (iy2 - iy1) * dpr,
          ix1 - selRect.x, iy1 - selRect.y, ix2 - ix1, iy2 - iy1);
      });

      const imageData = outCanvas.toDataURL('image/png').split(',')[1];
      const userMsg = {
        role: 'user',
        content: 'Create an interactive 3D visualization of the figure in this image using Three.js with OrbitControls.',
        imageData, imageMimeType: 'image/png',
      };
      const next = [...messages, userMsg];
      setMessages(next);
      setSelectMode(false); setSelRect(null); setPopupPos(null);
      setLoading(true);
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, bookTitle: title }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally { setLoading(false); setCapturing(false); }
  }, [selRect, messages, title]);

  // ── Inline interactive figure overlay ─────────────────────
  const FIGURE_BACKEND = 'http://localhost:3001';

  // Shared canvas-capture helper: returns base64 PNG of selRect region
  const captureRegion = useCallback((rect) => {
    const container = scrollContainerRef.current;
    if (!container) return null;
    const containerRect = container.getBoundingClientRect();
    const outCanvas = document.createElement('canvas');
    outCanvas.width  = Math.round(rect.w);
    outCanvas.height = Math.round(rect.h);
    const ctx = outCanvas.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, outCanvas.width, outCanvas.height);
    container.querySelectorAll('.pdf-page-wrapper').forEach(wrapper => {
      const canvas = wrapper.querySelector('canvas');
      if (!canvas) return;
      const cr = canvas.getBoundingClientRect();
      const pl = parseFloat(getComputedStyle(container).paddingLeft) || 0;
      const pt = parseFloat(getComputedStyle(container).paddingTop)  || 0;
      const canvasLeft = cr.left - containerRect.left - pl + container.scrollLeft;
      const canvasTop  = cr.top  - containerRect.top  - pt + container.scrollTop;
      const ix1 = Math.max(rect.x, canvasLeft), iy1 = Math.max(rect.y, canvasTop);
      const ix2 = Math.min(rect.x + rect.w, canvasLeft + cr.width);
      const iy2 = Math.min(rect.y + rect.h, canvasTop + cr.height);
      if (ix2 <= ix1 || iy2 <= iy1) return;
      const dpr = canvas.width / cr.width;
      ctx.drawImage(canvas,
        (ix1 - canvasLeft) * dpr, (iy1 - canvasTop) * dpr, (ix2 - ix1) * dpr, (iy2 - iy1) * dpr,
        ix1 - rect.x, iy1 - rect.y, ix2 - ix1, iy2 - iy1);
    });
    return outCanvas.toDataURL('image/png').split(',')[1];
  }, []);

  const captureAndMakeInteractive = useCallback(async () => {
    if (!selRect || selRect.w < 10 || selRect.h < 10) return;
    setCapturing(true);
    const id = ++overlayIdRef.current;
    // Snapshot rect before async ops (setSelRect(null) runs shortly after)
    const rect = { ...selRect };

    // Capture link context for bidirectional navigation
    const linkedPage = currentPage;
    const STOP = new Set(['that','this','with','from','have','were','they','their','which','would','about','could','there','these','other','than','what','into','been','some','will','such','both','each','most','over','just','back','only','after','before','should','those','where','them','same','much','need','used','being','using','since','while','under','along']);
    const nearbyText = getSectionAtFraction(pageText, scrollFractionRef.current);
    const linkedPhrases = [...new Set(nearbyText.split(/\W+/).filter(w => w.length > 5 && !STOP.has(w.toLowerCase())))].slice(0, 6);

    try {
      const base64 = captureRegion(rect);
      if (!base64) return;

      // Remove any existing overlay that significantly overlaps this selection
      setFigureOverlays(prev => prev.filter(o => {
        if (!o.scrollRect) return true; // keep malformed entries rather than throw
        const a = o.scrollRect, b = rect;
        const ix = Math.max(0, Math.min(a.x+a.w, b.x+b.w) - Math.max(a.x, b.x));
        const iy = Math.max(0, Math.min(a.y+a.h, b.y+b.h) - Math.max(a.y, b.y));
        const smaller = Math.min(a.w*a.h, b.w*b.h);
        return !(smaller > 0 && (ix*iy)/smaller > 0.4);
      }));

      setFigureOverlays(prev => [...prev, {
        id, scrollRect: rect, html: null, loading: true, visible: true, type: 'classifying',
        linkedPage, linkedPhrases,
      }]);
      setSelectMode(false); setSelRect(null); setPopupPos(null);

      // ── Step 1: fast classify (~300ms, Haiku) ─────────────
      const clsRes = await fetch(`${BACKEND}/api/classify-figure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageData: base64, imageMimeType: 'image/png' }),
      });
      const { type: contentType } = await clsRes.json();

      if (contentType === 'equation') {
        // ── Equation path ──────────────────────────────────
        setFigureOverlays(prev => prev.map(o =>
          o.id === id ? { ...o, type: 'equation' } : o
        ));
        const eqRes = await fetch(`${BACKEND}/api/augment-equation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageData: base64, imageMimeType: 'image/png', bookTitle: title, pageText }),
        });
        const eqData = await eqRes.json();
        if (!eqRes.ok) throw new Error(eqData.error || 'Equation augmentation failed');
        setFigureOverlays(prev => prev.map(o =>
          o.id === id ? { ...o, html: eqData.html, loading: false } : o
        ));
        return;
      }

      // ── Step 2: not an equation — fall through to 2D figure ──
      setFigureOverlays(prev => prev.map(o =>
        o.id === id ? { ...o, type: 'figure' } : o
      ));

      const planRes = await fetch(`${FIGURE_BACKEND}/api/plan-2d`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: `figure_${id}`, base64, mediaType: 'image/png' }),
      });
      const plan = await planRes.json();
      if (!planRes.ok) throw new Error(plan.error || 'Planning failed');

      const genRes = await fetch(`${FIGURE_BACKEND}/api/generate-2d-async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: 'image/png', filename: `figure_${id}`, plan, model: 'claude-opus-4.6', iframeWidth: Math.round(rect.w), iframeHeight: Math.round(rect.h) }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error || 'Generation failed');
      const { jobId } = genData;

      for (let i = 0; i < 60; i++) {
        await new Promise(r => setTimeout(r, 3000));
        const statusRes = await fetch(`${FIGURE_BACKEND}/api/generate-status/${jobId}`);
        const statusData = await statusRes.json();
        if (statusData.status === 'done') {
          const html = statusData.result?.html || statusData.html || '';
          setFigureOverlays(prev => prev.map(o =>
            o.id === id ? { ...o, html, loading: false } : o
          ));
          return;
        }
        if (statusData.status === 'error') throw new Error(statusData.error || 'Generation failed');
      }
      throw new Error('Generation timed out');
    } catch (err) {
      setFigureOverlays(prev => prev.filter(o => o.id !== id));
      setMessages(m => [...m, { role: 'assistant', content: `Augmentation failed: ${err.message}` }]);
    } finally {
      setCapturing(false);
      setSelectMode(false); setSelRect(null); setPopupPos(null); // always close popup
    }
  }, [selRect, title, pageText, captureRegion]);

  // ── Text selection ───────────────────────────────────────
  useEffect(() => {
    const onMouseUp = () => {
      if (selectMode) return;
      const sel = window.getSelection();
      const text = sel?.toString().trim();
      if (text && text.length > 2) setSelectedText(text);
    };
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, [selectMode]);

  const useSelection = () => {
    if (!selectedText) return;
    setPinnedContext(selectedText);
    setSelectedText('');
    window.getSelection()?.removeAllRanges();
    setTimeout(() => chatInputRef.current?.focus(), 0);
  };

  // ── Figure customization via chat ────────────────────────
  const customizeFigure = useCallback(async (overlayId, request) => {
    // Find the overlay's html — look it up fresh each time, not via stale closure
    const currentHtml = figureOverlays.find(o => o.id === overlayId)?.html;
    if (!currentHtml) {
      setMessages(m => [...m, { role: 'assistant', content: "Figure HTML not available yet — try again once the figure has fully loaded." }]);
      setCustomizeOverlayId(null);
      return;
    }
    setLoading(true);
    setMessages(m => [...m, { role: 'user', content: request, displayContent: request }]);
    setInput(''); setPinnedContext(''); setCustomizeOverlayId(null);
    try {
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), 90000);
      const res = await fetch(`${BACKEND}/api/modify-figure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentHtml, request, bookTitle: title, pageText }),
        signal: ctrl.signal,
      });
      clearTimeout(timeout);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Modification failed');
      setFigureOverlays(prev => prev.map(o => o.id === overlayId ? { ...o, html: data.html } : o));
      setMessages(m => [...m, { role: 'assistant', content: 'Done — figure updated.' }]);
    } catch (err) {
      const msg = err.name === 'AbortError' ? 'Timed out — try a simpler request.' : err.message;
      setMessages(m => [...m, { role: 'assistant', content: `Couldn't update figure: ${msg}` }]);
    } finally { setLoading(false); }
  }, [figureOverlays, title, pageText]);

  // ── Mastery helpers ───────────────────────────────────────
  const updateMastery = useCallback((chapterPage, verdict, gap, resolvedGap, isResolved) => {
    const t = titleRef.current;
    if (!t || !chapterPage) return;
    const mastery = loadMastery(t);
    const ch = mastery.chapters[chapterPage] || { correct: 0, wrong: 0, gaps: [], timeMs: 0, augments: [] };
    if (verdict === 'correct') ch.correct = (ch.correct || 0) + 1;
    else if (verdict === 'wrong') {
      ch.wrong = (ch.wrong || 0) + 1;
      if (gap) ch.gaps = [...(ch.gaps || []), { gap, resolved: false, ts: Date.now() }];
    }
    if (resolvedGap && isResolved) {
      ch.gaps = (ch.gaps || []).map(g => g.gap === resolvedGap ? { ...g, resolved: true } : g);
    }
    mastery.chapters[chapterPage] = ch;
    saveMastery(t, mastery);
  }, []);

  // ── Remediation viz generation (non-blocking, injected as chat message) ──
  const triggerRemediationViz = useCallback(async (gap) => {
    try {
      const pageTextSnap = await extractPageText(currentPageRef.current);
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ role: 'user', content: `Create a compact interactive HTML visualization (fits 300×200 in a chat bubble) to illustrate: "${gap}". Dark bg #1e1e1e, light text. Self-contained with inline JS/CSS. Output ONLY the HTML code block.` }],
          bookTitle: titleRef.current,
          currentPage: currentPageRef.current,
          pageText: pageTextSnap,
          tutorMode: false,
        }),
      });
      const data = await res.json();
      if (res.ok && data.reply?.includes('```html')) {
        setMessages(m => [...m, { role: 'assistant', content: data.reply, _vizEmbed: true }]);
      }
    } catch {} // non-fatal
  }, [extractPageText]);

  // ── Tutor gate: remediation + re-ask after wrong/partial ──
  const triggerRemediation = useCallback(async (gap, chapterPage) => {
    setTutorGate('REMEDIATE');
    const pageTextSnap = await extractPageText(currentPageRef.current);
    setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{
            role: 'user',
            content: `[REMEDIATION] Student struggled with: "${gap}". Give a brief Socratic nudge — one short hint + a slightly different angle question. Do NOT give the answer. End with a question for them.`,
          }],
          bookTitle: titleRef.current,
          currentPage: currentPageRef.current,
          pageText: pageTextSnap,
          tutorMode: true,
          outlineContext: flattenOutline(outlineRef.current).join('\n'),
        }),
      });
      const data = await res.json();
      if (res.ok && data.reply) {
        const remediationMsg = { role: 'assistant', content: data.reply, _tutorAsk: true, _isRemediation: true };
        setMessages(m => [...m, remediationMsg]);
        // Extract the follow-up question (last sentence containing ?)
        const sentences = data.reply.split(/(?<=[.!?])\s+/);
        const newQ = sentences.filter(s => s.includes('?')).pop() || data.reply;
        pendingTutorQuestion.current = { text: newQ, chapterPage };
        setTutorGate('REASK');
      }
    } catch { setTutorGate('IDLE'); } finally { setLoading(false); }
    // Fire viz in background — don't await
    triggerRemediationViz(gap);
  }, [extractPageText, triggerRemediationViz]);

  // ── Tutor gate: score a user's reply to a tutor question ──
  const triggerScoring = useCallback(async (userAnswer, isReask) => {
    if (!pendingTutorQuestion.current) return;
    const { text: question, chapterPage } = pendingTutorQuestion.current;
    const prevGapVal = isReask ? pendingGap.current : null;
    setTutorGate('SCORING');
    try {
      const pageTextSnap = await extractPageText(currentPageRef.current);
      const res = await fetch(`${BACKEND}/api/score-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question, answer: userAnswer, prevGap: prevGapVal, pageText: pageTextSnap }),
      });
      const score = await res.json();

      if (score.verdict === 'correct' || (isReask && score.verdict !== 'wrong')) {
        // Correct (or reask accepted) → update mastery, advance
        updateMastery(chapterPage, 'correct', null, prevGapVal, !!prevGapVal);
        pendingTutorQuestion.current = null;
        pendingGap.current = null;
        setTutorGate('IDLE');
      } else {
        // wrong / partial → remediate (only if not already a reask)
        pendingGap.current = score.gap;
        updateMastery(chapterPage, 'wrong', score.gap, null, false);
        if (!isReask) {
          triggerRemediation(score.gap, chapterPage);
        } else {
          // Second failure — update mastery gap as unresolved and go idle (don't loop)
          setTutorGate('IDLE');
          pendingTutorQuestion.current = null;
        }
      }
    } catch { setTutorGate('IDLE'); }
  }, [extractPageText, updateMastery, triggerRemediation]);

  // ── Send message ─────────────────────────────────────────
  const sendMessage = useCallback(async (overrideText) => {
    const typed = overrideText !== undefined ? overrideText.trim() : input.trim();
    if (!typed || loading) return;

    // If a figure is selected for customization, route to modify-figure instead of chat
    if (customizeOverlayId != null) {
      return customizeFigure(customizeOverlayId, typed);
    }

    const content = pinnedContext ? `> ${pinnedContext}\n\n${typed}` : typed;
    const userMsg = { role: 'user', content, displayContent: typed };
    const next = [...messages, userMsg];

    // Capture gate state before async ops (it may change by the time scoring fires)
    const gateAtSend = tutorGateRef.current;
    const isGateActive = gateAtSend === 'QUESTION' || gateAtSend === 'REASK';

    // Capture pinned context NOW (before it's cleared) — for annotation creation
    const pinnedForAnnotation = pinnedContext ? pinnedContext.trim() : null;

    setMessages(next); if (overrideText === undefined) setInput(''); setPinnedContext(''); setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: next, bookTitle: title, currentPage, pageText, tutorMode,
          outlineContext: tutorMode ? flattenOutline(outline).join('\n') : undefined,
          learnerHistory: tutorMode ? buildLearnerHistory(title) : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      const highlights = parseHighlights(data.reply);
      const gotoPage = parseGoto(data.reply);
      const stripped = gotoPage ? stripGoto(data.reply) : data.reply;
      const cleanReply = highlights.length ? stripHighlights(stripped) : stripped;
      const msgPage = currentPageRef.current;
      if (highlights.length) setPdfHighlights(highlights);
      setMessages(m => [...m, {
        role: 'assistant', content: cleanReply,
        hlPhrases: highlights.length ? highlights : undefined,
        hlPage: msgPage,
        _tutorReply: isGateActive || undefined,
      }]);

      // ── Enter QUESTION gate only when user explicitly asked for a quiz/question ──
      // (not on every reply ending with ?, which would keep the gate stuck)
      if (tutorMode && tutorGateRef.current === 'IDLE') {
        const quizRequest = /quiz|multiple.?choice|give me a question|test me|ask me/i.test(typed);
        if (quizRequest) {
          const stripped = cleanReply.trim();
          const chapterPage = getActivePageNum(outlineRef.current, currentPageRef.current) || 0;
          pendingTutorQuestion.current = { text: stripped, chapterPage };
          setTutorGate('QUESTION');
        }
      }
      // Auto-navigate if tutor pointed to another page
      if (gotoPage && gotoPage !== msgPage) {
        setTimeout(() => navigateWithBack(gotoPage, highlights), 900);
      }

      // ── Create annotation if user sent a pinned selection ──
      if (pinnedForAnnotation && pinnedForAnnotation.length > 10) {
        const annId = makeAnnId();
        const msgId = 'msg_' + annId;
        // Stamp the msgId onto the last assistant message so same-session clicks can scroll to it
        setMessages(m => m.map((msg, i) =>
          i === m.length - 1 && msg.role === 'assistant' ? { ...msg, _annMsgId: msgId } : msg
        ));
        const newAnn = {
          id: annId,
          msgId,
          phrase: pinnedForAnnotation.slice(0, 120),
          page: msgPage,
          type: 'chat',
          chatSnippet: cleanReply.slice(0, 240),
          explainerHtml: null,  // filled async below
          ts: Date.now(),
        };
        setAnnotations(prev => [...prev, newAnn]);

        // Generate explainer in background — update annotation when ready
        const pageTextSnap = pageText;
        const titleSnap = title;
        const pageSnap = msgPage;
        fetch(`${BACKEND}/api/generate-explainer`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            selectedText: pinnedForAnnotation,
            pageText: pageTextSnap,
            bookTitle: titleSnap,
            currentPage: pageSnap,
          }),
        }).then(r => r.json()).then(data => {
          if (data.html) {
            setAnnotations(prev => prev.map(a =>
              a.id === annId ? { ...a, explainerHtml: data.html } : a
            ));
          }
        }).catch(() => {});
      }
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }

    // ── Gate FSM: score the answer if tutor is waiting for one ──
    if (isGateActive) {
      triggerScoring(typed, gateAtSend === 'REASK');
    }
  }, [input, pinnedContext, messages, loading, title, currentPage, pageText, tutorMode, customizeOverlayId, customizeFigure, navigateWithBack, triggerScoring, setAnnotations]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // ── Clear annotation preview on page navigation ──────────
  useEffect(() => { setActiveAnnotation(null); }, [currentPage]);

  // ── Time-on-page tracking ─────────────────────────────────
  // When currentPage changes, save elapsed time to the previous page's mastery entry.
  // The cleanup function runs before the effect re-runs (i.e. on page change).
  useEffect(() => {
    pageArrivalTimeRef.current = Date.now();
    return () => {
      const elapsed = Date.now() - pageArrivalTimeRef.current;
      if (elapsed < 5000 || !titleRef.current || !currentPage) return;
      const mastery = loadMastery(titleRef.current);
      if (!mastery.chapters) mastery.chapters = {};
      const ch = mastery.chapters[currentPage] || { correct: 0, wrong: 0, gaps: [], timeMs: 0, augments: [] };
      ch.timeMs = (ch.timeMs || 0) + elapsed;
      mastery.chapters[currentPage] = ch;
      saveMastery(titleRef.current, mastery);
    };
  }, [currentPage]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Divider drag ─────────────────────────────────────────
  const onDividerMouseDown = (e) => { dragging.current = true; e.preventDefault(); };
  useEffect(() => {
    const onMove = (e) => { if (!dragging.current) return; setSplitPos(Math.min(Math.max(25, (e.clientX / window.innerWidth) * 100), 80)); };
    const onUp = () => { dragging.current = false; };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, []);

  return (
    <div className="app">
      {/* Toolbar */}
      <header className="toolbar">
        <div className="toolbar-left">
          <button className="open-btn" onClick={() => fileInputRef.current.click()}>Open PDF</button>
          <input ref={fileInputRef} type="file" accept="application/pdf" style={{ display: 'none' }} onChange={onFileChange} />
          {title && <span className="doc-title">{title}</span>}
        </div>
        {pdfUrl && (
          <div className="toolbar-center">
            <button className="nav-btn" onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1}>‹</button>
            <span className="page-indicator">
              <input
                className="page-input"
                value={pageInput}
                onChange={e => setPageInput(e.target.value)}
                onBlur={() => { const p = parseInt(pageInput, 10); if (!isNaN(p)) goTo(p); else setPageInput(String(currentPage)); }}
                onKeyDown={e => e.key === 'Enter' && e.target.blur()}
              />
              <span className="page-of"> / {numPages ?? '…'}</span>
            </span>
            <button className="nav-btn" onClick={() => goTo(currentPage + 1)} disabled={currentPage >= numPages}>›</button>
          </div>
        )}
        {pdfUrl && (
          <div className="toolbar-right">
            <button className="zoom-btn" onClick={() => { setScale(s => Math.max(0.5, +(s - 0.1).toFixed(1))); setPageHeight(null); setPageWidth(null); }}>−</button>
            <span className="zoom-label">{Math.round(scale * 100)}%</span>
            <button className="zoom-btn" onClick={() => { setScale(s => Math.min(3, +(s + 0.1).toFixed(1))); setPageHeight(null); setPageWidth(null); }}>+</button>
          </div>
        )}
      </header>

      <div className="main">
        {/* PDF pane */}
        <div className="pdf-pane" style={{ width: `${splitPos}%` }}>
          {pdfUrl && outline.length > 0 && (
            <div className={`outline-sidebar${sidebarOpen ? '' : ' collapsed'}`}>
              <div className="outline-header">
                {sidebarOpen && <span className="outline-label">Contents</span>}
                <button className="outline-toggle-btn" onClick={() => setSidebarOpen(o => !o)}>
                  {sidebarOpen ? '‹' : '›'}
                </button>
              </div>
              {sidebarOpen && (
                <div className="outline-list">
                  {outline.map((item, i) => (
                    <OutlineItem key={i} item={item} activePageNum={getActivePageNum(outline, currentPage)} onNavigate={goTo} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pdf-content" style={{ position: 'relative' }}>
            {pdfUrl && (
              <div className="float-3d-btn-group">
                <button
                  className={`float-3d-btn${selectMode ? ' active' : ''}`}
                  onClick={() => { setSelectMode(m => !m); setSelRect(null); setPopupPos(null); }}
                  title="Select a figure to make interactive (Esc to cancel)"
                >
                  {selectMode ? 'Cancel' : 'Select Figure'}
                </button>
                {figureOverlays.filter(o => !o.loading).length > 0 && (
                  <button
                    className="float-3d-btn"
                    onClick={() => {
                      const anyVisible = figureOverlays.some(o => o.visible !== false && !o.loading);
                      setFigureOverlays(prev => prev.map(o => ({ ...o, visible: !anyVisible })));
                    }}
                    title="Toggle all augmented figures"
                  >
                    {figureOverlays.some(o => o.visible !== false && !o.loading) ? '◉ Augmented on' : '○ Augmented off'}
                  </button>
                )}
                {backState && (
                  <button
                    className="float-3d-btn back-nav-btn"
                    onClick={goBack}
                    title={`Return to where you were on p.${backState.page}`}
                  >
                    ← back to p.{backState.page}
                  </button>
                )}
              </div>
            )}
            {!pdfUrl ? (
              <div className="empty-state" onClick={() => fileInputRef.current.click()}>
                <div className="empty-icon">📄</div>
                <div className="empty-text">Open a PDF to get started</div>
                <div className="empty-sub">Click here or use the button above</div>
              </div>
            ) : (
              <div className={`pdf-scroll${selectMode ? ' select-active' : ''}`} ref={scrollContainerRef}>
                <div className="pdf-scroll-inner">
                  <Document
                    file={pdfUrl}
                    onLoadSuccess={onLoadSuccess}
                    onLoadError={(err) => { console.error('PDF error:', err); setPdfError(err?.message || String(err)); }}
                    loading={<div className="loading">Loading PDF…</div>}
                    error={<div className="pdf-error">Failed to load PDF.<br/><small>{pdfError || 'Check console for details.'}</small></div>}
                  >
                    {numPages && Array.from({ length: numPages }, (_, i) => {
                      const pageNum = i + 1;
                      const WIN = 5; // render ±5 pages around current
                      const inWindow = Math.abs(pageNum - currentPage) <= WIN;
                      return (
                        <div key={pageNum} ref={el => { pageRefs.current[i] = el; }} className="pdf-page-wrapper">
                          {inWindow ? (
                            <Page
                              pageNumber={pageNum}
                              scale={scale}
                              renderAnnotationLayer
                              renderTextLayer
                              onRenderSuccess={() => {
                                // measure page dimensions once from first rendered page
                                if ((!pageHeight || !pageWidth) && pageRefs.current[i]) {
                                  const r = pageRefs.current[i].getBoundingClientRect();
                                  if (!pageHeight) setPageHeight(r.height);
                                  if (!pageWidth)  setPageWidth(r.width);
                                }
                              }}
                            />
                          ) : (
                            // placeholder keeps scroll position stable
                            <div style={{ height: pageHeight || 900, width: pageWidth || 'auto', background: '#fff', border: '1px solid #e0e0e0' }} />
                          )}
                        </div>
                      );
                    })}
                  </Document>

                  {selectMode && (
                    <div className="select-overlay" onMouseDown={onSelMouseDown} onMouseMove={onSelMouseMove} onMouseUp={onSelMouseUp}>
                      {selRect && (
                        <div className="sel-rect" style={{ left: selRect.x, top: selRect.y, width: selRect.w, height: selRect.h }} />
                      )}
                      {popupPos && selRect && (
                        <div className="sel-popup" style={{ left: popupPos.x, top: popupPos.y }} onMouseDown={e => e.stopPropagation()}>
                          <button className="make3d-btn" disabled={capturing} onClick={captureAndMakeInteractive}>
                            {capturing ? 'Detecting…' : '✦ Augment'}
                          </button>
                          <button className="make3d-btn" style={{ background: '#2a2a2a' }} disabled={capturing} onClick={captureAndSend}>
                            {capturing ? '…' : '3D → Chat'}
                          </button>
                          <button className="sel-cancel-btn" onClick={() => { setSelRect(null); setPopupPos(null); }}>✕</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inline interactive figure / equation overlays */}
                  {figureOverlays.map(overlay => {
                    const isVisible = overlay.visible !== false;
                    const isEq = overlay.type === 'equation';
                    const accentOn  = isEq ? 'rgba(86,182,194,0.85)' : 'rgba(60,120,220,0.85)';
                    const accentOff = 'rgba(80,80,80,0.7)';
                    const loadingMsg = overlay.type === 'classifying'
                      ? 'Analysing…'
                      : overlay.type === 'equation'
                        ? 'Annotating equation…'
                        : 'Building interactive figure…';
                    const isHovered = hoveredOverlayId === overlay.id;
                    return (
                      <div key={overlay.id}
                        onMouseEnter={() => { setHoveredOverlayId(overlay.id); hoveredOverlayIdRef.current = overlay.id; }}
                        onMouseLeave={() => { setHoveredOverlayId(null); hoveredOverlayIdRef.current = null; }}
                      >
                        {/* The overlay — hidden when toggled off, revealing original PDF */}
                        <div
                          style={{
                            position: 'absolute',
                            left: overlay.scrollRect.x,
                            top: overlay.scrollRect.y,
                            width: overlay.scrollRect.w,
                            height: overlay.scrollRect.h,
                            zIndex: 20,
                            overflow: 'hidden',
                            background: '#fff',
                            display: isVisible ? 'block' : 'none',
                          }}
                        >
                          {overlay.loading ? (
                            <div style={{
                              display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center',
                              height: '100%',
                              background: '#fafafa',
                              color: '#999',
                              gap: 10,
                            }}>
                              <div style={{
                                width: 22, height: 22,
                                border: `2px solid ${isEq ? '#2a2a4e' : '#ddd'}`,
                                borderTopColor: '#555',
                                borderRadius: '50%',
                                animation: 'spin 0.8s linear infinite',
                              }} />
                              <span style={{ fontSize: 11 }}>{loadingMsg}</span>
                            </div>
                          ) : overlay.html ? (
                            <iframe
                              srcDoc={overlay.html}
                              sandbox="allow-scripts allow-same-origin"
                              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                              title={isEq ? `equation-${overlay.id}` : `interactive-figure-${overlay.id}`}
                              onLoad={e => injectFigureOverrides(e.target, overlay.id, scale)}
                            />
                          ) : null}
                        </div>

                        {/* Toggle pill + customize "?" button — always visible, top-right of overlay */}
                        {!overlay.loading && overlay.html && (() => {
                          const btnOff = overlay.btnOffset || { x: 0, y: 0 };
                          return (
                          <div
                            style={{
                              position: 'absolute',
                              left: overlay.scrollRect.x + overlay.scrollRect.w - (isEq ? 118 : 110) + btnOff.x,
                              top: overlay.scrollRect.y + btnOff.y,
                              zIndex: 25,
                              display: 'flex',
                              gap: 2,
                              cursor: 'grab',
                              userSelect: 'none',
                            }}
                            onMouseDown={(e) => {
                              e.stopPropagation();
                              btnDragRef.current = {
                                overlayId: overlay.id,
                                startX: e.clientX,
                                startY: e.clientY,
                                startOx: btnOff.x,
                                startOy: btnOff.y,
                              };
                            }}
                          >
                            {/* ? customize button */}
                            <button
                              onClick={() => {
                                setCustomizeOverlayId(prev => prev === overlay.id ? null : overlay.id);
                                setTimeout(() => chatInputRef.current?.focus(), 50);
                              }}
                              className={`overlay-ask-btn${customizeOverlayId === overlay.id ? ' active' : ''}`}
                              title="Customize this figure in chat"
                            >
                              ?
                            </button>
                            {/* toggle pill */}
                            <button
                              onClick={() => setFigureOverlays(prev =>
                                prev.map(o => o.id === overlay.id ? { ...o, visible: !isVisible } : o)
                              )}
                              style={{
                                background: isVisible ? accentOn : accentOff,
                                color: '#fff',
                                border: 'none',
                                borderRadius: '0 4px 4px 0',
                                fontSize: 9,
                                padding: '2px 7px',
                                cursor: 'pointer',
                                backdropFilter: 'blur(4px)',
                                letterSpacing: '0.03em',
                              }}
                              title={isVisible ? 'Show original' : isEq ? 'Show annotated equation' : 'Show interactive'}
                            >
                              {isVisible
                                ? (isEq ? '∑ eq' : '◉ live')
                                : (isEq ? '○ orig' : '○ orig')}
                            </button>
                          </div>
                          );
                        })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          {/* Figure tooltip — hover symbol info */}
          {figureTooltip && (
            <div className="figure-tooltip-el" style={{ left: figureTooltip.x, top: figureTooltip.y }}>
              {figureTooltip.text}
            </div>
          )}
          {/* Figure popup — click row info, rendered outside iframes */}
          {figurePopup && (
            <div className="figure-popup-panel" style={{
              left: figurePopup.left ?? 16,
              ...(figurePopup.top != null ? { top: figurePopup.top, bottom: 'auto' } : {}),
            }}>
              <strong className="figure-popup-title">{figurePopup.title}</strong>
              <span className="figure-popup-body">{figurePopup.body}</span>
            </div>
          )}
          </div>
        </div>

        {/* Divider */}
        <div className="divider" onMouseDown={onDividerMouseDown} />

        {/* Chat pane */}
        <div className="chat-pane" style={{ width: `${100 - splitPos}%` }}>
          <div className="chat-header">
            <span>Chat</span>
            {title && <span className="chat-doc-label">— p.{currentPage}</span>}
            {ragStatus === 'ready' && <span style={{ fontSize: 10, color: '#3a7', marginLeft: 6 }}>✦ rag</span>}
            {tutorMode && <span className="tutor-glow-dot" title="Tutor is active" />}
            <div className="tutor-toggle" onClick={() => setTutorMode(m => !m)} title={tutorMode ? 'Tutor mode on — click to turn off' : 'Turn on tutor mode'}>
              <div className={`tutor-toggle-track${tutorMode ? ' on' : ''}`}>
                <div className="tutor-toggle-thumb" />
              </div>
              <span className="tutor-label">Tutor</span>
            </div>
          </div>

          {/* ── Concept context strip ── */}
          {detectedChapter && activeConcepts.length > 0 && (
            <div className="concept-strip" title="Concepts the tutor is grounded in for the current page">
              <span className="cs-chip-chapter">📚 {detectedChapter.title}</span>
              {activeConcepts.map(c => (
                <span key={c.id} className="cs-chip-concept" title={c.one_liner || ''}>
                  {c.title}
                </span>
              ))}
            </div>
          )}

          <div className="chat-messages">
            {/* ── Annotation preview mode ── */}
            {activeAnnotation && (
              <div className="ann-preview">
                <div className="ann-preview-header">
                  <span className="ann-preview-badge">📌 p.{activeAnnotation.ann.page}</span>
                  <span className="ann-preview-phrase">"{activeAnnotation.ann.phrase.slice(0, 60)}{activeAnnotation.ann.phrase.length > 60 ? '…' : ''}"</span>
                  <button className="ann-preview-close" onClick={() => setActiveAnnotation(null)} title="Back to chat">✕</button>
                </div>
                {activeAnnotation.ann.explainerHtml ? (
                  <div className="viz-frame-wrap">
                    <iframe className="viz-frame" srcDoc={activeAnnotation.ann.explainerHtml} sandbox="allow-scripts" title="annotation-explainer" />
                  </div>
                ) : (
                  <div className="ann-preview-snippet">{activeAnnotation.ann.chatSnippet}</div>
                )}
                <div className="ann-preview-footer">
                  <span style={{ color: '#555', fontSize: 11 }}>Double-click highlight on PDF to delete · {new Date(activeAnnotation.ann.ts).toLocaleDateString()}</span>
                  <button className="ann-ask-again" onClick={() => {
                    setActiveAnnotation(null);
                    setPinnedContext(activeAnnotation.ann.phrase);
                    setTimeout(() => chatInputRef.current?.focus(), 50);
                  }}>Ask again ↩</button>
                </div>
              </div>
            )}
            {!activeAnnotation && messages.length === 0 && (
              <div className="chat-empty">
                <p>Open a PDF and start asking questions. Select text to quote it as context.</p>
              </div>
            )}
            {messages.filter(m => !m._tutorCheckin).map((m, i) => (
              <div
                key={i}
                data-ann-msg-id={m._annMsgId || undefined}
                className={`message ${m.role}${m.content?.includes?.('```html') ? ' has-viz' : ''}${m._tutorAsk ? ' tutor-ask' : ''}${m.hlPhrases ? ' has-hl-link' : ''}`}
                onClick={() => m.hlPhrases?.length && navigateWithBack(m.hlPage, m.hlPhrases)}
                title={m.hlPhrases ? `Click to go to p.${m.hlPage} and re-highlight` : undefined}
              >
                {(m._tutorAsk || m._isRemediation || m._tutorReply) && <img src={tutorAvatar} alt="" className="tutor-ask-dot" />}
                <div className="message-bubble">
                  {m.imageData ? (
                    <img src={`data:${m.imageMimeType || 'image/png'};base64,${m.imageData}`} className="msg-thumb" alt="figure" />
                  ) : (
                    <MessageContent content={m.displayContent ?? m.content ?? ''} onChoice={m.role === 'assistant' ? (text) => sendMessage(text) : undefined} />
                  )}
                  {m.hlPhrases && <span className="msg-hl-badge" title={`Highlights on p.${m.hlPage}`}>📍 p.{m.hlPage}</span>}
                </div>
              </div>
            ))}
            {loading && (
              <div className="message assistant">
                <div className="message-bubble typing"><span /><span /><span /></div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {selectedText && (
            <div className="selection-bar">
              <span className="selection-preview">"{selectedText.slice(0, 80)}{selectedText.length > 80 ? '…' : ''}"</span>
              <button className="use-selection-btn" onClick={useSelection}>Use selection</button>
              <button className="dismiss-btn" onClick={() => setSelectedText('')}>✕</button>
            </div>
          )}

          {pinnedContext && (
            <div className="pinned-context">
              <span className="pinned-quote">"{pinnedContext.slice(0, 120)}{pinnedContext.length > 120 ? '…' : ''}"</span>
              <button className="dismiss-btn" onClick={() => setPinnedContext('')}>✕</button>
            </div>
          )}

          {customizeOverlayId != null && (
            <div className="customize-chip">
              <span className="customize-chip-icon">◈</span>
              <span>Customizing figure — describe your changes below</span>
              <button className="dismiss-btn" onClick={() => setCustomizeOverlayId(null)}>✕</button>
            </div>
          )}

          <div className="chat-input-row">
            <textarea
              ref={chatInputRef}
              className="chat-input"
              placeholder={customizeOverlayId != null
                ? 'e.g. "make the nodes larger" or "add labels to the arrows"…'
                : pdfUrl ? (pinnedContext ? 'Ask about the selection…' : 'Ask anything about this PDF…') : 'Open a PDF first'}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={onKeyDown}
              disabled={!pdfUrl || loading}
              rows={3}
            />
            <button className="send-btn" onClick={sendMessage} disabled={!input.trim() || !pdfUrl || loading}>
              Send
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
