(() => {
  'use strict';

  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const boardEl = document.getElementById('board');
  const boardOverlay = document.getElementById('boardOverlay');
  
  const displayPiece = document.getElementById('displayPiece');
  
  const statsEl = document.getElementById('stats');
  const modeSelector = document.getElementById('modeSelector');
  const taskSelector = document.getElementById('taskSelector');
  const speedRow = document.getElementById('speedRow');
  const speedSlider = document.getElementById('speedSlider');
  const speedValue = document.getElementById('speedValue');
  const stopBtn = document.getElementById('stopBtn');
  const soundBtn = document.getElementById('soundBtn');

  const SLIDER_MIN = 200;
  const SLIDER_MAX = 5000;
  
  const WHITE_KING = '♔';
  const BLACK_KING = '♚';

  const state = {
    orientation: 'white', // 'white' | 'black'
    mode: 'training',
    task: 'squares',
    target: null,
    correct: 0, wrong: 0, streak: 0, best: 0,
    locked: false, sound: false, speed: 2000, autoRunning: true, selected: null
  };

  let autoTimer = null;
  let sessionToken = 0;
  let speakToken = 0;

  /* ---------- Генерация пулов ---------- */
  function getAllSquares() {
    const pool = [];
    for (let f = 0; f < 8; f++) {
      for (let r = 1; r <= 8; r++) {
        const id = FILES[f] + r;
        const isLight = ((f + (r - 1)) % 2 !== 0);
        const quadrant = (f < 4 ? 0 : 1) + (r <= 4 ? 2 : 0);
        pool.push({ id, cells: [id], isLight, quadrant });
      }
    }
    return pool;
  }

  function getAllDiagonals() {
    const pool = [];
    const seen = new Set();
    const dirs = [
      {df:1, dr:1, name: 'down-right'},
      {df:1, dr:-1, name: 'up-right'},
      {df:-1, dr:1, name: 'down-left'},
      {df:-1, dr:-1, name: 'up-left'}
    ];
    
    for (const dir of dirs) {
      for (let startRank = 1; startRank <= 8; startRank++) {
        const f0 = dir.df === 1 ? 0 : 7;
        let cells = [];
        let f = f0, r = startRank - 1;
        
        while (f >= 0 && f <= 7 && r >= 0 && r <= 7) {
          cells.push(FILES[f] + (r + 1));
          f += dir.df; r += dir.dr;
        }
        
        if (cells.length < 3) continue;
        
        const first = cells[0], last = cells[cells.length - 1];
        const key = first + '-' + last;
        if (seen.has(key)) continue;
        seen.add(key);
        
        const fIdx = FILES.indexOf(first[0]);
        const rIdx = parseInt(first[1], 10) - 1;
        const isLight = ((fIdx + rIdx) % 2 !== 0);
        
        pool.push({ id: key, cells, isLight, direction: dir.name });
      }
    }
    return pool;
  }

  const ALL_SQUARES = getAllSquares();
  const ALL_DIAGONALS = getAllDiagonals();

  /* ---------- Умное перемешивание ---------- */
  function smartShuffle(array, prevItem, isDiagonal = false) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    if (!prevItem) return arr;

    let attempts = 0;
    while (attempts < 10) {
      const first = arr[0];
      let tooSimilar = false;
      if (isDiagonal) {
        if (first.direction === prevItem.direction) tooSimilar = true;
      } else {
        if (first.quadrant === prevItem.quadrant) tooSimilar = true;
      }
      if (!tooSimilar) break;
      const swapIdx = Math.floor(Math.random() * (arr.length - 1)) + 1;
      [arr[0], arr[swapIdx]] = [arr[swapIdx], arr[0]];
      attempts++;
    }
    return arr;
  }

  /* ---------- Мешки ---------- */
  let squareBag = [];
  let diagonalBag = [];
  let lastSquare = null;
  let lastDiagonal = null;

  function getNextSquare() {
    if (squareBag.length === 0) squareBag = smartShuffle(ALL_SQUARES, lastSquare, false);
    lastSquare = squareBag.pop();
    return lastSquare;
  }

  function getNextDiagonal() {
    if (diagonalBag.length === 0) diagonalBag = smartShuffle(ALL_DIAGONALS, lastDiagonal, true);
    lastDiagonal = diagonalBag.pop();
    return lastDiagonal;
  }

  /* ---------- Звук ---------- */
  let audioCtx = null;
  function beep(freq, duration, type = 'sine') {
    if (!state.sound) return;
    try {
      if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = type;
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.08, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      osc.start(now);
      osc.stop(now + duration + 0.02);
    } catch (e) {}
  }

  /* ---------- Озвучка ---------- */
  let voiceRu = null;
  function pickVoice() {
    if (!window.speechSynthesis) return;
    const voices = speechSynthesis.getVoices();
    voiceRu = voices.find(v => v.lang === 'ru-RU') ||
              voices.find(v => v.lang && v.lang.toLowerCase().startsWith('ru')) || null;
  }
  if (window.speechSynthesis) {
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }

  function speak(text) {
    if (!state.sound || !window.speechSynthesis || !text) return Promise.resolve();
    try {
      speechSynthesis.cancel();
      const myToken = ++speakToken;
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ru-RU';
        if (voiceRu) u.voice = voiceRu;
        u.rate = 1.1;
        u.pitch = 1;
        u.volume = 1;
        let done = false;
        const finish = () => { if (done) return; done = true; resolve(); };
        u.onend = finish;
        u.onerror = finish;
        const est = Math.max(600, Math.min(6000, text.length * 110 + 400));
        setTimeout(() => { if (myToken === speakToken) finish(); }, est);
        speechSynthesis.speak(u);
      });
    } catch (e) {
      return Promise.resolve();
    }
  }

  const LETTER_RU = { a:'а', b:'бэ', c:'цэ', d:'дэ', e:'е', f:'эф', g:'жэ', h:'аш' };
  function coordRu(sq) { return (LETTER_RU[sq[0]] || sq[0]) + ' ' + sq[1]; }

  function speakTarget() {
    if (!state.target) return Promise.resolve();
    if (state.task === 'diagonals') {
      const [a, b] = state.target.id.split('-');
      return speak(coordRu(a) + ' — ' + coordRu(b) + ', ' + (state.target.isLight ? 'светлая' : 'тёмная') + ' диагональ');
    }
    return speak(coordRu(state.target.id) + ', ' + (state.target.isLight ? 'светлая' : 'тёмная'));
  }

  /* ---------- Отрисовка ---------- */
  function renderBoard() {
    boardEl.innerHTML = '';
    const files = state.orientation === 'white' ? FILES : [...FILES].reverse();
    const ranks = state.orientation === 'white' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const sq = document.createElement('div');
        sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.square = files[c] + ranks[r];
        sq.addEventListener('click', () => onSquareClick(sq));
        boardEl.appendChild(sq);
      }
    }
  }

  function refreshDisplay() {
    const isWhiteSide = state.orientation === 'white';
    displayPiece.textContent = isWhiteSide ? WHITE_KING : BLACK_KING;
    displayPiece.className = `chess-piece ${isWhiteSide ? 'w' : 'b'}`;

    if (!state.target) {
      boardOverlay.innerHTML = '';
      return;
    }
    boardOverlay.innerHTML = `<span class="coord-text">${state.target.id}</span>`;
  }

  /* ---------- Таймер ---------- */
  function startAutoTimer() {
    clearAutoTimer();
    if (state.mode !== 'auto' || !state.autoRunning) return;

    autoTimer = setTimeout(handleTimeout, state.speed);
  }

  function clearAutoTimer() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }

  function handleTimeout() {
    autoTimer = null;
    if (state.mode !== 'auto' || !state.autoRunning || !state.target) return;
    state.locked = true;
    revealCorrect();
    const token = ++sessionToken;
    setTimeout(() => {
      if (token !== sessionToken) return;
      clearReveal();
      state.locked = false;
      nextTarget();
    }, 600);
  }

  /* ---------- Подсветка ---------- */
  function revealCorrect() {
    if (!state.target) return;
    state.target.cells.forEach(c => {
      const el = boardEl.querySelector(`[data-square="${c}"]`);
      if (el) el.classList.add('correct');
    });
  }

  function clearReveal() {
    boardEl.querySelectorAll('.correct, .wrong, .selected').forEach(el =>
      el.classList.remove('correct', 'wrong', 'selected')
    );
    state.selected = null;
  }

  /* ---------- Клики ---------- */
  function onSquareClick(sq) {
    if (!state.target) return;
    if (state.locked && state.mode === 'training') return;
    const square = sq.dataset.square;

    if (state.task === 'diagonals') {
      onDiagonalClick(sq, square);
    } else {
      onSquareSimpleClick(sq, square);
    }
  }

  function onSquareSimpleClick(sq, square) {
    const correct = square === state.target.id;

    if (state.mode === 'training') {
      clearAutoTimer();
      state.locked = true;
      const token = ++sessionToken;

      if (correct) {
        sq.classList.add('correct');
        beep(880, 0.09, 'sine');
        state.correct++;
        state.streak++;
        if (state.streak > state.best) state.best = state.streak;
        updateStats();
        setTimeout(() => {
          if (token !== sessionToken) return;
          clearReveal();
          state.locked = false;
          nextTarget();
        }, 320);
      } else {
        sq.classList.add('wrong');
        beep(160, 0.22, 'sawtooth');
        state.wrong++;
        state.streak = 0;
        updateStats();
        revealCorrect();
        setTimeout(() => {
          if (token !== sessionToken) return;
          clearReveal();
          state.locked = false;
          nextTarget();
        }, 720);
      }
    } else {
      if (correct) {
        sq.classList.add('correct');
        beep(880, 0.09, 'sine');
      } else {
        sq.classList.add('wrong');
        beep(160, 0.22, 'sawtooth');
      }
      setTimeout(() => {
        if (sq) sq.classList.remove('correct', 'wrong');
      }, 400);
    }
  }

  function onDiagonalClick(sq, square) {
    const ends = [state.target.cells[0], state.target.cells[state.target.cells.length - 1]];

    if (state.mode === 'training') {
      if (!ends.includes(square)) {
        if (state.selected) {
          const prev = boardEl.querySelector(`[data-square="${state.selected}"]`);
          if (prev) prev.classList.remove('selected');
          state.selected = null;
        }
        sq.classList.add('wrong');
        setTimeout(() => sq.classList.remove('wrong'), 720);
        beep(160, 0.22, 'sawtooth');
        state.wrong++;
        state.streak = 0;
        updateStats();
        return;
      }

      if (!state.selected) {
        state.selected = square;
        sq.classList.add('selected');
        beep(660, 0.06, 'sine');
        return;
      }

      if (state.selected === square) {
        sq.classList.remove('selected');
        state.selected = null;
        beep(440, 0.05, 'sine');
        return;
      }

      clearAutoTimer();
      state.locked = true;
      const token = ++sessionToken;

      state.target.cells.forEach(c => {
        const el = boardEl.querySelector(`[data-square="${c}"]`);
        if (el) el.classList.add('correct');
      });
      beep(880, 0.09, 'sine');

      state.correct++;
      state.streak++;
      if (state.streak > state.best) state.best = state.streak;
      updateStats();

      setTimeout(() => {
        if (token !== sessionToken) return;
        clearReveal();
        state.locked = false;
        nextTarget();
      }, 500);
    } else {
      if (!ends.includes(square)) {
        sq.classList.add('wrong');
        setTimeout(() => sq.classList.remove('wrong'), 400);
        beep(160, 0.22, 'sawtooth');
        return;
      }

      if (!state.selected) {
        state.selected = square;
        sq.classList.add('selected');
        beep(660, 0.06, 'sine');
        return;
      }

      if (state.selected === square) {
        sq.classList.remove('selected');
        state.selected = null;
        beep(440, 0.05, 'sine');
        return;
      }

      state.target.cells.forEach(c => {
        const el = boardEl.querySelector(`[data-square="${c}"]`);
        if (el) el.classList.add('correct');
      });
      beep(880, 0.09, 'sine');
      setTimeout(() => {
        boardEl.querySelectorAll('.correct').forEach(el => el.classList.remove('correct'));
        boardEl.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
        state.selected = null;
      }, 400);
    }
  }

  /* ---------- Новый вопрос ---------- */
  async function nextTarget() {
    clearReveal();

    if (state.task === 'diagonals') {
      state.target = getNextDiagonal();
    } else {
      state.target = getNextSquare();
    }

    refreshDisplay();

    const token = ++sessionToken;
    if (state.sound && window.speechSynthesis) {
      await speakTarget();
      if (token !== sessionToken) return;
    }
    startAutoTimer();
  }

  function updateStats() {
    document.getElementById('scoreCorrect').textContent = state.correct;
    document.getElementById('scoreWrong').textContent   = state.wrong;
    document.getElementById('scoreStreak').textContent  = state.streak;
    document.getElementById('scoreBest').textContent    = state.best;
  }

  /* ---------- Управление ---------- */
  function updateStopBtn() {
    if (state.autoRunning) {
      stopBtn.textContent = '⏸ Стоп';
      stopBtn.classList.remove('stopped');
    } else {
      stopBtn.textContent = '▶ Старт';
      stopBtn.classList.add('stopped');
    }
  }

  stopBtn.addEventListener('click', () => {
    state.autoRunning = !state.autoRunning;
    updateStopBtn();
    if (state.autoRunning) {
      if (!state.locked) startAutoTimer();
    } else {
      clearAutoTimer();
      if (window.speechSynthesis) speechSynthesis.cancel();
    }
  });

  function setMode(mode) {
    state.mode = mode;
    modeSelector.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    statsEl.classList.toggle('auto-mode', mode === 'auto');
    speedRow.style.display = mode === 'auto' ? '' : 'none';
    stopBtn.style.display   = mode === 'auto' ? '' : 'none';

    sessionToken++;
    clearAutoTimer();
    clearReveal();
    if (window.speechSynthesis) speechSynthesis.cancel();
    state.locked = false;
    state.streak = 0;
    state.autoRunning = true;
    updateStopBtn();
    updateStats();
    nextTarget();
  }

  taskSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.dataset.task === state.task) return;

    state.task = btn.dataset.task;
    taskSelector.querySelectorAll('button').forEach(b =>
      b.classList.toggle('active', b.dataset.task === state.task)
    );

    sessionToken++;
    clearAutoTimer();
    clearReveal();
    if (window.speechSynthesis) speechSynthesis.cancel();
    state.locked = false;
    state.streak = 0;
    updateStats();
    nextTarget();
  });

  function updateSliderFill() {
    const pct = ((state.speed - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
    speedSlider.style.setProperty('--fill', pct + '%');
  }

  speedSlider.addEventListener('input', () => {
    state.speed = parseInt(speedSlider.value, 10);
    speedValue.textContent = (state.speed / 1000).toFixed(1) + 'с';
    updateSliderFill();
    if (state.mode === 'auto' && state.autoRunning) startAutoTimer();
  });

  modeSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.dataset.mode === state.mode) return;
    setMode(btn.dataset.mode);
  });

  document.getElementById('flipBtn').addEventListener('click', () => {
    if (state.locked) return;
    state.orientation = state.orientation === 'white' ? 'black' : 'white';
    renderBoard();
    refreshDisplay();
    startAutoTimer();
  });

  document.getElementById('resetBtn').addEventListener('click', () => {
    sessionToken++;
    state.correct = 0;
    state.wrong   = 0;
    state.streak  = 0;
    state.best    = 0;
    state.locked  = false;
    clearReveal();
    updateStats();
    clearAutoTimer();
    if (window.speechSynthesis) speechSynthesis.cancel();
    
    squareBag = [];
    diagonalBag = [];
    lastSquare = null;
    lastDiagonal = null;

    nextTarget();
  });

  soundBtn.addEventListener('click', () => {
    state.sound = !state.sound;
    soundBtn.textContent = state.sound ? '🔊' : '🔇';
    if (!state.sound && window.speechSynthesis) speechSynthesis.cancel();
  });

  document.addEventListener('click', function unlockSpeech() {
    if (window.speechSynthesis) {
      try { speechSynthesis.speak(new SpeechSynthesisUtterance('')); } catch (e) {}
    }
    document.removeEventListener('click', unlockSpeech);
  }, { once: true });

  /* ---------- Старт ---------- */
  renderBoard();
  updateStats();
  updateSliderFill();
  soundBtn.textContent = state.sound ? '🔊' : '🔇';
  nextTarget();
})();
