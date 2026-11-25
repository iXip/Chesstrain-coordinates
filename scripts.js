(() => {
  'use strict';

  const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
  const PIECE_CHARS = { bishop: 'b', knight: 'n', rook: 'r', queen: 'q' };
  const MERIDA_URL = 'https://raw.githubusercontent.com/lichess-org/lila/master/public/piece/merida/';

  const state = {
    mode: 'training',
    task: 'squares',
    pieceType: 'random',
    orientation: 'white',
    currentSquare: null,
    currentDiag: null,
    correct: 0, wrong: 0, streak: 0, best: 0,
    locked: false,
    speakCoord: true, speakColor: true, speakDiagColor: true,
    visited: new Set(),
    autoRunning: false
  };

  let autoTimer = null;
  let sessionToken = 0;
  
  const boardEl = document.getElementById('board');
  const boardPiece = document.getElementById('boardPiece');
  const boardOverlay = document.getElementById('boardOverlay');
  const statsEl = document.getElementById('stats');
  const stopBtn = document.getElementById('stopBtn');
  const modeSelector = document.getElementById('modeSelector');
  const taskSelector = document.getElementById('taskSelector');
  const diagToggleWrap = document.getElementById('diagToggleWrap');

  const ALL_SQUARES = [];
  for (let f = 0; f < 8; f++) for (let r = 1; r <= 8; r++) ALL_SQUARES.push({ id: FILES[f] + r });

  /* ---------- Генерация диагоналей ---------- */
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
        
        pool.push({ id: key, cells, isLight });
      }
    }
    return pool;
  }
  const ALL_DIAGONALS = getAllDiagonals();

  /* ---------- Отрисовка доски ---------- */
  function renderBoard() {
    boardEl.querySelectorAll('.square').forEach(el => el.remove());

    const files = state.orientation === 'white' ? FILES : [...FILES].reverse();
    const ranks = state.orientation === 'white' ? [8,7,6,5,4,3,2,1] : [1,2,3,4,5,6,7,8];

    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const file = files[c];
        const rank = ranks[r];
        const sq = document.createElement('div');
        sq.className = 'square ' + ((r + c) % 2 === 0 ? 'light' : 'dark');
        sq.dataset.square = file + rank;
        sq.addEventListener('click', () => onSquareClick(sq));
        boardEl.appendChild(sq);
      }
    }
    boardEl.appendChild(boardOverlay);
    boardEl.appendChild(boardPiece);
  }

  /* ---------- Логика фигур ---------- */
  function getMoves(piece, pos) {
    const f = FILES.indexOf(pos[0]);
    const r = parseInt(pos[1], 10) - 1;
    const moves = [];

    const add = (df, dr) => {
      let nf = f + df, nr = r + dr;
      while (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) {
        moves.push(FILES[nf] + (nr + 1));
        nf += df; nr += dr;
      }
    };

    if (piece === 'bishop') { add(1,1); add(1,-1); add(-1,1); add(-1,-1); }
    if (piece === 'rook') { add(1,0); add(-1,0); add(0,1); add(0,-1); }
    if (piece === 'queen') { add(1,1); add(1,-1); add(-1,1); add(-1,-1); add(1,0); add(-1,0); add(0,1); add(0,-1); }
    if (piece === 'knight') {
      [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]].forEach(([df, dr]) => {
        const nf = f + df, nr = r + dr;
        if (nf >= 0 && nf <= 7 && nr >= 0 && nr <= 7) moves.push(FILES[nf] + (nr + 1));
      });
    }
    return moves;
  }

  /* ---------- Позиционирование и анимация ---------- */
  function placePiece(square, animate = true) {
    const f = FILES.indexOf(square[0]);
    const r = parseInt(square[1], 10) - 1;

    boardPiece.style.transition = animate ? 'transform 0.25s ease-in-out' : 'none';

    let leftPercent, topPercent;
    if (state.orientation === 'white') {
      leftPercent = f * 12.5;
      topPercent = (7 - r) * 12.5;
    } else {
      leftPercent = (7 - f) * 12.5;
      topPercent = r * 12.5;
    }

    boardPiece.style.transform = `translate(${leftPercent * 8}%, ${topPercent * 8}%)`;
  }

  function updateSidePanel() {
    if (state.pieceType === 'random') {
      boardPiece.classList.add('hidden');
      document.getElementById('displayPiece').className = 'chess-piece random-placeholder';
      document.getElementById('displayPiece').textContent = '🎲';
      document.getElementById('displayPiece').style.backgroundImage = 'none';
      return;
    }

    boardPiece.classList.remove('hidden');
    document.getElementById('displayPiece').className = 'chess-piece';
    document.getElementById('displayPiece').textContent = '';
    
    const color = state.orientation === 'white' ? 'w' : 'b';
    const pieceChar = PIECE_CHARS[state.pieceType];
    const pieceClass = `${color}${pieceChar.toUpperCase()}`;
    document.getElementById('displayPiece').style.backgroundImage = `url('${MERIDA_URL}${pieceClass}.svg')`;
    boardPiece.style.backgroundImage = `url('${MERIDA_URL}${pieceClass}.svg')`;
  }

  /* ---------- Ходы и логика ---------- */
  function makeRandomMove() {
    if (state.task === 'diagonals') {
      let diag;
      do {
        diag = ALL_DIAGONALS[Math.floor(Math.random() * ALL_DIAGONALS.length)];
      } while (state.currentDiag && diag.id === state.currentDiag.id);
      
      state.currentDiag = diag;
      state.currentSquare = null;
      return;
    }

    if (state.pieceType === 'random') {
      let nextSq;
      do {
        nextSq = ALL_SQUARES[Math.floor(Math.random() * 64)].id;
      } while (nextSq === state.currentSquare && ALL_SQUARES.length > 1);
      
      state.currentSquare = nextSq;
      return;
    }

    if (!state.currentSquare) {
      state.currentSquare = ALL_SQUARES[Math.floor(Math.random() * 64)].id;
      state.visited.add(state.currentSquare);
      placePiece(state.currentSquare, false);
      return;
    }

    const moves = getMoves(state.pieceType, state.currentSquare);
    const unvisited = moves.filter(m => !state.visited.has(m));
    const pool = unvisited.length > 0 ? unvisited : moves.filter(m => m !== state.currentSquare);
    
    if (pool.length > 0) {
      const nextSq = pool[Math.floor(Math.random() * pool.length)];
      state.currentSquare = nextSq;
      state.visited.add(nextSq);
      placePiece(nextSq, true);
    } else {
      state.currentSquare = null;
      makeRandomMove();
    }
  }

  /* ---------- Озвучка ---------- */
  function speak(text) {
    if ((!state.speakCoord && !state.speakColor && !state.speakDiagColor) || !window.speechSynthesis || !text) {
      return Promise.resolve();
    }
    
    speechSynthesis.cancel();
    return new Promise((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ru-RU';
      u.rate = 1.2;
      
      let done = false;
      const finish = () => { if (!done) { done = true; resolve(); } };
      u.onend = finish;
      u.onerror = finish;
      
      const est = Math.max(600, Math.min(4000, text.length * 100 + 300));
      setTimeout(() => { if (!done) finish(); }, est);
      
      speechSynthesis.speak(u);
    });
  }

  async function speakTarget() {
    let parts = [];
    
    if (state.task === 'diagonals' && state.currentDiag) {
      if (state.speakCoord) parts.push(state.currentDiag.id);
      if (state.speakDiagColor) parts.push(state.currentDiag.isLight ? 'светлая' : 'тёмная');
    } else if (state.currentSquare) {
      if (state.speakCoord) parts.push(state.currentSquare[0] + ' ' + state.currentSquare[1]);
      if (state.speakColor) {
        const f = FILES.indexOf(state.currentSquare[0]);
        const r = parseInt(state.currentSquare[1], 10) - 1;
        parts.push(((f + r) % 2 !== 0) ? 'светлая' : 'тёмная');
      }
    }
    
    if (parts.length > 0) {
      await speak(parts.join(', '));
    }
  }

  /* ---------- Игровой цикл ---------- */
  async function nextQuestion() {
    clearAutoTimer();
    state.locked = false;
    
    makeRandomMove();
    updateSidePanel();
    
    if (state.task === 'diagonals' && state.currentDiag) {
      boardOverlay.innerHTML = `<span class="coord-text small">${state.currentDiag.id}</span>`;
      boardPiece.classList.add('hidden');
    } else if (state.currentSquare) {
      boardOverlay.innerHTML = `<span class="coord-text">${state.currentSquare}</span>`;
      
      if (state.mode === 'auto' && state.pieceType !== 'random') {
        boardPiece.classList.remove('hidden');
      } else {
        boardPiece.classList.add('hidden');
      }
    }
    
    const token = ++sessionToken;
    
    await speakTarget();
    
    if (token !== sessionToken) return;
    
    if (state.mode === 'auto' && state.autoRunning) {
      startAutoTimer();
    }
  }

  function onSquareClick(sq) {
    if (state.locked) return;
    if (state.mode === 'auto') return;
    
    const square = sq.dataset.square;
    let isCorrect = false;

    if (state.task === 'diagonals' && state.currentDiag) {
      const ends = [state.currentDiag.cells[0], state.currentDiag.cells[state.currentDiag.cells.length - 1]];
      isCorrect = ends.includes(square);
    } else {
      isCorrect = square === state.currentSquare;
    }
    
    if (isCorrect) {
      state.locked = true;
      state.correct++;
      state.streak++;
      if (state.streak > state.best) state.best = state.streak;
      
      if (state.task === 'diagonals' && state.currentDiag) {
        state.currentDiag.cells.forEach(c => {
          const el = boardEl.querySelector(`[data-square="${c}"]`);
          if (el) el.classList.add('correct');
        });
      } else {
        sq.classList.add('correct');
      }
      
      const token = ++sessionToken;
      setTimeout(() => {
        if (token !== sessionToken) return;
        if (state.task === 'diagonals' && state.currentDiag) {
          state.currentDiag.cells.forEach(c => {
            const el = boardEl.querySelector(`[data-square="${c}"]`);
            if (el) el.classList.remove('correct');
          });
        } else {
          sq.classList.remove('correct');
        }
        nextQuestion();
      }, 500);
    } else {
      state.wrong++;
      state.streak = 0;
      sq.classList.add('wrong');
      
      if (state.task === 'diagonals' && state.currentDiag) {
        state.currentDiag.cells.forEach(c => {
          const el = boardEl.querySelector(`[data-square="${c}"]`);
          if (el) el.classList.add('correct');
        });
      } else {
        const correctSq = boardEl.querySelector(`[data-square="${state.currentSquare}"]`);
        if (correctSq) correctSq.classList.add('correct');
      }

      const token = ++sessionToken;
      setTimeout(() => {
        if (token !== sessionToken) return;
        sq.classList.remove('wrong');
        
        if (state.task === 'diagonals' && state.currentDiag) {
          state.currentDiag.cells.forEach(c => {
            const el = boardEl.querySelector(`[data-square="${c}"]`);
            if (el) el.classList.remove('correct');
          });
        } else {
          const correctSq = boardEl.querySelector(`[data-square="${state.currentSquare}"]`);
          if (correctSq) correctSq.classList.remove('correct');
        }
        nextQuestion();
      }, 800);
    }
    updateStats();
  }

  function startAutoTimer() {
    clearAutoTimer();
    if (!state.autoRunning) return;
    
    autoTimer = setTimeout(() => {
      if (!state.autoRunning) return;
      nextQuestion();
    }, 500);
  }

  function clearAutoTimer() {
    if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
  }

  function updateStats() {
    document.getElementById('scoreCorrect').textContent = state.correct;
    document.getElementById('scoreWrong').textContent = state.wrong;
    document.getElementById('scoreStreak').textContent = state.streak;
    document.getElementById('scoreBest').textContent = state.best;
  }

  /* ---------- Переключение режимов ---------- */
  function setMode(mode) {
    state.mode = mode;
    modeSelector.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.mode === mode);
    });
    
    stopBtn.style.display = (mode === 'auto') ? '' : 'none';
    statsEl.classList.toggle('auto-mode', mode === 'auto');

    sessionToken++;
    clearAutoTimer();
    state.locked = false;
    state.streak = 0;
    
    // По умолчанию при переходе в авто ставим на паузу
    state.autoRunning = false;
    
    state.currentSquare = null;
    state.currentDiag = null;
    
    updateStopBtn();
    updateStats();
    
    nextQuestion();
  }

  function updateStopBtn() {
    if (state.autoRunning) {
      stopBtn.textContent = '⏸ Стоп';
      stopBtn.classList.remove('stopped');
    } else {
      stopBtn.textContent = '▶ Старт';
      stopBtn.classList.add('stopped');
    }
  }

  /* ---------- Старт ---------- */
  renderBoard();
  nextQuestion();

  modeSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.dataset.mode === state.mode) return;
    setMode(btn.dataset.mode);
  });

  taskSelector.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.dataset.task === state.task) return;
    
    state.task = btn.dataset.task;
    taskSelector.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.task === state.task);
    });
    
    diagToggleWrap.style.display = (state.task === 'diagonals') ? 'flex' : 'none';
    
    sessionToken++;
    clearAutoTimer();
    state.currentSquare = null;
    state.currentDiag = null;
    state.visited.clear();
    
    nextQuestion();
  });

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

  document.getElementById('resetBtn').addEventListener('click', () => {
    sessionToken++;
    clearAutoTimer();
    state.visited.clear();
    state.currentSquare = null;
    state.currentDiag = null;
    state.correct = 0; state.wrong = 0; state.streak = 0; state.best = 0;
    updateStats();
    nextQuestion();
  });

  document.getElementById('pieceSelector').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    state.pieceType = btn.dataset.piece;
    document.querySelectorAll('#pieceSelector button').forEach(b => b.classList.toggle('active', b === btn));
    
    boardPiece.classList.toggle('hidden', state.pieceType === 'random');

    clearAutoTimer();
    state.visited.clear();
    state.currentSquare = null;
    state.currentDiag = null;
    nextQuestion();
  });

  const toggleCoord = document.getElementById('toggleCoord');
  const toggleColor = document.getElementById('toggleColor');

  toggleCoord.addEventListener('click', () => {
    state.speakCoord = !state.speakCoord;
    toggleCoord.classList.toggle('active', state.speakCoord);
  });

  toggleColor.addEventListener('click', () => {
    state.speakColor = !state.speakColor;
    toggleColor.classList.toggle('active', state.speakColor);
  });

  diagToggleWrap.addEventListener('click', () => {
    state.speakDiagColor = !state.speakDiagColor;
    diagToggleWrap.classList.toggle('active', state.speakDiagColor);
  });

})();
