(() => {
  const $ = sel => document.querySelector(sel);
  const display = $('#display');
  const statusEl = $('#status');
  const startBtn = $('#startPause');
  const resetBtn = $('#reset');
  const lapBtn = $('#lap');
  const lapsEl = $('#laps');
  const panel = $('#panel');

  const modeRadios = document.getElementsByName('mode');
  const cdInputsWrap = $('#cdInputs');
  const minInput = $('#min');
  const secInput = $('#sec');
  const preset5 = $('#preset5');

  let mode = 'countdown';           // 'stopwatch' | 'countdown'
  let running = false;

  // Stopwatch state
  let swStart = 0;                  // performance.now() at start
  let swElapsed = 0;                // accumulated ms while paused

  // Countdown state
  let cdTarget = 0;                 // absolute time (performance.now + remaining)
  let cdBaseMs = 30 * 1000;         // initial set ms
  let cdRemain = cdBaseMs;

  let raf = 0;

  // Utils
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const fmt = (ms) => {
    ms = Math.max(0, Math.floor(ms));
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    const hs = Math.floor((ms % 1000) / 10);
    if (h > 0) {
      return `${h}:${pad(m)}:${pad(s)}.${pad(hs)}`;
    }
    return `${pad(m)}:${pad(s)}.${pad(hs)}`;
  };

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(880, ctx.currentTime);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.3, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start();
      o.stop(ctx.currentTime + 0.38);
      setTimeout(() => ctx.close(), 500);
    } catch {}
  }

  function setMode(next) {
    if (mode === next) return;
    mode = next;
    stopLoop();
    running = false;
    startBtn.textContent = '開始';
    startBtn.classList.add('paused');
    lapBtn.disabled = (mode !== 'stopwatch');
    resetBtn.disabled = false;

    if (mode === 'stopwatch') {
      cdInputsWrap.classList.add('hidden');
      statusEl.textContent = 'ストップウォッチ · 待機中';
      display.textContent = fmt(swElapsed = 0);
      lapsEl.innerHTML = '';
    } else {
      cdInputsWrap.classList.remove('hidden');
      statusEl.textContent = 'カウントダウン · 待機中';
      cdBaseMs = readCdInputs();
      cdRemain = cdBaseMs;
      display.textContent = fmt(cdRemain);
      lapsEl.innerHTML = '';
    }
  }

  function start() {
    if (running) return;
    running = true;
    startBtn.textContent = '一時停止';
    startBtn.classList.remove('paused');
    resetBtn.disabled = false;
    if (mode === 'stopwatch') {
      statusEl.textContent = 'ストップウォッチ · 計測中';
      swStart = performance.now();
      loopStopwatch();
    } else {
      // If first start, take current inputs unless already had remaining
      if (cdRemain <= 0 || cdRemain > cdBaseMs) {
        cdBaseMs = readCdInputs();
        cdRemain = cdBaseMs;
      }
      statusEl.textContent = 'カウントダウン · 動作中';
      cdTarget = performance.now() + cdRemain;
      loopCountdown();
    }
  }

  function pause() {
    if (!running) return;
    running = false;
    startBtn.textContent = '再開';
    startBtn.classList.add('paused');
    if (mode === 'stopwatch') {
      swElapsed += performance.now() - swStart;
      statusEl.textContent = 'ストップウォッチ · 一時停止';
    } else {
      cdRemain = Math.max(0, cdTarget - performance.now());
      statusEl.textContent = 'カウントダウン · 一時停止';
    }
    stopLoop();
  }

  function reset() {
    stopLoop();
    running = false;
    startBtn.textContent = '開始';
    startBtn.classList.add('paused');

    if (mode === 'stopwatch') {
      swElapsed = 0;
      display.textContent = fmt(0);
      lapsEl.innerHTML = '';
      statusEl.textContent = 'ストップウォッチ · 待機中';
    } else {
      cdBaseMs = readCdInputs();
      cdRemain = cdBaseMs;
      display.textContent = fmt(cdRemain);
      statusEl.textContent = 'カウントダウン · 待機中';
      panel.classList.remove('flash');
    }
  }

  function addLap() {
    if (!(mode === 'stopwatch' && (running || swElapsed > 0))) return;
    const now = running ? swElapsed + (performance.now() - swStart) : swElapsed;
    const div = document.createElement('div');
    const idx = (lapsEl.children.length + 1);
    div.className = 'lap';
    div.innerHTML = `<span class="idx">#${idx}</span><span>${fmt(now)}</span>`;
    lapsEl.prepend(div);
  }

  function stopLoop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function loopStopwatch() {
    const tick = () => {
      if (!running) return;
      const now = performance.now();
      const ms = swElapsed + (now - swStart);
      display.textContent = fmt(ms);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function loopCountdown() {
    const tick = () => {
      if (!running) return;
      const remain = Math.max(0, cdTarget - performance.now());
      display.textContent = fmt(remain);
      if (remain <= 0) {
        running = false;
        startBtn.textContent = '開始';
        startBtn.classList.add('paused');
        statusEl.textContent = 'カウントダウン · 完了';
        beep();
        panel.classList.remove('flash');
        // trigger flash next frame to restart animation reliably
        requestAnimationFrame(() => {
          panel.classList.add('flash');
        });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function readCdInputs() {
    const m = clamp(parseInt(minInput.value || '0', 10), 0, 999);
    const s = clamp(parseInt(secInput.value || '0', 10), 0, 59);
    minInput.value = String(m);
    secInput.value = String(s);
    return (m * 60 + s) * 1000;
  }

  const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, isFinite(n) ? n : lo));

  // Wire events
  startBtn.addEventListener('click', () => running ? pause() : start());
  resetBtn.addEventListener('click', reset);
  lapBtn.addEventListener('click', addLap);

  for (const r of modeRadios) {
    r.addEventListener('change', (e) => {
      if (e.target.checked) setMode(e.target.value);
    });
  }

  function updateCdPreview() {
    if (mode !== 'countdown' || running) return;
    cdBaseMs = readCdInputs();
    cdRemain = cdBaseMs;
    display.textContent = fmt(cdRemain);
  }
  minInput.addEventListener('input', updateCdPreview);
  secInput.addEventListener('input', updateCdPreview);
  if (preset5) {
    preset5.addEventListener('click', () => {
      minInput.value = '5';
      secInput.value = '0';
      updateCdPreview();
    });
  }

  window.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    if (e.code === 'Space') {
      e.preventDefault();
      running ? pause() : start();
    } else if (e.key.toLowerCase() === 'r') {
      e.preventDefault();
      reset();
    } else if (e.key.toLowerCase() === 'l') {
      if (mode === 'stopwatch') {
        e.preventDefault();
        addLap();
      }
    }
  });

  // Initial render (countdown default)
  cdInputsWrap.classList.remove('hidden');
  cdBaseMs = readCdInputs();
  cdRemain = cdBaseMs;
  display.textContent = fmt(cdRemain);
  statusEl.textContent = 'カウントダウン · 待機中';
  lapBtn.disabled = true;
})();
