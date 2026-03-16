/**
 * main.js — 纯 JavaScript Expectimax 2048 AI
 *
 * 完全移除了对 ai.js / ai.wasm 的依赖。
 * 使用 Expectimax 算法（深度自适应 3-5 层）+ 多维启发式评估函数。
 *
 * 方向编码（与原版一致）：
 *   0 = 上 (Up)
 *   1 = 右 (Right)
 *   2 = 下 (Down)
 *   3 = 左 (Left)
 */

import { GameManager } from "./2048.min.js";

// ─────────────────────────────────────────────────────────
// 初始化游戏
// ─────────────────────────────────────────────────────────
let game;
window.requestAnimationFrame(() => {
  game = new GameManager(4);
  window.game = game;
});

// ─────────────────────────────────────────────────────────
// 棋盘编码
//
// 使用与原版 currentState() 完全相同的格式：
//   Uint16Array(4)，每个元素代表一行
//   每行4个 nibble（4位），nibble[j] = log2(cells[j][i])
//     j = 列索引(0-3)，i = 行索引(0-3)
//   空格 = 0，数值 2=1，4=2，8=3 … 2048=11
// ─────────────────────────────────────────────────────────

// 预计算查找表（65536 项，覆盖所有 16-bit 行）
const MOVE_LEFT  = new Uint16Array(65536);
const MOVE_RIGHT = new Uint16Array(65536);

(function buildTables() {
  for (let row = 0; row < 65536; row++) {
    const t = [
      (row >> 12) & 0xf,
      (row >> 8)  & 0xf,
      (row >> 4)  & 0xf,
       row        & 0xf
    ];

    // ── 向左滑动 ──
    let a = slideLeft(t);
    MOVE_LEFT[row] = (a[0] << 12) | (a[1] << 8) | (a[2] << 4) | a[3];

    // ── 向右滑动（镜像后向左，再镜像回来）──
    let b = slideLeft([t[3], t[2], t[1], t[0]]);
    MOVE_RIGHT[row] = (b[3] << 12) | (b[2] << 8) | (b[1] << 4) | b[0];
  }
})();

/** 把一行向左合并 */
function slideLeft(tiles) {
  // 去零
  let t = tiles.filter(x => x !== 0);
  let result = [];
  let i = 0;
  while (i < t.length) {
    if (i + 1 < t.length && t[i] === t[i + 1]) {
      result.push(t[i] + 1);  // 合并：数值翻倍 = log2 +1
      i += 2;
    } else {
      result.push(t[i]);
      i++;
    }
  }
  while (result.length < 4) result.push(0);
  return result;
}

// ─────────────────────────────────────────────────────────
// 棋盘操作工具函数
// ─────────────────────────────────────────────────────────

/** 转置棋盘（行 ↔ 列互换） */
function transpose(board) {
  const r = new Uint16Array(4);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const nibble = (board[row] >> (12 - 4 * col)) & 0xf;
      r[col] |= nibble << (12 - 4 * row);
    }
  }
  return r;
}

/** 对棋盘执行一次移动，返回新棋盘 */
function applyMove(board, dir) {
  const result = new Uint16Array(4);
  if (dir === 3) {           // 左
    for (let r = 0; r < 4; r++) result[r] = MOVE_LEFT[board[r]];
  } else if (dir === 1) {    // 右
    for (let r = 0; r < 4; r++) result[r] = MOVE_RIGHT[board[r]];
  } else {
    const t = transpose(board);
    if (dir === 0) {         // 上（转置后向左）
      for (let r = 0; r < 4; r++) t[r] = MOVE_LEFT[t[r]];
    } else {                 // 下（转置后向右）
      for (let r = 0; r < 4; r++) t[r] = MOVE_RIGHT[t[r]];
    }
    return transpose(t);
  }
  return result;
}

/** 判断两个棋盘是否完全相同 */
function boardsEqual(a, b) {
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** 统计空格数量 */
function countEmpty(board) {
  let count = 0;
  for (let r = 0; r < 4; r++) {
    let row = board[r];
    if (((row >> 12) & 0xf) === 0) count++;
    if (((row >>  8) & 0xf) === 0) count++;
    if (((row >>  4) & 0xf) === 0) count++;
    if (( row        & 0xf) === 0) count++;
  }
  return count;
}

/** 获取所有空格位置 */
function getEmptyCells(board) {
  const cells = [];
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      if (((board[r] >> (12 - 4 * c)) & 0xf) === 0) cells.push(r * 4 + c);
    }
  }
  return cells;
}

/** 在指定位置写入值，返回新棋盘 */
function setCell(board, pos, val) {
  const row = pos >> 2, col = pos & 3;
  const r = new Uint16Array(board);
  const shift = 12 - 4 * col;
  r[row] = (r[row] & ~(0xf << shift)) | ((val & 0xf) << shift);
  return r;
}

// ─────────────────────────────────────────────────────────
// 启发式评估函数
//
// 综合考虑：
//   1. 空格数量（对数加权）
//   2. 单调性（行列均递增或均递减的奖励）
//   3. 平滑度（相邻格子差值越小越好）
//   4. 最大格权重
// ─────────────────────────────────────────────────────────
function evaluate(board) {
  let empty = 0;
  let mono  = 0;
  let smooth = 0;
  let maxTile = 0;

  // 遍历所有格子
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const v = (board[r] >> (12 - 4 * c)) & 0xf;
      if (v === 0) { empty++; continue; }
      if (v > maxTile) maxTile = v;

      // 平滑度：与右邻
      if (c < 3) {
        const right = (board[r] >> (12 - 4 * (c + 1))) & 0xf;
        if (right) smooth -= Math.abs(v - right);
      }
      // 平滑度：与下邻
      if (r < 3) {
        const down = (board[r + 1] >> (12 - 4 * c)) & 0xf;
        if (down) smooth -= Math.abs(v - down);
      }
    }
  }

  // 单调性（每行）
  for (let r = 0; r < 4; r++) {
    let incr = 0, decr = 0;
    for (let c = 0; c < 3; c++) {
      const v1 = (board[r] >> (12 - 4 * c))       & 0xf;
      const v2 = (board[r] >> (12 - 4 * (c + 1))) & 0xf;
      if (v1 > v2) decr += v2 - v1;
      else if (v1 < v2) incr += v1 - v2;
    }
    mono += Math.max(incr, decr);
  }
  // 单调性（每列）
  for (let c = 0; c < 4; c++) {
    let incr = 0, decr = 0;
    for (let r = 0; r < 3; r++) {
      const v1 = (board[r]     >> (12 - 4 * c)) & 0xf;
      const v2 = (board[r + 1] >> (12 - 4 * c)) & 0xf;
      if (v1 > v2) decr += v2 - v1;
      else if (v1 < v2) incr += v1 - v2;
    }
    mono += Math.max(incr, decr);
  }

  return (
    270 * Math.log(empty + 1) +  // 空格奖励
     47 * mono                +  // 单调性
      1 * smooth               +  // 平滑度
  10000 * maxTile                 // 最大格
  );
}

// ─────────────────────────────────────────────────────────
// Expectimax 搜索
//   isChance = true  → 随机放置新格子（期望节点）
//   isChance = false → 选最优移动方向（最大节点）
// ─────────────────────────────────────────────────────────
function expectimax(board, depth, isChance) {
  if (depth === 0) return evaluate(board);

  if (isChance) {
    const empty = getEmptyCells(board);
    if (empty.length === 0) return evaluate(board);

    let total = 0;
    for (const pos of empty) {
      // 90% 概率出现 2（log2=1），10% 概率出现 4（log2=2）
      total += 0.9 * expectimax(setCell(board, pos, 1), depth - 1, false);
      total += 0.1 * expectimax(setCell(board, pos, 2), depth - 1, false);
    }
    return total / empty.length;
  } else {
    let best = -Infinity;
    for (let dir = 0; dir < 4; dir++) {
      const nb = applyMove(board, dir);
      if (!boardsEqual(nb, board)) {
        const score = expectimax(nb, depth - 1, true);
        if (score > best) best = score;
      }
    }
    return best === -Infinity ? evaluate(board) : best;
  }
}

// ─────────────────────────────────────────────────────────
// 根据棋盘当前状态决定最佳移动方向
// ─────────────────────────────────────────────────────────
function getBestMove(board) {
  const empty = countEmpty(board);
  // 空格越少，搜索越深（但不超过 6 层以免卡顿）
  const depth = empty <= 2 ? 6 : empty <= 4 ? 5 : empty <= 7 ? 4 : 3;

  let best = -Infinity;
  let bestDir = -1;

  for (let dir = 0; dir < 4; dir++) {
    const nb = applyMove(board, dir);
    if (!boardsEqual(nb, board)) {
      const score = expectimax(nb, depth - 1, true);
      if (score > best) {
        best = score;
        bestDir = dir;
      }
    }
  }

  // 如果没有任何可动方向，随机选一个
  return bestDir >= 0 ? bestDir : Math.floor(Math.random() * 4);
}

// ─────────────────────────────────────────────────────────
// 从游戏对象读取当前棋盘状态（与原版编码完全一致）
// ─────────────────────────────────────────────────────────
function currentState() {
  const result = new Uint16Array(4);
  for (let i = 0; i < 4; i++) {         // i = 行(y)
    for (let j = 0; j < 4; j++) {       // j = 列(x)
      const tile = game.grid.cells[j][i];
      if (tile) {
        result[i] |= (Math.log2(tile.value) & 0xf) << (12 - 4 * j);
      }
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────
// 执行一步 AI 预测
// ─────────────────────────────────────────────────────────
function step() {
  const board   = currentState();
  const bestDir = getBestMove(board);

  game.move(bestDir);
  getGrid(bestDir);   // 更新外部格子显示，显示方向文字

  if (game.over) stopAI();
  if (game.won) {
    game.keepPlaying = true;
    game.actuator.clearMessage();
  }
}

// ─────────────────────────────────────────────────────────
// AI 自动运行（开始 / 停止）
// ─────────────────────────────────────────────────────────
let aiRunning = false;
let aiTimer   = null;

function startAI() {
  if (aiRunning) return;
  aiRunning = true;

  const btns = document.getElementsByClassName("ai-buttons");
  if (btns[1]) btns[1].textContent = "Stop";

  function loop() {
    if (!aiRunning || game.over) { stopAI(); return; }
    step();
    aiTimer = setTimeout(loop, 80);   // 每步间隔 80ms
  }
  loop();
  toggleAI = stopAI;
}

function stopAI() {
  aiRunning = false;
  if (aiTimer) { clearTimeout(aiTimer); aiTimer = null; }

  const btns = document.getElementsByClassName("ai-buttons");
  if (btns[1]) btns[1].textContent = "Start AI";
  toggleAI = startAI;
}

let toggleAI = startAI;

// ─────────────────────────────────────────────────────────
// 绑定按钮事件
// ─────────────────────────────────────────────────────────
document.querySelector("#ai-step").addEventListener("click", () => step());
// document.querySelector("#ai-start").addEventListener("click", () => toggleAI());
