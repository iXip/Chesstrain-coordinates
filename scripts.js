(() => {
  'use strict';

  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const boardEl          = document.getElementById('board');
  const boardOverlay     = document.getElementById('boardOverlay');
  const targetCard       = document.getElementById('targetCard');
  const targetValue      = document.getElementById('targetValue');
  const targetLabel      = document.getElementById('targetLabel');
  const scoreCorrect     = document.getElementById('scoreCorrect');
  const scoreWrong       = document.getElementById('scoreWrong');
  const scoreStreak      = document.getElementById('scoreStreak');
  const scoreBest        = document.getElementById('scoreBest');
  const statsEl          = document.getElementById('stats');
  const modeSelector     = document.getElementById('modeSelector');
  const taskSelector     = document.getElementById('taskSelector');
  const displayModes     = document.getElementById('displayModes');
  const speedRow         = document.getElementById('speedRow');
  const speedSlider      = document.getElementById('speedSlider');
  const speedValue       = document.getElementById('speedValue');
  const progressTrack    = document.getElementById('progressTrack');
  const progressFill     = document.getElementById('progressFill');
  const stopBtn          = document.getElementById('stopBtn');
  const speakColorToggle = document.getElementById('speakColorToggle');
  const soundBtn         = document.getElementById('soundBtn');

  const SLIDER_MIN = 500;
  const SLIDER_MAX = 5000;

  const state = {
    orientation: 'white',
    mode: 'training',      // 'training' | 'auto'
    task: 'squares',       // 'squares' | 'diagonals'
    target: null,          // { id, cells, color, key }
    correct: 0,
    wrong: 0,
    streak: 0,
    best: 0,
    locked: false,
    sound: false,          // звук выключен по умолчанию
    speed: 2000,
    displayMode: 'above',  // 'above' | 'center' | 'onboard'
    autoRunning: true,
    speakColor: true,
  };

  let autoTimer = null;
  let sessionToken = 0;
  let speakToken = 0;

  /* ---------- Звук (бипы) ---------- */
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

  /* ---------- Озвучка (Web Speech API) ---------- */
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

  // Promise резолвится, когда речь закончилась (или сразу, если звук выкл)
  function speak(text) {
    if (!state.sound || !window.speechSynthesis || !text) return Promise.resolve();
    try {
      speechSynthesis.cancel();
      const myToken = ++speakToken;
      return new Promise((resolve) => {
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'ru-RU';
        if (voiceRu) u.voice = voiceRu;
        u.rate = 0.95;
        u.pitch = 1;
        u.volume = 1;

        let done = false;
        const finish = () => { if (done) return; done = true; resolve(); };
        u.onend = finish;
        u.onerror = finish;

        // страховка от Safari
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
      if (state.speakColor) {
        return speak(coordRu(a) + ' — ' + coordRu(b) + ', ' + state.target.color + ' диагональ');
      }
      return speak('диагональ ' + coordRu(a) + ' — ' + coordRu(b));
    }

    if (state.speakColor) {
      return speak(coordRu(state.target.id) + ', ' + state.target.color);
    }
    return speak(coordRu(state.target.id));
  }

  /* ---------- Утилиты диагоналей ---------- */
  function coordToSquare(f, r) {
    if (f < 0 || f > 7 || r < 0 || r > 7) return null;
    return FILES[f] + (r + 1);
  }

  function diagonalSquares(f0, r0, df, dr) {
    const cells = [];
    let f = f0, r = r0;
    while (coordToSquare(f, r)) {
      cells.push(coordToSquare(f, r));
      f += df; r += dr;
    }
    return cells;
  }

  function randomDiagonal() {
    const dirs = [
      { df: 1,  dr: 1  },
      { df: 1,  dr: -1 },
      { df: -1, dr: 1  },
      { df: -1, dr: -1 },
    ];
    const dir = dirs[Math.floor(Math.random() * 4)];
    let cells;
    do {
      const f0 = dir.df === 1 ? 0 : 7;
      const r0 = Math.floor(Math.random() * 8);
      cells = diagonalSquares(f0, r0, dir.df, dir.dr);
    } while (cells.length < 3);

    const first = cells[0];
    const last  = cells[cells.length - 1];
    const fIdx  = FILES.indexOf(first[0]);
    const rIdx  = parseInt(first[1], 10) - 1;
    const color = ((fIdx + rIdx) % 2 === 0) ? 'тёмная' : 'светлая';

    return { id: first + '-' + last, cells, color, key: first + '-' + last };
  }

  /* ---------- Отрисовка доски ---------- */
  function renderBoard() {
    boardEl.innerHTML = '';

    const files = state.orientation === 'white' ? FILES : [...FILES].reverse();
    const ranks = state.orientation === 'white'
      ? [8, 7, 6, 5, 4, 3, 2, 1]
      : [1, 2, 3, 4, 5, 6, 7, 8];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = files[c];
        const rank = ranks[r];

        const sq = document.createElement('div');
        sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.square = file + rank;

        if (c === 0) {
          const l = document.createElement('span');
          l.className = 'label rank-label';
          l.textContent = rank;
          sq.appendChild(l);
        }
        if (r === 7) {
          const l = document.createElement('span');
          l.className = 'label file-label';
          l.textContent = file;
          sq.appendChild(l);
        }

        sq.addEventListener('click', () => onSquareClick(sq));
        boardEl.appendChild(sq);
      }
    }
  }

  /* ---------- Текст вопроса ---------- */
  function displayText() {
    if (!state.target) return '—';
    if (state.task === 'diagonals') return state.target.id + ' · ' + state.target.color;
    return state.target.id;
  }

  function refreshDisplay() {
    boardEl.querySelectorAll('.target-marker').forEach(el => el.classList.remove('target-marker'));
    boardOverlay.classList.remove('active');
    boardOverlay.textContent = '';

    targetLabel.textContent = state.task === 'diagonals' ? 'Найди диагональ' : 'Найди клетку';

    if (!state.target) {
      targetCard.style.display = '';
      targetValue.textContent = '—';
      return;
    }

    const text = displayText();
    const isDiag = state.task === 'diagonals';

    if (state.displayMode === 'above' || state.displayMode === 'onboard') {
      targetCard.style.display = '';
      targetValue.textContent = text;
      targetValue.classList.toggle('small', isDiag);
      targetValue.classList.remove('pop');
      void targetValue.offsetWidth;
      targetValue.classList.add('pop');
    } else {
      targetCard.style.display = 'none';
      boardOverlay.textContent = text;
      boardOverlay.classList.add('active');
    }
  }

  /* ---------- Автотаймер ---------- */
  function startAutoTimer() {
    clearAutoTimer();
    if (state.mode !== 'auto' || state.locked || !state.autoRunning) {
      progressTrack.classList.remove('active');
      return;
    }
    progressTrack.classList.add('active');
    progressFill.style.animationDuration = state.speed + 'ms';
    progressFill.classList.remove('animating');
    void progressFill.offsetWidth;
    progressFill.classList.add('animating');
    autoTimer = setTimeout(handleTimeout, state.speed);
  }

  function clearAutoTimer() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    progressFill.classList.remove('animating');
    progressFill.style.width = '0%';
  }

  function handleTimeout() {
    autoTimer = null;
    if (state.mode !== 'auto' || state.locked || !state.autoRunning || !state.target) return;

    state.locked = true;
    // в авторежиме просрочка — не ошибка, звук не играем
    if (state.mode !== 'auto') beep(160, 0.22, 'sawtooth');

    revealCorrect();

    const token = ++sessionToken;
    setTimeout(() => {
      if (token !== sessionToken) return;
      clearReveal();
      state.locked = false;
      nextTarget();
    }, 600);
  }

  /* ---------- Подсветка правильного ответа ---------- */
  function revealCorrect() {
    if (!state.target) return;
    state.target.cells.forEach(c => {
      const el = boardEl.querySelector(`[data-square="${c}"]`);
      if (el) el.classList.add('correct');
    });
    if (state.displayMode === 'onboard') {
      const el = boardEl.querySelector(`[data-square="${state.target.cells[0]}"]`);
      if (el) el.classList.add('target-marker');
    }
  }

  function clearReveal() {
    boardEl.querySelectorAll('.correct, .target-marker').forEach(el =>
      el.classList.remove('correct', 'target-marker')
    );
  }

  function isCorrectClick(square) {
    if (!state.target) return false;
    if (state.task === 'diagonals') {
      const ends = [state.target.cells[0], state.target.cells[state.target.cells.length - 1]];
      return ends.includes(square);
    }
    return square === state.target.id;
  }

  /* ---------- Логика тренировки ---------- */
  async function nextTarget() {
    if (state.task === 'diagonals') {
      let diag;
      do { diag = randomDiagonal(); } while (state.target && diag.key === state.target.key);
      state.target = diag;
    } else {
      let sq;
      do {
        const f = FILES[Math.floor(Math.random() * 8)];
        const r = Math.floor(Math.random() * 8) + 1;
        sq = f + r;
      } while (state.target && sq === state.target.id);

      const fIdx = FILES.indexOf(sq[0]);
      const rIdx = parseInt(sq[1], 10) - 1;
      const color = ((fIdx + rIdx) % 2 === 0) ? 'тёмная' : 'светлая';
      state.target = { id: sq, cells: [sq], color, key: sq };
    }
    refreshDisplay();

    const token = ++sessionToken;

    // Ждём окончания озвучки — только потом запускаем таймер
    if (state.sound && window.speechSynthesis) {
      await speakTarget();
      if (token !== sessionToken) return;
    }

    startAutoTimer();
  }

  function updateStats() {
    scoreCorrect.textContent = state.correct;
    scoreWrong.textContent   = state.wrong;
    scoreStreak.textContent  = state.streak;
    scoreBest.textContent    = state.best;
  }

  function onSquareClick(sq) {
    if (state.locked || !state.target) return;

    const square = sq.dataset.square;
    const correct = isCorrectClick(square);

    /* Режим "на клетке": неверный клик — не раскрываем ответ, ждём правильный */
    if (state.displayMode === 'onboard' && !correct) {
      if (!sq.classList.contains('wrong')) {
        sq.classList.add('wrong');
        setTimeout(() => sq.classList.remove('wrong'), 720);
      }
      beep(160, 0.22, 'sawtooth');

      if (state.mode === 'training') {
        state.wrong++;
        state.streak = 0;
        updateStats();
      }
      return;
    }

    clearAutoTimer();
    state.locked = true;
    const token = ++sessionToken;

    if (correct) {
      sq.classList.add('correct');
      if (state.displayMode === 'onboard') sq.classList.add('target-marker');
      beep(880, 0.09, 'sine');
      state.correct++;

      if (state.mode === 'training') {
        state.streak++;
        if (state.streak > state.best) state.best = state.streak;
      }
      updateStats();

      const flashMs = state.displayMode === 'onboard' ? 550 : 320;
      setTimeout(() => {
        if (token !== sessionToken) return;
        clearReveal();
        state.locked = false;
        nextTarget();
      }, flashMs);
    } else {
      sq.classList.add('wrong');
      beep(160, 0.22, 'sawtooth');

      if (state.mode === 'training') {
        state.wrong++;
        state.streak = 0;
        updateStats();
      }

      revealCorrect();

      setTimeout(() => {
        if (token !== sessionToken) return;
        sq.classList.remove('wrong');
        clearReveal();
        state.locked = false;
        nextTarget();
      }, 720);
    }
  }

  /* ---------- Кнопка Стоп/Старт ---------- */
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
      progressTrack.classList.remove('active');
      if (window.speechSynthesis) speechSynthesis.cancel();
    }
  });

  /* ---------- Переключение режима ---------- */
  function setMode(mode) {
    state.mode = mode;
    // Звук НЕ трогаем — остаётся таким, каким его оставил пользователь.

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

  /* ---------- Переключение задачи ---------- */
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

  /* ---------- Ползунок скорости ---------- */
  function updateSliderFill() {
    const pct = ((state.speed - SLIDER_MIN) / (SLIDER_MAX - SLIDER_MIN)) * 100;
    speedSlider.style.setProperty('--fill', pct + '%');
  }

  speedSlider.addEventListener('input', () => {
    state.speed = parseInt(speedSlider.value, 10);
    speedValue.textContent = (state.speed / 1000).toFixed(1) + 'с';
    updateSliderFill();
    if (state.mode === 'auto' && !state.locked && state.autoRunning) startAutoTimer();
  });

  /* ---------- Селекторы ---------- */
  modeSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.dataset.mode === state.mode) return;
    setMode(btn.dataset.mode);
  });

  displayModes.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.displayMode = btn.dataset.mode;
    displayModes.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    refreshDisplay();
  });

  /* ---------- Переключатель цвета в озвучке ---------- */
  speakColorToggle.addEventListener('change', () => {
    state.speakColor = speakColorToggle.checked;
  });

  /* ---------- Кнопки ---------- */
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
  soundBtn.textContent = state.sound ? '🔊' : '🔇'; // покажет 🔇
  nextTarget();
})();
