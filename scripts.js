(() => {
  'use strict';

  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];

  const boardEl       = document.getElementById('board');
  const boardOverlay  = document.getElementById('boardOverlay');
  const targetCard    = document.getElementById('targetCard');
  const targetValue   = document.getElementById('targetValue');
  const scoreCorrect  = document.getElementById('scoreCorrect');
  const scoreWrong    = document.getElementById('scoreWrong');
  const scoreStreak   = document.getElementById('scoreStreak');
  const scoreBest     = document.getElementById('scoreBest');
  const statsEl       = document.getElementById('stats');
  const modeSelector  = document.getElementById('modeSelector');
  const displayModes  = document.getElementById('displayModes');
  const speedRow      = document.getElementById('speedRow');
  const speedSlider   = document.getElementById('speedSlider');
  const speedValue    = document.getElementById('speedValue');
  const progressTrack = document.getElementById('progressTrack');
  const progressFill  = document.getElementById('progressFill');
  const stopBtn       = document.getElementById('stopBtn');

  const SLIDER_MIN = 500;
  const SLIDER_MAX = 5000;

  const state = {
    orientation: 'white',
    mode: 'training',      // 'training' | 'auto'
    target: null,
    correct: 0,
    wrong: 0,
    streak: 0,
    best: 0,
    locked: false,
    sound: true,
    speed: 2000,
    displayMode: 'above',  // 'above' | 'center' | 'onboard'
    autoRunning: true,
  };

  let autoTimer = null;
  let sessionToken = 0;

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

  /* ---------- Отображение координаты (вопрос) ---------- */
  function refreshDisplay() {
    boardEl.querySelectorAll('.target-marker').forEach(el => el.classList.remove('target-marker'));
    boardOverlay.classList.remove('active');
    boardOverlay.textContent = '';

    if (!state.target) {
      targetCard.style.display = '';
      targetValue.textContent = '—';
      return;
    }

    if (state.displayMode === 'above' || state.displayMode === 'onboard') {
      // Вопрос в карточке (в onboard тоже — на клетке координата появляется после ответа)
      targetCard.style.display = '';
      targetValue.textContent = state.target;
      targetValue.classList.remove('pop');
      void targetValue.offsetWidth;
      targetValue.classList.add('pop');
    } else if (state.displayMode === 'center') {
      targetCard.style.display = 'none';
      boardOverlay.textContent = state.target;
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

    // Просрочка — не ошибка, просто показываем ответ
    state.locked = true;
    beep(160, 0.22, 'sawtooth');

    const correctSq = boardEl.querySelector(`[data-square="${state.target}"]`);
    if (correctSq) {
      correctSq.classList.add('correct');
      if (state.displayMode === 'onboard') correctSq.classList.add('target-marker');
    }

    const token = ++sessionToken;
    setTimeout(() => {
      if (token !== sessionToken) return;
      if (correctSq) correctSq.classList.remove('correct', 'target-marker');
      state.locked = false;
      nextTarget();
    }, 500);
  }

  /* ---------- Логика тренировки ---------- */
  function nextTarget() {
    let sq;
    do {
      const f = FILES[Math.floor(Math.random() * 8)];
      const r = Math.floor(Math.random() * 8) + 1;
      sq = f + r;
    } while (sq === state.target);

    state.target = sq;
    refreshDisplay();
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

    /* Режим "на клетке": неверный клик — не раскрываем ответ, ждём правильный */
    if (state.displayMode === 'onboard' && square !== state.target) {
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

    /* Обычный флоу */
    clearAutoTimer();
    state.locked = true;
    const token = ++sessionToken;

    if (square === state.target) {
      // ✅ Верно
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
        sq.classList.remove('correct', 'target-marker');
        state.locked = false;
        nextTarget();
      }, flashMs);
    } else {
      // ❌ Неверно (для above/center — раскрываем ответ и идём дальше)
      sq.classList.add('wrong');
      beep(160, 0.22, 'sawtooth');

      if (state.mode === 'training') {
        state.wrong++;
        state.streak = 0;
        updateStats();
      }

      const correctSq = boardEl.querySelector(`[data-square="${state.target}"]`);
      if (correctSq) correctSq.classList.add('correct');

      setTimeout(() => {
        if (token !== sessionToken) return;
        sq.classList.remove('wrong');
        if (correctSq) correctSq.classList.remove('correct');
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
    }
  });

  /* ---------- Переключение режима ---------- */
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
    state.locked = false;
    state.streak = 0;
    state.autoRunning = true;
    updateStopBtn();
    updateStats();

    nextTarget();
  }

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
    boardEl.querySelectorAll('.correct, .wrong, .target-marker').forEach(el =>
      el.classList.remove('correct', 'wrong', 'target-marker')
    );
    updateStats();
    clearAutoTimer();
    nextTarget();
  });

  document.getElementById('soundBtn').addEventListener('click', (e) => {
    state.sound = !state.sound;
    e.currentTarget.textContent = state.sound ? '🔊' : '🔇';
  });

  /* ---------- Старт ---------- */
  renderBoard();
  updateStats();
  updateSliderFill();
  nextTarget();
})();
