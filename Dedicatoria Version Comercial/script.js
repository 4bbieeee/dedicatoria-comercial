(() => {
  'use strict';

  const CONFIG = {
    text: 'I love you',
    color: '#ff0033',
    fontFamily: 'Georgia, "Times New Roman", serif',
    fontStyle: 'italic',
    fontWeight: 400,

    density: 40,
    minFontPx: 9,
    maxFontPx: 34,
    wordGapEm: 0.9,
    viewportFill: 0.9,
    contourOpacity: 1,
    interiorOpacity: 0.78,

    animationMode: 'bloom',
    startDelayMs: 1400,
    formationDurationMs: 6500,
    wordFadeMs: 1100,
    riseEm: 0.7,

    nameColor: '#fff1f4',
    nameFontFamily: '"Arial Black", "Helvetica Neue", Arial, sans-serif',
    nameFontWeight: 900,
    nameStartMs: 700,
    nameDurationMs: 3600,
    nameWordRatio: 0.05,
    nameWordMinPx: 3,
    nameSizeSteps: [1, 0.7],
    nameCoverage: 0.72,
    nameWordGapEm: 0.2,

    glowEnabled: true,
    glowIntensity: 0.9,
    glowBlurEm: 0.7,
    breathing: true,
    breathingSeconds: 4.5,

    audioVolume: 0.8,
    gateFadeMs: 1000,

    maxDevicePixelRatio: 2,

    hole: {
      nameFontRatio: 0.28,
      nameMaxPx: 150,
      widthRatio: 0.72,
      maxWidthRatio: 1.35,
      heightRatio: 0.34,
      paddingRatio: 0.08,
      offsetY: 0.07
    },

    rain: {
      enabled: true,
      fontFamily: '"Courier New", Courier, monospace',
      phrase: 'I love you ',
      columnGapEm: 1.9,
      density: 0.62,
      minSpeed: 4,
      maxSpeed: 11,
      minLength: 7,
      maxLength: 18,
      maxAlpha: 0.3,
      headColor: '255, 190, 205',
      trailColor: '255, 0, 51',
      fps: 24,
      maxLines: 5,
      lineColor: '255, 70, 100',
      lineAlpha: 0.55,
      lineCharsPerSecond: 26,
      lineHoldMs: 2400,
      lineFadeMs: 1000,
      linePauseMinMs: 300,
      linePauseMaxMs: 1800,
      lineTexts: [
        '> I love you',
        '$ sudo ./love --target=you --force',
        'root@heart:~# echo "I love you"',
        'while (alive) { love(you); }',
        'if (you.smile) heart.beat++;',
        '0x49 0x20 0x6C 0x6F 0x76 0x65 0x20 0x79 0x6F 0x75',
        '01001001 00100000 01101100 01101111 01110110 01100101',
        'ACCESS GRANTED :: I love you',
        'decrypting feelings... 100%',
        '> connecting to your heart_',
        'git commit -m "I love you"',
        'import love from "you";'
      ]
    }
  };

  const CONTOUR_SPAN = 0.5;
  const INTERIOR_START = 0.35;
  const MIN_WORD_SCALE = 0.82;
  const MAX_WORD_SCALE = 1.3;

  const stage = document.getElementById('stage');
  const heartCanvas = document.getElementById('heart-canvas');
  const glowCanvas = document.getElementById('glow-canvas');
  const rainCanvas = document.getElementById('rain-canvas');
  const nameEl = document.getElementById('recipient-name');
  const gate = document.getElementById('gate');
  const gateButton = document.getElementById('gate-button');
  const audioEl = document.getElementById('bg-audio');
  if (!stage || !heartCanvas || !glowCanvas || !nameEl) return;

  const ctx = heartCanvas.getContext('2d');
  const gctx = glowCanvas.getContext('2d');
  const rctx = rainCanvas ? rainCanvas.getContext('2d') : null;
  const bakedCanvas = document.createElement('canvas');
  const bctx = bakedCanvas.getContext('2d');
  const measureCtx = document.createElement('canvas').getContext('2d');
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  const rootStyle = document.documentElement.style;
  rootStyle.setProperty('--heart-color', CONFIG.color);
  rootStyle.setProperty('--glow-max', String(CONFIG.glowIntensity));
  rootStyle.setProperty('--breathe-duration', CONFIG.breathingSeconds + 's');

  const nameParam = new URLSearchParams(window.location.search).get('nombre');
  if (nameParam && nameParam.trim()) nameEl.textContent = nameParam.trim().slice(0, 48);

  const heartField = (x, y) => {
    const a = x * x + y * y - 1;
    return a * a * a - x * x * y * y * y;
  };
  const isInsideHeart = (x, y) => heartField(x, y) <= 0;

  const HEART_BOUNDS = (() => {
    let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
    const step = 0.004;
    for (let y = -1.5; y <= 1.6; y += step) {
      for (let x = -1.5; x <= 1.5; x += step) {
        if (isInsideHeart(x, y)) {
          if (x < xMin) xMin = x;
          if (x > xMax) xMax = x;
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
    }
    return { xMin, xMax, yMin, yMax };
  })();

  function heartDepth(x, y) {
    let lo = 0.02, hi = 1.6;
    for (let i = 0; i < 22; i++) {
      const mid = (lo + hi) / 2;
      if (isInsideHeart(x / mid, y / mid)) hi = mid; else lo = mid;
    }
    return hi;
  }

  let words = [];
  let rain = null;
  let dpr = 1;
  let fontPx = 16;
  let glowBlurPx = 10;
  let settled = 0;
  let finished = false;
  let started = false;
  let entered = !gate || !gateButton;
  let t0 = 0;
  let rafId = 0;
  let rainRafId = 0;
  let rainLast = 0;
  let resizeTimer = 0;
  let gateTimer = 0;

  const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
  const rand = (a, b) => a + Math.random() * (b - a);
  const fontCss = (px) => `${CONFIG.fontStyle} ${CONFIG.fontWeight} ${px}px ${CONFIG.fontFamily}`;
  const nameFontCss = (px) => `${CONFIG.nameFontWeight} ${px}px ${CONFIG.nameFontFamily}`;
  const easeOutCubic = (u) => 1 - Math.pow(1 - clamp(u, 0, 1), 3);
  const easeInOutSine = (u) => 0.5 * (1 - Math.cos(Math.PI * clamp(u, 0, 1)));
  const jitterOf = (x, y) => {
    const v = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return v - Math.floor(v) - 0.5;
  };

  function setupCanvases(W, H) {
    dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxDevicePixelRatio);
    const pxW = Math.round(W * dpr);
    const pxH = Math.round(H * dpr);
    const visible = [heartCanvas, glowCanvas];
    if (rainCanvas) visible.push(rainCanvas);
    visible.concat([bakedCanvas]).forEach((c) => { c.width = pxW; c.height = pxH; });
    visible.forEach((c) => {
      c.style.width = W + 'px';
      c.style.height = H + 'px';
    });
  }

  function applyTextStyle(c) {
    c.font = fontCss(fontPx);
    c.fillStyle = CONFIG.color;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
  }

  function measureName(label, px) {
    measureCtx.font = nameFontCss(px);
    const m = measureCtx.measureText(label);
    const asc = m.actualBoundingBoxAscent || px * 0.75;
    const desc = m.actualBoundingBoxDescent || px * 0.2;
    const left = m.actualBoundingBoxLeft || 0;
    const right = m.actualBoundingBoxRight || m.width;
    return { asc, desc, left, textW: Math.max(1, left + right) };
  }

  function buildNameWords(label, namePx, metrics, hole, wordW) {
    const result = [];
    if (!label.trim()) return result;

    const maskW = Math.ceil(metrics.textW) + 4;
    const maskH = Math.ceil(metrics.asc + metrics.desc) + 4;

    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = maskW;
    maskCanvas.height = maskH;
    const mctx = maskCanvas.getContext('2d', { willReadFrequently: true });
    mctx.font = nameFontCss(namePx);
    mctx.textAlign = 'left';
    mctx.textBaseline = 'alphabetic';
    mctx.fillStyle = '#ffffff';
    mctx.fillText(label, 2 + metrics.left, 2 + metrics.asc);
    const data = mctx.getImageData(0, 0, maskW, maskH).data;

    const stride = maskW + 1;
    const sat = new Int32Array(stride * (maskH + 1));
    for (let y = 0; y < maskH; y++) {
      for (let x = 0; x < maskW; x++) {
        const on = data[(y * maskW + x) * 4 + 3] > 128 ? 1 : 0;
        sat[(y + 1) * stride + (x + 1)] =
          on + sat[y * stride + (x + 1)] + sat[(y + 1) * stride + x] - sat[y * stride + x];
      }
    }

    const coverage = (x, y, w, h) => {
      const x2 = Math.min(maskW, x + w);
      const y2 = Math.min(maskH, y + h);
      const sum = sat[y2 * stride + x2] - sat[y * stride + x2] - sat[y2 * stride + x] + sat[y * stride + x];
      return sum / (w * h);
    };

    const baseWordPx = Math.max(CONFIG.nameWordMinPx, namePx * CONFIG.nameWordRatio);
    const boxes = [];

    const collides = (x, y, w, h, gap) => {
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (x < b.x + b.w + gap && x + w + gap > b.x && y < b.y + b.h + gap && y + h + gap > b.y) return true;
      }
      return false;
    };

    const tryPlace = (x, y, w, h, rotated, scale, px, gap) => {
      if (coverage(x, y, w, h) < CONFIG.nameCoverage) return false;
      if (collides(x, y, w, h, gap)) return false;
      boxes.push({ x, y, w, h, rotated, scale, px });
      return true;
    };

    CONFIG.nameSizeSteps.forEach((step) => {
      const wordPx = baseWordPx * step;
      if (wordPx < 2.5) return;
      const scale = wordPx / fontPx;
      const boxW = Math.ceil(wordW * scale);
      const boxH = Math.max(2, Math.ceil(wordPx * 0.9));
      const gap = wordPx * CONFIG.nameWordGapEm;
      if (boxW > maskW && boxW > maskH) return;

      for (let y = 0; y + boxH <= maskH; y++) {
        for (let x = 0; x + boxW <= maskW; x++) {
          if (tryPlace(x, y, boxW, boxH, false, scale, wordPx, gap)) x += boxW - 1;
        }
      }
      for (let x = 0; x + boxH <= maskW; x++) {
        for (let y = 0; y + boxW <= maskH; y++) {
          if (tryPlace(x, y, boxH, boxW, true, scale, wordPx, gap)) y += boxW - 1;
        }
      }
    });

    const originX = hole.x - maskW / 2;
    const originY = hole.y - maskH / 2;
    boxes.forEach((b) => {
      result.push({
        x: originX + b.x + b.w / 2,
        y: originY + b.y + b.h / 2,
        scale: b.scale,
        cos: b.rotated ? 0 : 1,
        sin: b.rotated ? -1 : 0,
        color: CONFIG.nameColor,
        alpha: 1,
        rise: CONFIG.riseEm * b.px,
        glowMul: 0,
        isName: true
      });
    });
    return result;
  }

  function buildRain(W, H, S, cx, cy, yMid) {
    const rc = CONFIG.rain;
    const fontSize = clamp(W / 70, 8, 14);
    const lineStep = fontSize * 1.2;
    const font = `${fontSize}px ${rc.fontFamily}`;
    measureCtx.font = font;
    const charW = measureCtx.measureText('M').width;
    const colStep = charW * rc.columnGapEm;
    const colCount = Math.max(1, Math.floor(W / colStep));
    const rows = Math.ceil(H / lineStep) + 1;

    const inside = new Uint8Array(colCount * rows);
    for (let c = 0; c < colCount; c++) {
      const x = c * colStep + colStep / 2;
      for (let r = 0; r < rows; r++) {
        const y = r * lineStep + lineStep / 2;
        const hx = (x - cx) / S;
        const hy = yMid - (y - cy) / S;
        inside[c * rows + r] = isInsideHeart(hx / 1.07, hy / 1.07) ? 1 : 0;
      }
    }

    const spawn = (col, first) => {
      col.speed = rand(rc.minSpeed, rc.maxSpeed);
      col.length = Math.round(rand(rc.minLength, rc.maxLength));
      col.offset = Math.floor(Math.random() * rc.phrase.length);
      col.head = first ? -Math.random() * rows * 1.2 : -Math.random() * 6;
    };

    const columns = [];
    for (let c = 0; c < colCount; c++) {
      if (Math.random() > rc.density) continue;
      const col = { index: c, x: c * colStep + colStep / 2, head: 0, speed: 0, length: 0, offset: 0 };
      spawn(col, true);
      columns.push(col);
    }

    const levels = 8;
    const trailStyles = [];
    for (let i = 0; i < levels; i++) {
      trailStyles.push(`rgba(${rc.trailColor}, ${(rc.maxAlpha * Math.pow(1 - i / levels, 1.6)).toFixed(3)})`);
    }
    const headStyle = `rgba(${rc.headColor}, ${Math.min(1, rc.maxAlpha * 2.2).toFixed(3)})`;

    const lineFontSize = fontSize * 1.05;
    const lineFont = `${lineFontSize}px ${rc.fontFamily}`;
    measureCtx.font = lineFont;
    const lineCharW = measureCtx.measureText('M').width;
    const slotCount = clamp(Math.round(W / 320), 2, rc.maxLines);
    const slots = [];
    for (let i = 0; i < slotCount; i++) {
      slots.push({ phase: 'idle', wait: rand(600, 3000), text: '', x: 0, y: 0, w: 0, timer: 0 });
    }

    return {
      W, H, S, cx, cy, yMid,
      font, lineStep, rows, colStep, columns, inside, spawn, levels, trailStyles, headStyle,
      lineFont, lineFontSize, lineCharW, slots
    };
  }

  function nearHeart(r, x, y) {
    const hx = (x - r.cx) / r.S;
    const hy = r.yMid - (y - r.cy) / r.S;
    return isInsideHeart(hx / 1.05, hy / 1.05);
  }

  function placeLine(r, slot) {
    const rc = CONFIG.rain;
    const pad = r.lineFontSize * 1.5;
    const texts = rc.lineTexts.slice().sort(() => Math.random() - 0.5);
    measureCtx.font = r.lineFont;

    for (let t = 0; t < texts.length; t++) {
      const text = texts[t];
      const w = measureCtx.measureText(text).width + r.lineCharW;
      if (w > r.W - 2 * pad) continue;

      for (let attempt = 0; attempt < 14; attempt++) {
        const x = rand(pad, r.W - w - pad);
        const y = rand(pad, r.H - pad);
        const h = r.lineFontSize * 1.3;

        let clear = true;
        for (let sx = x; sx <= x + w + r.lineCharW * 3; sx += r.lineCharW * 3) {
          const px = Math.min(sx, x + w);
          if (nearHeart(r, px, y) || nearHeart(r, px, y - h / 2) || nearHeart(r, px, y + h / 2)) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;

        for (let i = 0; i < r.slots.length; i++) {
          const o = r.slots[i];
          if (o === slot || o.phase === 'idle') continue;
          if (x < o.x + o.w + pad && x + w + pad > o.x && Math.abs(y - o.y) < h * 1.6) {
            clear = false;
            break;
          }
        }
        if (!clear) continue;

        slot.text = text;
        slot.x = x;
        slot.y = y;
        slot.w = w;
        slot.timer = 0;
        slot.phase = 'typing';
        return true;
      }
    }
    return false;
  }

  function updateRain(dtMs) {
    const r = rain;
    if (!r) return;
    const rc = CONFIG.rain;
    const dt = dtMs / 1000;

    for (let i = 0; i < r.columns.length; i++) {
      const col = r.columns[i];
      col.head += col.speed * dt;
      if (col.head - col.length > r.rows) r.spawn(col, false);
    }

    for (let i = 0; i < r.slots.length; i++) {
      const slot = r.slots[i];
      if (slot.phase === 'idle') {
        slot.wait -= dtMs;
        if (slot.wait <= 0 && !placeLine(r, slot)) slot.wait = 400;
      } else if (slot.phase === 'typing') {
        slot.timer += dtMs;
        if ((slot.timer / 1000) * rc.lineCharsPerSecond >= slot.text.length) {
          slot.phase = 'hold';
          slot.timer = 0;
        }
      } else if (slot.phase === 'hold') {
        slot.timer += dtMs;
        if (slot.timer >= rc.lineHoldMs) {
          slot.phase = 'fade';
          slot.timer = 0;
        }
      } else if (slot.phase === 'fade') {
        slot.timer += dtMs;
        if (slot.timer >= rc.lineFadeMs) {
          slot.phase = 'idle';
          slot.wait = rand(rc.linePauseMinMs, rc.linePauseMaxMs);
        }
      }
    }
  }

  function drawRain(now) {
    const r = rain;
    if (!r || !rctx) return;
    const rc = CONFIG.rain;

    rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    rctx.clearRect(0, 0, r.W, r.H);
    rctx.font = r.font;
    rctx.textAlign = 'center';
    rctx.textBaseline = 'middle';

    const phrase = rc.phrase;
    for (let i = 0; i < r.columns.length; i++) {
      const col = r.columns[i];
      const headRow = Math.floor(col.head);
      for (let k = 0; k < col.length; k++) {
        const row = headRow - k;
        if (row < 0 || row >= r.rows) continue;
        if (r.inside[col.index * r.rows + row]) continue;
        const ch = phrase[(col.offset + row) % phrase.length];
        if (ch === ' ') continue;
        rctx.fillStyle = k === 0
          ? r.headStyle
          : r.trailStyles[Math.min(r.levels - 1, Math.floor((k / col.length) * r.levels))];
        rctx.fillText(ch, col.x, row * r.lineStep + r.lineStep / 2);
      }
    }

    rctx.font = r.lineFont;
    rctx.textAlign = 'left';
    const cursorOn = Math.floor(now / 450) % 2 === 0;
    for (let i = 0; i < r.slots.length; i++) {
      const slot = r.slots[i];
      if (slot.phase === 'idle') continue;

      let alpha = rc.lineAlpha;
      let shown = slot.text;
      if (slot.phase === 'typing') {
        shown = slot.text.slice(0, Math.floor((slot.timer / 1000) * rc.lineCharsPerSecond));
      } else if (slot.phase === 'fade') {
        alpha *= 1 - slot.timer / rc.lineFadeMs;
      }

      rctx.fillStyle = `rgba(${rc.lineColor}, ${alpha.toFixed(3)})`;
      rctx.fillText(shown, slot.x, slot.y);

      if (cursorOn && slot.phase !== 'fade') {
        const cursorX = slot.x + rctx.measureText(shown).width + 1;
        rctx.fillRect(cursorX, slot.y - r.lineFontSize * 0.5, r.lineCharW * 0.6, r.lineFontSize);
      }
    }
  }

  function rainFrame(now) {
    rainRafId = requestAnimationFrame(rainFrame);
    const step = now - rainLast;
    if (step < 1000 / CONFIG.rain.fps) return;
    rainLast = now;
    updateRain(Math.min(step, 120));
    drawRain(now);
  }

  function startRain() {
    if (!rctx || !CONFIG.rain.enabled || motionQuery.matches) return;
    rainLast = performance.now();
    rainCanvas.classList.add('is-visible');
    rainRafId = requestAnimationFrame(rainFrame);
  }

  function buildLayout() {
    const W = stage.clientWidth;
    const H = stage.clientHeight;
    if (W <= 0 || H <= 0) return false;

    setupCanvases(W, H);

    const { xMin, xMax, yMin, yMax } = HEART_BOUNDS;
    const boundsW = xMax - xMin;
    const boundsH = yMax - yMin;
    const yMid = (yMin + yMax) / 2;
    const S = Math.min((W * CONFIG.viewportFill) / boundsW, (H * CONFIG.viewportFill) / boundsH);
    const cx = W / 2;
    const cy = H / 2;
    const heightPx = boundsH * S;
    const top = cy - heightPx / 2;

    const toHeartX = (px) => (px - cx) / S;
    const toHeartY = (py) => yMid - (py - cy) / S;
    const insidePx = (px, py) => isInsideHeart(toHeartX(px), toHeartY(py));

    fontPx = clamp((heightPx / CONFIG.density) * 0.8, CONFIG.minFontPx, CONFIG.maxFontPx);
    const rows = Math.max(1, Math.floor(heightPx / (fontPx * 1.25)));
    const lineH = heightPx / rows;
    const bandHalf = fontPx * 0.5;
    glowBlurPx = fontPx * CONFIG.glowBlurEm;

    measureCtx.font = fontCss(fontPx);
    const wordW = measureCtx.measureText(CONFIG.text).width;
    const baseGap = fontPx * CONFIG.wordGapEm;

    [ctx, bctx, gctx].forEach(applyTextStyle);

    const hc = CONFIG.hole;
    const label = nameEl.textContent.trim();
    const pad = S * hc.paddingRatio;
    let namePx = Math.min(S * hc.nameFontRatio, hc.nameMaxPx);
    let metrics = measureName(label || ' ', namePx);
    const maxTextW = hc.maxWidthRatio * S - 2 * pad;
    if (metrics.textW > maxTextW) {
      namePx *= maxTextW / metrics.textW;
      metrics = measureName(label || ' ', namePx);
    }
    const holeW = clamp(metrics.textW + 2 * pad, hc.widthRatio * S, hc.maxWidthRatio * S);
    const holeH = Math.max(hc.heightRatio * S, (metrics.asc + metrics.desc) * 1.45);
    const hole = { x: cx, y: cy - hc.offsetY * S, hw: holeW / 2, hh: holeH / 2 };

    const xFrom = Math.floor(cx - (boundsW * S) / 2) - 2;
    const xTo = Math.ceil(cx + (boundsW * S) / 2) + 2;

    function rowIntervals(yc) {
      const ys = [yc - bandHalf, yc, yc + bandHalf].map(toHeartY);
      const out = [];
      let start = null;
      let last = null;
      for (let px = xFrom; px <= xTo; px += 1) {
        const hx = toHeartX(px);
        const inside = isInsideHeart(hx, ys[0]) && isInsideHeart(hx, ys[1]) && isInsideHeart(hx, ys[2]);
        if (inside) {
          if (start === null) start = px;
          last = px;
        } else if (start !== null) {
          out.push({ xs: start, xe: last, edgeL: true, edgeR: true });
          start = null;
        }
      }
      if (start !== null) out.push({ xs: start, xe: last, edgeL: true, edgeR: true });
      return out.filter((iv) => iv.xe - iv.xs > 1);
    }

    function subtractHole(iv, yc) {
      const dMin = Math.max(0, Math.abs(yc - hole.y) - bandHalf);
      if (dMin >= hole.hh) return [iv];
      const half = hole.hw * Math.pow(1 - Math.pow(dMin / hole.hh, 4), 0.25);
      const holeL = hole.x - half;
      const holeR = hole.x + half;
      if (iv.xe <= holeL || iv.xs >= holeR) return [iv];
      const pieces = [];
      if (holeL - iv.xs > 0) pieces.push({ xs: iv.xs, xe: holeL, edgeL: iv.edgeL, edgeR: false });
      if (iv.xe - holeR > 0) pieces.push({ xs: holeR, xe: iv.xe, edgeL: false, edgeR: iv.edgeR });
      return pieces;
    }

    function placeWords(seg, yc, list) {
      const len = seg.xe - seg.xs;
      if (len < wordW * MIN_WORD_SCALE) return;

      const ideal = (len + baseGap) / (wordW + baseGap);
      let best = null;
      new Set([Math.floor(ideal), Math.round(ideal), Math.ceil(ideal)]).forEach((n) => {
        if (n < 1) return;
        const s = (len - (n - 1) * baseGap) / (n * wordW);
        if (s < MIN_WORD_SCALE || s > MAX_WORD_SCALE) return;
        const score = Math.abs(Math.log(s));
        if (!best || score < best.score) best = { n, s, score };
      });
      if (!best) best = { n: 1, s: 1, score: 0 };

      const { n, s } = best;
      const ww = wordW * s;
      for (let k = 0; k < n; k++) {
        const x = n === 1 ? (seg.xs + seg.xe) / 2 : seg.xs + ww / 2 + k * (ww + baseGap);
        const edge = n === 1
          ? (seg.edgeL || seg.edgeR)
          : (k === 0 && seg.edgeL) || (k === n - 1 && seg.edgeR);
        list.push({ x, y: yc, scale: s, edge });
      }
    }

    const list = [];
    for (let r = 0; r < rows; r++) {
      const yc = top + (r + 0.5) * lineH;
      rowIntervals(yc).forEach((iv) => {
        subtractHole(iv, yc).forEach((seg) => placeWords(seg, yc, list));
      });
    }

    const centerHeartY = toHeartY(hole.y);
    const probe = lineH * 1.1;
    list.forEach((w) => {
      const hx = toHeartX(w.x);
      const hy = toHeartY(w.y);
      w.k = heartDepth(hx, hy);
      w.absTheta = Math.abs(Math.atan2(hx, -(hy - centerHeartY)));
      w.contour = w.edge || !insidePx(w.x, w.y - probe) || !insidePx(w.x, w.y + probe);
      w.alpha = w.contour
        ? CONFIG.contourOpacity
        : CONFIG.interiorOpacity * (0.8 + 0.2 * Math.min(1, w.k));
      w.cos = 1;
      w.sin = 0;
      w.color = CONFIG.color;
      w.rise = CONFIG.riseEm * fontPx;
      w.glowMul = 1;
      w.isName = false;
    });

    assignHeartTimings(list);

    const nameWords = label ? buildNameWords(label, namePx, metrics, hole, wordW) : [];
    assignNameTimings(nameWords);

    words = list.concat(nameWords);
    words.sort((a, b) => a.start - b.start);
    settled = 0;

    rain = buildRain(W, H, S, cx, cy, yMid);
    return true;
  }

  function assignHeartTimings(list) {
    const norm = (i, total) => (total > 1 ? i / (total - 1) : 0);

    if (CONFIG.animationMode === 'bottom-up') {
      list.slice().sort((a, b) => b.y - a.y || a.x - b.x)
        .forEach((w, i, arr) => { w.tFrac = norm(i, arr.length); });
    } else if (CONFIG.animationMode === 'contour-first') {
      const contour = list.filter((w) => w.contour)
        .sort((a, b) => a.absTheta - b.absTheta || a.y - b.y);
      const interior = list.filter((w) => !w.contour)
        .sort((a, b) => Math.round(b.k * 12) - Math.round(a.k * 12) || a.absTheta - b.absTheta);
      contour.forEach((w, i) => { w.tFrac = CONTOUR_SPAN * norm(i, contour.length); });
      interior.forEach((w, i) => {
        w.tFrac = INTERIOR_START + (1 - INTERIOR_START) * norm(i, interior.length);
      });
    } else {
      let keyMin = Infinity;
      let keyMax = -Infinity;
      list.forEach((w) => {
        w.key = w.k + (0.1 * w.absTheta) / Math.PI;
        if (w.key < keyMin) keyMin = w.key;
        if (w.key > keyMax) keyMax = w.key;
      });
      const span = keyMax - keyMin || 1;
      list.slice().sort((a, b) => a.key - b.key)
        .forEach((w, i, arr) => {
          const keyNorm = (w.key - keyMin) / span;
          const mixed = 0.5 * keyNorm + 0.5 * norm(i, arr.length);
          w.tFrac = clamp(easeInOutSine(mixed) + jitterOf(w.x, w.y) * 0.015, 0, 1);
        });
    }

    list.forEach((w) => { w.start = CONFIG.startDelayMs + w.tFrac * CONFIG.formationDurationMs; });
  }

  function assignNameTimings(list) {
    if (!list.length) return;
    let minX = Infinity;
    let maxX = -Infinity;
    list.forEach((w) => {
      if (w.x < minX) minX = w.x;
      if (w.x > maxX) maxX = w.x;
    });
    const span = maxX - minX || 1;
    list.forEach((w) => {
      const frac = clamp((w.x - minX) / span + jitterOf(w.x, w.y) * 0.04, 0, 1);
      w.start = CONFIG.nameStartMs + frac * CONFIG.nameDurationMs;
    });
  }

  function drawWord(c, w, p) {
    const a = dpr * w.scale * (0.8 + 0.2 * p);
    c.setTransform(a * w.cos, a * w.sin, -a * w.sin, a * w.cos, w.x * dpr, (w.y + (1 - p) * w.rise) * dpr);
    c.globalAlpha = w.alpha * p;
    c.fillStyle = w.color;
    c.fillText(CONFIG.text, 0, 0);
  }

  function renderAt(t) {
    const n = words.length;

    while (settled < n && t >= words[settled].start + CONFIG.wordFadeMs) {
      drawWord(bctx, words[settled], 1);
      settled++;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, heartCanvas.width, heartCanvas.height);
    ctx.drawImage(bakedCanvas, 0, 0);

    for (let i = settled; i < n; i++) {
      const w = words[i];
      if (w.start > t) break;
      drawWord(ctx, w, easeOutCubic((t - w.start) / CONFIG.wordFadeMs));
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
  }

  function drawGlow() {
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.globalAlpha = 1;
    gctx.clearRect(0, 0, glowCanvas.width, glowCanvas.height);
    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      if (w.glowMul <= 0) continue;
      gctx.shadowColor = w.color;
      gctx.shadowBlur = glowBlurPx * dpr * w.glowMul;
      drawWord(gctx, w, 1);
    }
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.globalAlpha = 1;
  }

  function frame(now) {
    rafId = 0;
    renderAt(Math.max(0, now - t0));
    if (settled < words.length) {
      rafId = requestAnimationFrame(frame);
    } else {
      onComplete();
    }
  }

  function onComplete() {
    finished = true;
    if (!CONFIG.glowEnabled) return;
    drawGlow();
    glowCanvas.classList.add(CONFIG.breathing ? 'is-breathing' : 'is-visible');
  }

  function showStatic() {
    finished = true;
    renderAt(Infinity);
    if (CONFIG.glowEnabled) {
      drawGlow();
      glowCanvas.classList.add('is-visible');
    }
  }

  function startHeart() {
    if (motionQuery.matches) {
      showStatic();
      return;
    }
    t0 = performance.now();
    renderAt(0);
    rafId = requestAnimationFrame(frame);
  }

  function stopAll() {
    if (rafId) cancelAnimationFrame(rafId);
    if (rainRafId) cancelAnimationFrame(rainRafId);
    rafId = 0;
    rainRafId = 0;
    clearTimeout(resizeTimer);
  }

  function init() {
    stopAll();
    glowCanvas.classList.remove('is-visible', 'is-breathing');
    if (rainCanvas) rainCanvas.classList.remove('is-visible');
    finished = false;
    started = false;
    settled = 0;

    if (!buildLayout()) return;
    started = true;

    startRain();
    if (entered) startHeart();
  }

  function enter() {
    if (entered) return;
    entered = true;

    if (audioEl) {
      audioEl.volume = CONFIG.audioVolume;
      audioEl.play().catch(() => {});
    }

    if (gate) {
      gate.classList.add('is-hidden');
      gateTimer = setTimeout(() => gate.classList.add('is-gone'), CONFIG.gateFadeMs);
    }

    if (!started) {
      init();
    } else {
      startHeart();
    }
  }

  function handleResize() {
    if (!started) { init(); return; }
    if (!buildLayout()) return;
    if (!entered) return;
    if (finished) {
      renderAt(Infinity);
      if (CONFIG.glowEnabled) drawGlow();
    } else {
      renderAt(performance.now() - t0);
    }
  }

  function scheduleResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(handleResize, 120);
  }

  window.addEventListener('resize', scheduleResize);
  window.addEventListener('orientationchange', scheduleResize);
  if (motionQuery.addEventListener) motionQuery.addEventListener('change', init);

  window.addEventListener('pagehide', () => {
    stopAll();
    clearTimeout(gateTimer);
    if (audioEl) audioEl.pause();
  });

  window.addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    init();
    if (entered && audioEl) audioEl.play().catch(() => {});
  });

  if (gateButton) {
    gateButton.addEventListener('click', enter);
    gateButton.focus({ preventScroll: true });
  }

  init();
})();