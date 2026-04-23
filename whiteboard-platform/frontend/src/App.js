import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import ReactMarkdown from 'react-markdown';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import './App.css';

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

const BACKEND = 'http://localhost:3003';

// ── Viz renderer ─────────────────────────────────────────
const BG = '#1e1e1e';
const BG_INJECT = `<style>html,body{background:${BG}!important;margin:0}</style>`;

function injectBg(html) {
  if (html.includes('</head>')) return html.replace('</head>', BG_INJECT + '</head>');
  if (html.includes('<body')) return html.replace(/(<body[^>]*>)/, '$1' + BG_INJECT);
  return BG_INJECT + html;
}

function MessageContent({ content }) {
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
          ? <iframe key={i} className="viz-frame" srcDoc={injectBg(part.content)} sandbox="allow-scripts" title="visualization" />
          : hasHtml ? null
          : <div key={i} className="md"><ReactMarkdown>{part.content}</ReactMarkdown></div>
      )}
    </>
  );
}

// ── Extract section text at a scroll fraction ────────────
function getSectionAtFraction(text, fraction) {
  if (!text) return '';
  const pos = Math.floor(fraction * text.length);
  const raw = text.slice(Math.max(0, pos - 50), Math.min(text.length, pos + 400));
  const dot = raw.indexOf('. ');
  return (dot > 0 && dot < 80) ? raw.slice(dot + 2) : raw;
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
  const [outline, setOutline]         = useState([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Tutor / page-awareness state
  const [tutorMode, setTutorMode]     = useState(true);
  const [pageText, setPageText]       = useState('');
  const pageTextCache                 = useRef(new Map()); // page# → extracted text

  // Chat state
  const [messages, setMessages]           = useState([]);
  const [input, setInput]                 = useState('');
  const [selectedText, setSelectedText]   = useState('');
  const [pinnedContext, setPinnedContext] = useState('');
  const [loading, setLoading]             = useState(false);

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

  const setFigureOverlays = useCallback((updater) => {
    setFigureOverlaysRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Persist only completed overlays (not loading ones) keyed by document title
      try {
        const key = `overlays:${title || '_'}`;
        const toSave = next.filter(o => !o.loading && o.html);
        localStorage.setItem(key, JSON.stringify(toSave));
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
  const tutorTimerRef      = useRef(null);
  const dwellTimerRef      = useRef(null);
  const scrollFractionRef  = useRef(0);
  const lastCheckinRef     = useRef(0);

  // Stable refs so dwell callback reads current values without re-attaching scroll listeners
  const tutorModeRef    = useRef(tutorMode);
  const loadingRef      = useRef(loading);
  const messagesRef     = useRef(messages);
  const titleRef        = useRef(title);
  const currentPageRef  = useRef(currentPage);
  tutorModeRef.current   = tutorMode;
  loadingRef.current     = loading;
  messagesRef.current    = messages;
  titleRef.current       = title;
  currentPageRef.current = currentPage;

  // ── File open ────────────────────────────────────────────
  const onFileChange = useCallback((e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    const url = URL.createObjectURL(file);
    const docTitle = file.name.replace(/\.pdf$/i, '');
    setPdfUrl(url);
    setTitle(docTitle);
    setCurrentPage(1); setPageInput('1'); setNumPages(null);
    setOutline([]); setMessages([]);
    setSelectMode(false); setSelRect(null); setPopupPos(null);
    pageTextCache.current.clear(); setPageText('');
    // Restore saved overlays for this document
    try {
      const saved = localStorage.getItem(`overlays:${docTitle}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        setFigureOverlaysRaw(parsed);
        overlayIdRef.current = parsed.length ? Math.max(...parsed.map(o => o.id)) : 0;
      } else {
        setFigureOverlaysRaw([]);
      }
    } catch { setFigureOverlaysRaw([]); }
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

  // ── Page nav ─────────────────────────────────────────────
  const goTo = useCallback((p) => {
    const clamped = Math.min(Math.max(1, p), numPages || 1);
    setCurrentPage(clamped); setPageInput(String(clamped));
    pageRefs.current[clamped - 1]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [numPages]);

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

  // ── Dwell-based tutor check-in ────────────────────────────
  // Fires ONE short question after the user has been on a section for 10s.
  // Resets whenever the user scrolls significantly (>5% of page height).
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const fireDwellCheckin = async () => {
      if (!tutorModeRef.current || loadingRef.current) return;
      const now = Date.now();
      if (now - lastCheckinRef.current < 30000) return; // 30s cooldown between questions
      lastCheckinRef.current = now;

      const page   = currentPageRef.current;
      const frac   = scrollFractionRef.current;
      const text   = await extractPageText(page);
      if (!text) return;
      const readingSection = getSectionAtFraction(text, frac);

      setLoading(true);
      // Build API message list — must end with a user turn
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
          }),
        });
        const data = await res.json();
        if (res.ok && data.reply) {
          setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
        }
      } catch {} finally { setLoading(false); }
    };

    const startDwellTimer = () => {
      clearTimeout(dwellTimerRef.current);
      dwellTimerRef.current = setTimeout(fireDwellCheckin, 10000); // 10s dwell
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
  }, [currentPage, extractPageText]);

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

  const captureAndMakeInteractive = useCallback(async () => {
    if (!selRect || selRect.w < 10 || selRect.h < 10) return;
    setCapturing(true);
    const id = ++overlayIdRef.current;
    try {
      // Capture the selected region from the PDF canvas(es)
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
      const base64 = outCanvas.toDataURL('image/png').split(',')[1];

      // Place loading overlay immediately at the selection position
      setFigureOverlays(prev => [...prev, { id, scrollRect: { ...selRect }, html: null, loading: true, visible: true }]);
      setSelectMode(false); setSelRect(null); setPopupPos(null);

      // Plan
      const planRes = await fetch(`${FIGURE_BACKEND}/api/plan-2d`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: `figure_${id}`, base64, mediaType: 'image/png' }),
      });
      const plan = await planRes.json();
      if (!planRes.ok) throw new Error(plan.error || 'Planning failed');

      // Start async generation
      const genRes = await fetch(`${FIGURE_BACKEND}/api/generate-2d-async`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ base64, mediaType: 'image/png', filename: `figure_${id}`, plan, model: 'claude-opus-4.6' }),
      });
      const genData = await genRes.json();
      if (!genRes.ok) throw new Error(genData.error || 'Generation failed');
      const { jobId } = genData;

      // Poll for completion
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
      setMessages(m => [...m, { role: 'assistant', content: `Interactive figure failed: ${err.message}` }]);
    } finally { setCapturing(false); }
  }, [selRect]);

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

  // ── Send message ─────────────────────────────────────────
  const sendMessage = useCallback(async () => {
    if (!input.trim() || loading) return;
    const typed = input.trim();
    const content = pinnedContext ? `> ${pinnedContext}\n\n${typed}` : typed;
    const userMsg = { role: 'user', content, displayContent: typed };
    const next = [...messages, userMsg];
    setMessages(next); setInput(''); setPinnedContext(''); setLoading(true);
    try {
      const res = await fetch(`${BACKEND}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next, bookTitle: title, currentPage, pageText, tutorMode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Request failed');
      setMessages(m => [...m, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages(m => [...m, { role: 'assistant', content: `Error: ${err.message}` }]);
    } finally { setLoading(false); }
  }, [input, pinnedContext, messages, loading, title, currentPage, pageText, tutorMode]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

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
            <button className="zoom-btn" onClick={() => setScale(s => Math.max(0.5, +(s - 0.1).toFixed(1)))}>−</button>
            <span className="zoom-label">{Math.round(scale * 100)}%</span>
            <button className="zoom-btn" onClick={() => setScale(s => Math.min(3, +(s + 0.1).toFixed(1)))}>+</button>
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
                    {numPages && Array.from({ length: numPages }, (_, i) => (
                      <div key={i + 1} ref={el => { pageRefs.current[i] = el; }} className="pdf-page-wrapper">
                        <Page pageNumber={i + 1} scale={scale} renderAnnotationLayer renderTextLayer />
                      </div>
                    ))}
                  </Document>

                  {selectMode && (
                    <div className="select-overlay" onMouseDown={onSelMouseDown} onMouseMove={onSelMouseMove} onMouseUp={onSelMouseUp}>
                      {selRect && (
                        <div className="sel-rect" style={{ left: selRect.x, top: selRect.y, width: selRect.w, height: selRect.h }} />
                      )}
                      {popupPos && selRect && (
                        <div className="sel-popup" style={{ left: popupPos.x, top: popupPos.y }} onMouseDown={e => e.stopPropagation()}>
                          <button className="make3d-btn" disabled={capturing} onClick={captureAndMakeInteractive}>
                            {capturing ? 'Working…' : '✦ Make Interactive'}
                          </button>
                          <button className="make3d-btn" style={{ background: '#2a2a2a' }} disabled={capturing} onClick={captureAndSend}>
                            {capturing ? '…' : '3D → Chat'}
                          </button>
                          <button className="sel-cancel-btn" onClick={() => { setSelRect(null); setPopupPos(null); }}>✕</button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Inline interactive figure overlays */}
                  {figureOverlays.map(overlay => {
                    const isVisible = overlay.visible !== false;
                    return (
                      <div key={overlay.id}>
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
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', background: '#fff', color: '#999', gap: 10 }}>
                              <div style={{ width: 22, height: 22, border: '2px solid #bbb', borderTopColor: '#555', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                              <span style={{ fontSize: 11, color: '#aaa' }}>Building interactive figure…</span>
                            </div>
                          ) : overlay.html ? (
                            <iframe
                              srcDoc={overlay.html}
                              sandbox="allow-scripts allow-same-origin"
                              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                              title={`interactive-figure-${overlay.id}`}
                            />
                          ) : null}
                        </div>

                        {/* Small toggle pill at top-right corner of the figure — always visible */}
                        {!overlay.loading && overlay.html && (
                          <button
                            onClick={() => setFigureOverlays(prev =>
                              prev.map(o => o.id === overlay.id ? { ...o, visible: !isVisible } : o)
                            )}
                            style={{
                              position: 'absolute',
                              left: overlay.scrollRect.x + overlay.scrollRect.w - 52,
                              top: overlay.scrollRect.y - 16,
                              zIndex: 25,
                              background: isVisible ? 'rgba(60,120,220,0.85)' : 'rgba(120,120,120,0.7)',
                              color: '#fff',
                              border: 'none',
                              borderRadius: '4px 4px 0 0',
                              fontSize: 9,
                              padding: '2px 7px',
                              cursor: 'pointer',
                              backdropFilter: 'blur(4px)',
                              letterSpacing: '0.03em',
                            }}
                            title={isVisible ? 'Show original' : 'Show interactive'}
                          >
                            {isVisible ? '◉ live' : '○ original'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
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
            <div className="tutor-toggle" onClick={() => setTutorMode(m => !m)} title={tutorMode ? 'Tutor mode on — click to turn off' : 'Turn on tutor mode'}>
              <div className={`tutor-toggle-track${tutorMode ? ' on' : ''}`}>
                <div className="tutor-toggle-thumb" />
              </div>
              <span className="tutor-label">Tutor</span>
            </div>
          </div>

          <div className="chat-messages">
            {messages.length === 0 && (
              <div className="chat-empty">
                <p>Open a PDF and start asking questions. Select text to quote it as context.</p>
              </div>
            )}
            {messages.filter(m => !m._tutorCheckin).map((m, i) => (
              <div key={i} className={`message ${m.role}${m.content?.includes?.('```html') ? ' has-viz' : ''}`}>
                <div className="message-bubble">
                  {m.imageData ? (
                    <img src={`data:${m.imageMimeType || 'image/png'};base64,${m.imageData}`} className="msg-thumb" alt="figure" />
                  ) : (
                    <MessageContent content={m.displayContent ?? m.content ?? ''} />
                  )}
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

          <div className="chat-input-row">
            <textarea
              ref={chatInputRef}
              className="chat-input"
              placeholder={pdfUrl ? (pinnedContext ? 'Ask about the selection…' : 'Ask anything about this PDF…') : 'Open a PDF first'}
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
