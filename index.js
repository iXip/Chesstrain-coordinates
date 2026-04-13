(function(){
  "use strict";

  // ---------- КОНСТАНТЫ ----------
  const BOARD_SIZE = 8;
  const TOTAL_CELLS = 64;
  const DEFAULT_INTERVAL = 1;  // по умолчанию 1 секунда

  // ---------- DOM ЭЛЕМЕНТЫ ----------
  const boardEl = document.getElementById('chessBoard');
  const nextBtn = document.getElementById('nextBtn');
  const rotateBtn = document.getElementById('rotateBtn');
  const startStopBtn = document.getElementById('startStopBtn');
  const intervalInput = document.getElementById('intervalInput');
  const rankLabels = document.getElementById('rankLabels');
  const fileLabels = document.getElementById('fileLabels');

  // ---------- СОСТОЯНИЯ ----------
  let cells = [];
  let currentActiveIndex = -1;
  let autoTimer = null;
  let isRotated = false;
  let currentInterval = DEFAULT_INTERVAL;
  let isAutoRunning = false;

  /**
   * Преобразует индекс клетки (0..63) в шахматную координату (например "E2")
   */
  function indexToAlgebraic(index) {
    const fileIndex = index % 8;
    const rankIndex = Math.floor(index / 8);
    const fileLetter = String.fromCharCode(97 + fileIndex);
    const rankNumber = 8 - rankIndex;
    return fileLetter.toUpperCase() + rankNumber;
  }

  /**
   * Построение сетки доски
   */
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
        cell.dataset.index = index;
        const coord = indexToAlgebraic(index);
        cell.dataset.coord = coord;

        const coordSpan = document.createElement('span');
        coordSpan.className = 'cell-coordinate';
        coordSpan.textContent = coord;
        cell.appendChild(coordSpan);

        cell.addEventListener('click', (function(idx) {
          return function() { highlightCell(idx); };
        })(index));

        boardEl.appendChild(cell);
        cells.push(cell);
      }
    }
  }

  function highlightCell(index) {
    if (index < 0 || index >= TOTAL_CELLS) return;
    if (currentActiveIndex !== -1 && cells[currentActiveIndex]) {
      cells[currentActiveIndex].classList.remove('highlight');
    }
    cells[index].classList.add('highlight');
    currentActiveIndex = index;
  }

  function pickRandomCell() {
    const randomIndex = Math.floor(Math.random() * TOTAL_CELLS);
    highlightCell(randomIndex);
  }

  // ---------- УПРАВЛЕНИЕ АВТОРЕЖИМОМ ----------
  function startAutoMode() {
    if (autoTimer) clearInterval(autoTimer);
    const intervalMs = currentInterval * 1000;
    autoTimer = setInterval(pickRandomCell, intervalMs);
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
      // Перезапускаем авторежим с новым интервалом
      if (autoTimer) clearInterval(autoTimer);
      const intervalMs = currentInterval * 1000;
      autoTimer = setInterval(pickRandomCell, intervalMs);
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

  // ---------- ПОВОРОТ ДОСКИ ----------
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
    if (isNaN(value) || value < 0.5) {
      value = 0.5;
    } else if (value > 10) {
      value = 10;
    }
    currentInterval = value;
    intervalInput.value = value;
    
    if (isAutoRunning) {
      restartAutoMode();
    }
  }

  // ---------- ИНИЦИАЛИЗАЦИЯ ----------
  function initApp() {
    buildBoard();
    
    // Начальные подписи (не повёрнутое состояние)
    isRotated = false;
    rankLabels.innerHTML = '';
    for (let i = 8; i >= 1; i--) {
      const span = document.createElement('span');
      span.textContent = i;
      rankLabels.appendChild(span);
    }
    fileLabels.innerHTML = '';
    ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].forEach(file => {
      const span = document.createElement('span');
      span.textContent = file;
      fileLabels.appendChild(span);
    });
    
    // Обработчики
    nextBtn.addEventListener('click', () => {
      pickRandomCell();
    });
    
    rotateBtn.addEventListener('click', toggleRotation);
    startStopBtn.addEventListener('click', toggleAutoMode);
    
    intervalInput.addEventListener('change', () => {
      updateIntervalFromInput();
    });
    
    intervalInput.addEventListener('input', (e) => {
      let val = parseFloat(e.target.value);
      if (!isNaN(val)) {
        if (val < 0.5) val = 0.5;
        if (val > 10) val = 10;
        currentInterval = val;
      }
    });
    
    // Устанавливаем значения по умолчанию
    intervalInput.value = DEFAULT_INTERVAL;
    currentInterval = DEFAULT_INTERVAL;
    isAutoRunning = false;
    updateStartStopButton();
    
    // Стартовая подсветка случайной клетки
    setTimeout(() => {
      if (currentActiveIndex !== -1 && cells[currentActiveIndex]) {
        cells[currentActiveIndex].classList.remove('highlight');
      }
      const randomStart = Math.floor(Math.random() * TOTAL_CELLS);
      highlightCell(randomStart);
    }, 50);
  }

  // Запускаем приложение после полной загрузки страницы
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }
})();