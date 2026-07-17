(function () {
  "use strict";

  const BOARD_SIZE = 8;
  const TOTAL_CELLS = 64;
  const DEFAULT_INTERVAL = 1;

  const boardEl = document.getElementById('chessBoard');
  const nextBtn = document.getElementById('nextBtn');
  const rotateBtn = document.getElementById('rotateBtn');
  const startStopBtn = document.getElementById('startStopBtn');
  const intervalInput = document.getElementById('intervalInput');
  const rankLabels = document.getElementById('rankLabels');
  const fileLabels = document.getElementById('fileLabels');
  const modeRandomBtn = document.getElementById('modeRandomBtn');
  const modeKnightBtn = document.getElementById('modeKnightBtn');

  let cells = [];
  let currentActiveIndex = -1;
  let autoTimer = null;
  let isRotated = false;
  let currentInterval = DEFAULT_INTERVAL;
  let isAutoRunning = false;
  let currentMode = 'random';

  const KNIGHT_MOVES = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1]
  ];

  let currentMoveHighlights = [];

  // Система отслеживания посещений
  let visitCount = new Array(TOTAL_CELLS).fill(0);
  let recentMoves = [];
  const RECENT_LIMIT = 8; // Помним последние 8 ходов

  function indexToAlgebraic(index) {
    const fileIndex = index % 8;
    const rankIndex = Math.floor(index / 8);
    const fileLetter = String.fromCharCode(97 + fileIndex);
    const rankNumber = 8 - rankIndex;
    return fileLetter.toUpperCase() + rankNumber;
  }

  function getRowCol(index) {
    return { row: Math.floor(index / 8), col: index % 8 };
  }

  function indexFromRowCol(row, col) {
    if (row < 0 || row >= BOARD_SIZE || col < 0 || col >= BOARD_SIZE) return -1;
    return row * BOARD_SIZE + col;
  }

  function getKnightMovesFromIndex(index) {
    const { row, col } = getRowCol(index);
    const moves = [];
    for (const [dr, dc] of KNIGHT_MOVES) {
      const newRow = row + dr;
      const newCol = col + dc;
      const newIndex = indexFromRowCol(newRow, newCol);
      if (newIndex !== -1) {
        moves.push(newIndex);
      }
    }
    return moves;
  }

  function getMoveAccessibility(moveIndex) {
    const nextMoves = getKnightMovesFromIndex(moveIndex);
    return nextMoves.length;
  }

  // Улучшенный алгоритм коня без телепортации
  function getSmartKnightMove() {
    // Начальная позиция: выбираем центр доски
    if (currentActiveIndex === -1) {
      const centerCells = [];
      for (let i = 0; i < TOTAL_CELLS; i++) {
        const { row, col } = getRowCol(i);
        const distToCenter = Math.abs(row - 3.5) + Math.abs(col - 3.5);
        if (distToCenter <= 2) { // Близко к центру
          const weight = 6 - distToCenter;
          for (let w = 0; w < Math.max(1, weight); w++) {
            centerCells.push(i);
          }
        }
      }
      return centerCells[Math.floor(Math.random() * centerCells.length)];
    }

    const possibleMoves = getKnightMovesFromIndex(currentActiveIndex);
    if (possibleMoves.length === 0) {
      // Если конь застрял (не должно случиться), ищем ближайшую клетку
      let minDist = Infinity;
      let fallbackIndex = 0;
      for (let i = 0; i < TOTAL_CELLS; i++) {
        if (visitCount[i] < minDist) {
          minDist = visitCount[i];
          fallbackIndex = i;
        }
      }
      return fallbackIndex;
    }

    // Система оценки ходов с фокусом на равномерное покрытие
    const scoredMoves = possibleMoves.map(move => {
      // 1. Главный фактор: непосещенные клетки имеют огромный приоритет
      const visits = visitCount[move];
      let visitScore;
      if (visits === 0) {
        visitScore = 1000; // Огромный бонус за непосещенные клетки
      } else if (visits === 1) {
        visitScore = 500;
      } else if (visits === 2) {
        visitScore = 100;
      } else {
        visitScore = Math.max(0, 20 - visits * 3);
      }

      // 2. Правило Варнсдорфа: предпочитаем клетки с меньшим количеством выходов
      const accessibility = getMoveAccessibility(move);
      const accessibilityScore = (8 - accessibility) * 15;

      // 3. Штраф за недавние посещения (сильнее, чем раньше)
      let recentPenalty = 0;
      const recentIndex = recentMoves.indexOf(move);
      if (recentIndex !== -1) {
        recentPenalty = (RECENT_LIMIT - recentIndex) * 8;
      }

      // 4. Бонус за разнообразие: стараемся менять ряды и столбцы
      const currentPos = getRowCol(currentActiveIndex);
      const newPos = getRowCol(move);
      let diversityBonus = 0;
      if (newPos.row !== currentPos.row) diversityBonus += 3;
      if (newPos.col !== currentPos.col) diversityBonus += 3;
      if (Math.abs(newPos.row - currentPos.row) === 2) diversityBonus += 2; // Предпочитаем дальние прыжки

      // 5. Небольшой бонус за центр доски (для лучшего покрытия)
      const distToCenter = Math.abs(newPos.row - 3.5) + Math.abs(newPos.col - 3.5);
      const centerBonus = Math.max(0, 4 - distToCenter) * 2;

      const totalScore = visitScore + accessibilityScore + diversityBonus + centerBonus - recentPenalty;

      return { index: move, score: totalScore };
    });

    // Сортируем по убыванию score
    scoredMoves.sort((a, b) => b.score - a.score);

    // Выбираем из лучших ходов, но с элементами случайности
    const topCount = Math.min(3, scoredMoves.length);

    // Если есть непосещенные клетки, выбираем только из них
    const unvisitedMoves = scoredMoves.filter(m => visitCount[m.index] === 0);
    if (unvisitedMoves.length > 0) {
      const selected = unvisitedMoves[Math.floor(Math.random() * Math.min(2, unvisitedMoves.length))];
      return selected.index;
    }

    // Если все посещены хотя бы раз, выбираем из топ-3
    const topMoves = scoredMoves.slice(0, topCount);
    const selectedMove = topMoves[Math.floor(Math.random() * topMoves.length)].index;

    return selectedMove;
  }

  function getNextCellIndex() {
    if (currentMode === 'knight') {
      return getSmartKnightMove();
    } else {
      // Для случайного режима тоже стараемся избегать повторов
      if (Math.random() < 0.4) {
        // 40% шанс выбрать менее посещенную клетку
        const weightedCells = [];
        for (let i = 0; i < TOTAL_CELLS; i++) {
          const weight = Math.max(1, 15 - visitCount[i]);
          for (let w = 0; w < weight; w++) {
            weightedCells.push(i);
          }
        }
        return weightedCells[Math.floor(Math.random() * weightedCells.length)];
      }
      return Math.floor(Math.random() * TOTAL_CELLS);
    }
  }

  function clearKnightHighlights() {
    currentMoveHighlights.forEach(idx => {
      if (cells[idx]) cells[idx].classList.remove('knight-move-highlight');
    });
    currentMoveHighlights = [];
  }

  function highlightKnightMoves(fromIndex) {
    if (currentMode !== 'knight') return;
    clearKnightHighlights();
    if (fromIndex === -1) return;

    const moves = getKnightMovesFromIndex(fromIndex);
    for (const moveIdx of moves) {
      if (cells[moveIdx]) {
        cells[moveIdx].classList.add('knight-move-highlight');
        currentMoveHighlights.push(moveIdx);
      }
    }
  }

  function highlightCell(index) {
    if (index < 0 || index >= TOTAL_CELLS) return;

    if (currentActiveIndex !== -1 && cells[currentActiveIndex]) {
      cells[currentActiveIndex].classList.remove('highlight');
    }

    cells[index].classList.add('highlight');

    // Обновляем статистику
    visitCount[index]++;
    recentMoves.unshift(index);
    if (recentMoves.length > RECENT_LIMIT) {
      recentMoves.pop();
    }

    currentActiveIndex = index;

    if (currentMode === 'knight') {
      highlightKnightMoves(index);
    } else {
      clearKnightHighlights();
    }
  }

  function pickNextCell() {
    const nextIndex = getNextCellIndex();
    highlightCell(nextIndex);
  }

  function resetKnightStats() {
    visitCount.fill(0);
    recentMoves = [];
  }

  function switchMode(mode) {
    currentMode = mode;

    if (mode === 'random') {
      modeRandomBtn.classList.add('active');
      modeKnightBtn.classList.remove('active');
      clearKnightHighlights();
      resetKnightStats();
    } else {
      modeKnightBtn.classList.add('active');
      modeRandomBtn.classList.remove('active');
      resetKnightStats();
      if (currentActiveIndex !== -1) {
        highlightKnightMoves(currentActiveIndex);
        visitCount[currentActiveIndex]++;
        recentMoves = [currentActiveIndex];
      }
    }

    if (isAutoRunning) {
      restartAutoMode();
    }
  }

  function startAutoMode() {
    if (autoTimer) clearInterval(autoTimer);
    const intervalMs = currentInterval * 1000;
    autoTimer = setInterval(() => pickNextCell(), intervalMs);
    isAutoRunning = true;
    updateStartStopButton();
  }

  function stopAutoMode() {
    if (autoTimer) {
      clearInterval(autoTimer);
      autoTimer = null;
    }
    isAutoRunning = false;
    updateStartStopButton();
  }

  function restartAutoMode() {
    if (isAutoRunning) {
      startAutoMode();
    }
  }

  function updateStartStopButton() {
    if (isAutoRunning) {
      startStopBtn.textContent = '⏹ Стоп';
      startStopBtn.classList.add('running');
    } else {
      startStopBtn.textContent = '▶ Старт';
      startStopBtn.classList.remove('running');
    }
  }

  function toggleAutoMode() {
    if (isAutoRunning) {
      stopAutoMode();
    } else {
      startAutoMode();
    }
  }

  function toggleRotation() {
    isRotated = !isRotated;

    if (isRotated) {
      rankLabels.innerHTML = '';
      for (let i = 1; i <= 8; i++) {
        const span = document.createElement('span');
        span.textContent = i;
        rankLabels.appendChild(span);
      }
      fileLabels.innerHTML = '';
      const filesReversed = ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'];
      filesReversed.forEach(file => {
        const span = document.createElement('span');
        span.textContent = file;
        fileLabels.appendChild(span);
      });
    } else {
      rankLabels.innerHTML = '';
      for (let i = 8; i >= 1; i--) {
        const span = document.createElement('span');
        span.textContent = i;
        rankLabels.appendChild(span);
      }
      fileLabels.innerHTML = '';
      const filesNormal = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
      filesNormal.forEach(file => {
        const span = document.createElement('span');
        span.textContent = file;
        fileLabels.appendChild(span);
      });
    }

    if (isRotated) {
      boardEl.classList.add('rotated');
    } else {
      boardEl.classList.remove('rotated');
    }
  }

  function updateIntervalFromInput() {
    let value = parseFloat(intervalInput.value);
    if (isNaN(value) || value < 0.5) value = 0.5;
    if (value > 10) value = 10;
    currentInterval = value;
    intervalInput.value = value;
    if (isAutoRunning) restartAutoMode();
  }

  function buildBoard() {
    boardEl.innerHTML = '';
    cells = [];

    for (let row = 0; row < BOARD_SIZE; row++) {
      for (let col = 0; col < BOARD_SIZE; col++) {
        const cell = document.createElement('div');
        cell.className = 'cell';

        const isLight = (row + col) % 2 === 0;
        cell.classList.add(isLight ? 'light' : 'dark');

        const index = row * BOARD_SIZE + col;
        const coord = indexToAlgebraic(index);

        const coordSpan = document.createElement('span');
        coordSpan.className = 'cell-coordinate';
        coordSpan.textContent = coord;
        cell.appendChild(coordSpan);

        cell.addEventListener('click', (function (idx) {
          return function () {
            highlightCell(idx);
            if (currentMode === 'knight') {
              highlightKnightMoves(idx);
            }
          };
        })(index));

        boardEl.appendChild(cell);
        cells.push(cell);
      }
    }
  }

  function initApp() {
    buildBoard();

    for (let i = 8; i >= 1; i--) {
      const span = document.createElement('span');
      span.textContent = i;
      rankLabels.appendChild(span);
    }
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach(file => {
      const span = document.createElement('span');
      span.textContent = file;
      fileLabels.appendChild(span);
    });

    nextBtn.addEventListener('click', () => pickNextCell());
    rotateBtn.addEventListener('click', toggleRotation);
    startStopBtn.addEventListener('click', toggleAutoMode);
    modeRandomBtn.addEventListener('click', () => switchMode('random'));
    modeKnightBtn.addEventListener('click', () => switchMode('knight'));

    intervalInput.addEventListener('change', updateIntervalFromInput);
    intervalInput.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        if (val < 0.5) val = 0.5;
        if (val > 10) val = 10;
        currentInterval = val;
      }
    });

    intervalInput.value = DEFAULT_INTERVAL;
    currentInterval = DEFAULT_INTERVAL;
    isAutoRunning = false;
    updateStartStopButton();

    currentMode = 'random';
    modeRandomBtn.classList.add('active');
    modeKnightBtn.classList.remove('active');

    setTimeout(() => {
      const startIdx = Math.floor(Math.random() * TOTAL_CELLS);
      highlightCell(startIdx);
    }, 50);
  }

  initApp();
})();
