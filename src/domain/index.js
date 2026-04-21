/*
  Sudoku 领域对象 - 表示游戏局面
  职责：持有 grid 数据、提供 guess 操作、序列化/反序列化、外表化、校验

  改进说明（相比 HW1）：
  - 增加 validate() 方法，提供校验能力
  - 增加 isComplete() 方法，判断是否完成
  - 增加边界检查和数字范围验证
  - 区分题目初始 givens 与玩家输入
  - 改进职责边界，Grid 相关逻辑内聚在 Sudoku 中
 */

const GRID_SIZE = 9;
const BOX_SIZE = 3;
const VALID_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];

export function createSudoku(input, givens = null) {
  // 深拷贝输入 grid，避免外部引用污染
  const grid = input.map(row => [...row]);

  // 记录题目初始给定的格子（不可修改）
  const givenCells = new Set();
  if (givens) {
    givens.forEach(key => givenCells.add(key));
  } else {
    // 如果未提供 givens，推断所有非零格子为 given
    for (let r = 0; r < GRID_SIZE; r++) {
      for (let c = 0; c < GRID_SIZE; c++) {
        if (grid[r][c] !== 0) {
          givenCells.add(`${r},${c}`);
        }
      }
    }
  }

  return {
    getGrid() {
      // 返回深拷贝，防止外部修改内部状态
      return grid.map(row => [...row]);
    },

    isGiven(row, col) {
      return givenCells.has(`${row},${col}`);
    },

    guess(move) {
      const { row, col, value } = move;

      // 边界检查
      if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) {
        throw new Error(`Invalid position: (${row}, ${col})`);
      }

      // 数字范围检查
      if (!VALID_VALUES.includes(value)) {
        throw new Error(`Invalid value: ${value}. Must be 0-9.`);
      }

      // 不允许修改题目初始给定的格子（包括清空）
      if (this.isGiven(row, col)) {
        throw new Error(`Cannot modify given cell (${row}, ${col})`);
      }

      // 记录旧值（用于 Undo 恢复）
      const previousValue = grid[row][col];
      grid[row][col] = value;

      return previousValue;
    },

    clone() {
      // 深拷贝当前局面
      return createSudoku(grid, [...givenCells]);
    },

    validate() {
      // 返回所有冲突的单元格坐标列表
      const invalidCells = [];
      const addInvalid = (r, c) => {
        const key = `${r},${c}`;
        if (!invalidCells.includes(key)) {
          invalidCells.push(key);
        }
      };

      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          const value = grid[r][c];
          if (value === 0) continue;

          // 检查行
          for (let i = 0; i < GRID_SIZE; i++) {
            if (i !== c && grid[r][i] === value) {
              addInvalid(r, c);
              addInvalid(r, i);
            }
          }

          // 检查列
          for (let i = 0; i < GRID_SIZE; i++) {
            if (i !== r && grid[i][c] === value) {
              addInvalid(r, c);
              addInvalid(i, c);
            }
          }

          // 检查 3x3 宫
          const boxStartR = Math.floor(r / BOX_SIZE) * BOX_SIZE;
          const boxStartC = Math.floor(c / BOX_SIZE) * BOX_SIZE;
          for (let br = boxStartR; br < boxStartR + BOX_SIZE; br++) {
            for (let bc = boxStartC; bc < boxStartC + BOX_SIZE; bc++) {
              if ((br !== r || bc !== c) && grid[br][bc] === value) {
                addInvalid(r, c);
                addInvalid(br, bc);
              }
            }
          }
        }
      }

      return invalidCells;
    },

    isComplete() {
      // 检查是否所有格子都填了数字
      for (let r = 0; r < GRID_SIZE; r++) {
        for (let c = 0; c < GRID_SIZE; c++) {
          if (grid[r][c] === 0) return false;
        }
      }
      // 检查是否有冲突
      return this.validate().length === 0;
    },

    toJSON() {
      return {
        grid: grid.map(row => [...row]),
        givens: [...givenCells]
      };
    },

    toString() {
      let result = "Sudoku Grid:\n";
      for (let i = 0; i < GRID_SIZE; i++) {
        result += grid[i].join(" ") + "\n";
      }
      return result;
    }
  };
}

/*
  Move 值对象 - 表示一次用户输入操作

  结构：
  { row: number, col: number, value: number, previousValue: number }

  设计理由：
  - previousValue 是必需的，用于 Undo 时恢复真实上一状态
  - Move 是值对象，不需要唯一 ID
  - 两个相同的 Move 是完全等价的
 */

/*
  Game 领域对象 - 管理游戏会话和历史
  职责：持有 Sudoku、管理历史记录、提供 undo/redo、序列化

  改进说明：
  - Move 现在包含 previousValue，支持正确的 Undo/Redo 语义
  - getSudoku() 返回深拷贝，防止外部绕过历史管理
  - 统一的内部实现，消除重复代码
  - 支持从历史状态恢复（反序列化）
 */

export function createGame({ sudoku, history = [], undoStack = [] }) {
  // 深拷贝 sudoku 内部状态，防止外部引用泄漏
  let currentSudoku = sudoku.clone();
  
  // history 存储完整的 Move 值对象（包含 previousValue）
  const gameHistory = history.map(m => ({ ...m }));
  const gameUndoStack = undoStack.map(m => ({ ...m }));

  // 订阅者列表（用于响应式更新）
  const subscribers = new Set();

  // 通知所有订阅者
  function notify() {
    subscribers.forEach(fn => fn());
  }

  return {
    getSudoku() {
      // 返回深拷贝，防止外部绕过 Game 的历史管理直接修改 Sudoku
      return currentSudoku.clone();
    },

    subscribe(fn) {
      subscribers.add(fn);
      // 返回取消订阅函数
      return () => {
        subscribers.delete(fn);
      };
    },

    guess(move) {
      // 深拷贝 move，避免外部引用污染
      const moveCopy = { row: move.row, col: move.col, value: move.value };
      
      // 执行 guess 并获取旧值
      const previousValue = currentSudoku.guess(moveCopy);
      
      // 记录完整的 Move（包含 previousValue）
      const fullMove = { 
        row: move.row, 
        col: move.col, 
        value: move.value,
        previousValue: previousValue
      };
      
      gameHistory.push(fullMove);
      // 新操作后，redo 历史失效
      gameUndoStack.length = 0;
      notify();
    },

    undo() {
      if (gameHistory.length === 0) return;
      
      const lastMove = gameHistory.pop();
      
      // 恢复到 previousValue（不是简单地设为 0）
      currentSudoku.guess({ 
        row: lastMove.row, 
        col: lastMove.col, 
        value: lastMove.previousValue 
      });
      
      // 将 move 推入 undoStack（保留完整信息）
      gameUndoStack.push({ ...lastMove });
      
      notify();
    },

    redo() {
      if (gameUndoStack.length === 0) return;
      
      const redoMove = gameUndoStack.pop();
      
      // 重做时恢复到 value
      currentSudoku.guess({ 
        row: redoMove.row, 
        col: redoMove.col, 
        value: redoMove.value 
      });
      
      // 将 move 推回 history
      gameHistory.push({ ...redoMove });
      
      notify();
    },

    canUndo() {
      return gameHistory.length > 0;
    },

    canRedo() {
      return gameUndoStack.length > 0;
    },

    toJSON() {
      return {
        sudoku: currentSudoku.toJSON(),
        history: gameHistory.map(move => ({ 
          row: move.row, 
          col: move.col, 
          value: move.value,
          previousValue: move.previousValue 
        })),
        undoStack: gameUndoStack.map(move => ({ 
          row: move.row, 
          col: move.col, 
          value: move.value,
          previousValue: move.previousValue 
        }))
      };
    }
  };
}

/*
 从 JSON 恢复 Sudoku 对象
 */
export function createSudokuFromJSON(json) {
  return createSudoku(json.grid, json.givens);
}

/*
 从 JSON 恢复 Game 对象
 设计说明：
 - 直接使用序列化时的最终状态（不重放历史）
 - 恢复 history 和 undoStack 以支持后续 undo/redo
 - Move 中的 previousValue 是在操作发生时记录的，所以 undo/redo 语义正确
 */
export function createGameFromJSON(json) {
  // 直接使用最终状态
  const finalSudoku = createSudoku(json.sudoku.grid, json.sudoku.givens);
  
  // 创建 Game 并传入历史状态
  return createGame({ 
    sudoku: finalSudoku, 
    history: json.history.map(m => ({ ...m })),
    undoStack: json.undoStack.map(m => ({ ...m }))
  });
}
