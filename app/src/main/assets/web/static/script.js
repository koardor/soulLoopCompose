/**
 * script.js — 解密还原版本
 * 功能：管理棋盘格子显示、localStorage 状态读写、方向提示
 */

const dirText = ['上', '右', '下', '左'];
const cells = document.querySelectorAll('.cell');

// ───────────────────────────────────────────
// DOMContentLoaded：给每个 .cell 绑定点击事件
// ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', function () {
  const cellEls = document.querySelectorAll('.cell');
  cellEls.forEach(function (cell) {
    cell.addEventListener('click', setGrid);
  });
});

// ───────────────────────────────────────────
// 点击格子时增减数值（右半区 +1，左半区 -1）
// ───────────────────────────────────────────
for (let i = 0; i < cells.length; i++) {
  cells[i].addEventListener('click', function (e) {
    let value = parseInt(cells[i].textContent) || 0;

    if (e.clientX > e.target.clientWidth / 2) {
      value++;
    } else {
      value--;
    }

    if (value <= 0) value = '';
    if (value > 11) {
      console.log(value);
      value = 11;
    }

    cells[i].textContent = value;

    if (value !== '') {
      cells[i].style.backgroundImage = `url(./static/Image/${value}.png)`;
    } else {
      cells[i].style.backgroundImage = '';
    }

    setGrid();
  });
}

// ───────────────────────────────────────────
// getGrid(dir)
//   读取 localStorage 中的 gameState，刷新棋盘显示，并展示建议方向
// ───────────────────────────────────────────
function getGrid(dir) {
  const stateJson = localStorage.getItem('gameState');
  const state = JSON.parse(stateJson);
  const gridCells = state.grid.cells;   // cells[col][row]

  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      const el = document.getElementById(`grid_${col}_${row}`);
      if (gridCells[col][row] != null) {
        // value 是真实数值（2,4,8…），转成 log2 存为格子内容
        let displayVal = Math.log2(gridCells[col][row].value);
        if (displayVal > 11) displayVal = 11;
        el.textContent = displayVal;
        el.style.backgroundImage = `url(./static/Image/${displayVal}.png)`;
      } else {
        el.textContent = '';
        el.style.backgroundImage = '';
      }
    }
  }

  // 展示建议方向
  if (dir !== undefined) {
    console.log(dir);
    document.getElementById('dir').innerHTML = dirText[dir];
  }
}

// ───────────────────────────────────────────
// setGrid()
//   从 DOM 读取当前格子值，构建 gameState 并写入 localStorage，
//   然后通知游戏实例重新加载（game.setup()）
// ───────────────────────────────────────────
function setGrid() {
  let state = {
    grid: {
      size: 4,
      cells: [
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null]
      ]
    },
    score: 0,
    over: false,
    won: false,
    keepPlaying: false
  };

  // extraTileIndex 用于处理超过 2048 的格子（显示值 > 11 时分配新编号）
  let extraTileIndex = 13;

  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      const el = document.getElementById(`grid_${col}_${row}`);
      let displayVal = el.textContent;

      if (displayVal > 0) {
        if (displayVal == 11) {
          displayVal = extraTileIndex++;
        }
        state.grid.cells[row][col] = {
          position: { x: col, y: row },
          value: Math.pow(2, displayVal)
        };
      }
    }
  }

  localStorage.setItem('gameState', JSON.stringify(state));
  game.setup();
}

// ───────────────────────────────────────────
// clear1()
//   清空棋盘与 localStorage
// ───────────────────────────────────────────
function clear1() {
  console.log('clear');
  let emptyState = {
    grid: {
      size: 4,
      cells: [
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null],
        [null, null, null, null]
      ]
    },
    score: 0,
    over: false,
    won: false,
    keepPlaying: false
  };
  localStorage.setItem('gameState', JSON.stringify(emptyState));
  getGrid();
}

// ───────────────────────────────────────────
// 页面初始化：读取已保存的棋盘状态
// ───────────────────────────────────────────
getGrid();
