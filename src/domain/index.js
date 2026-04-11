/*
  Sudoku 领域对象 - 表示游戏局面
  职责：持有 grid 数据、提供 guess 操作、序列化/反序列化、外表化、校验
  
  改进说明（相比 HW1）：
  - 增加 validate() 方法，提供校验能力
  - 增加 isComplete() 方法，判断是否完成
  - 改进职责边界，Grid 相关逻辑内聚在 Sudoku 中
 */

export function createSudoku(input) {
  // 深拷贝输入 grid，避免外部引用污染
  const grid = input.map(row => [...row]);

  return {
    getGrid() {
      // 返回深拷贝，防止外部修改内部状态
      return grid.map(row => [...row]);
    },

    guess(move) {
      const { row, col, value } = move;
      grid[row][col] = value;
    },

    clone() {
      // 深拷贝当前局面
      return createSudoku(grid);
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

      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          const value = grid[r][c];
          if (value === 0) continue;

          // 检查行
          for (let i = 0; i < 9; i++) {
            if (i !== c && grid[r][i] === value) {
              addInvalid(r, c);
              addInvalid(r, i);
            }
          }

          // 检查列
          for (let i = 0; i < 9; i++) {
            if (i !== r && grid[i][c] === value) {
              addInvalid(r, c);
              addInvalid(i, c);
            }
          }

          // 检查 3x3 宫
          const boxStartR = Math.floor(r / 3) * 3;
          const boxStartC = Math.floor(c / 3) * 3;
          for (let br = boxStartR; br < boxStartR + 3; br++) {
            for (let bc = boxStartC; bc < boxStartC + 3; bc++) {
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
      for (let r = 0; r < 9; r++) {
        for (let c = 0; c < 9; c++) {
          if (grid[r][c] === 0) return false;
        }
      }
      // 检查是否有冲突
      return this.validate().length === 0;
    },

    toJSON() {
      return {
        grid: grid.map(row => [...row])
      };
    },

    toString() {
      let result = "Sudoku Grid:\n";
      for (let i = 0; i < 9; i++) {
        result += grid[i].join(" ") + "\n";
      }
      return result;
    }
  };
}

/*
  Game 领域对象 - 管理游戏会话和历史
  职责：持有 Sudoku、管理历史记录、提供 undo/redo、序列化
  
  改进说明（相比 Homework1）：
  - 增加 subscribe/notify 机制，支持 UI 响应式更新
  - history 仍使用 Move 值对象（与 Homework1 一致）
 */

export function createGame({ sudoku }) {
  let currentSudoku = sudoku;
  // history 存储的是 Move 值对象（深拷贝），不是快照
  const history = [];
  const undoStack = [];
  
  // 订阅者列表（用于响应式更新）
  const subscribers = new Set();

  // 通知所有订阅者
  function notify() {
    subscribers.forEach(fn => fn());
  }

  return {
    getSudoku() {
      return currentSudoku;
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
      currentSudoku.guess(moveCopy);
      history.push(moveCopy);
      // 新操作后，redo 历史失效
      undoStack.length = 0;
      notify();
    },

    undo() {
      if (history.length === 0) return;
      const lastMove = history.pop();
      // 深拷贝 move 到 undoStack
      undoStack.push({ row: lastMove.row, col: lastMove.col, value: lastMove.value });
      // 撤销
      currentSudoku.guess({ row: lastMove.row, col: lastMove.col, value: 0 });
      notify();
    },

    redo() {
      if (undoStack.length === 0) return;
      const redoMove = undoStack.pop();
      // 深拷贝 move 到 history
      history.push({ row: redoMove.row, col: redoMove.col, value: redoMove.value });
      currentSudoku.guess(redoMove);
      notify();
    },

    canUndo() {
      return history.length > 0;
    },

    canRedo() {
      return undoStack.length > 0;
    },

    toJSON() {
      return {
        sudoku: currentSudoku.toJSON(),
        history: history.map(move => ({ row: move.row, col: move.col, value: move.value })),
        undoStack: undoStack.map(move => ({ row: move.row, col: move.col, value: move.value }))
      };
    }
  };
}

/*
 从 JSON 恢复 Sudoku 对象
 */
export function createSudokuFromJSON(json) {
  return createSudoku(json.grid);
}

/*
 从 JSON 恢复 Game 对象
 设计说明：从初始状态重放所有历史操作来重建状态
 */
export function createGameFromJSON(json) {
  // 从初始 grid 创建 Sudoku（注意：json.sudoku.grid 是最终状态，不是初始状态）
  // 但我们的序列化策略是保存最终状态，所以这里直接使用最终状态
  const finalSudoku = createSudoku(json.sudoku.grid);

  // 使用内部函数创建带有恢复历史的 Game
  return createGameWithHistory({
    sudoku: finalSudoku,
    history: json.history.map(m => ({ row: m.row, col: m.col, value: m.value })),
    undoStack: json.undoStack.map(m => ({ row: m.row, col: m.col, value: m.value }))
  });
}

/*
 从已有历史创建 Game 对象（内部辅助函数）
 */
function createGameWithHistory({ sudoku, history, undoStack }) {
  let currentSudoku = sudoku;
  const gameHistory = [...history];
  const gameUndoStack = [...undoStack];
  const subscribers = new Set();

  function notify() {
    subscribers.forEach(fn => fn());
  }

  return {
    getSudoku() {
      return currentSudoku;
    },

    subscribe(fn) {
      subscribers.add(fn);
      return () => {
        subscribers.delete(fn);
      };
    },

    guess(move) {
      const moveCopy = { row: move.row, col: move.col, value: move.value };
      currentSudoku.guess(moveCopy);
      gameHistory.push(moveCopy);
      gameUndoStack.length = 0;
      notify();
    },

    undo() {
      if (gameHistory.length === 0) return;
      const lastMove = gameHistory.pop();
      gameUndoStack.push({ row: lastMove.row, col: lastMove.col, value: lastMove.value });
      currentSudoku.guess({ row: lastMove.row, col: lastMove.col, value: 0 });
      notify();
    },

    redo() {
      if (gameUndoStack.length === 0) return;
      const redoMove = gameUndoStack.pop();
      gameHistory.push({ row: redoMove.row, col: redoMove.col, value: redoMove.value });
      currentSudoku.guess(redoMove);
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
        history: gameHistory.map(move => ({ row: move.row, col: move.col, value: move.value })),
        undoStack: gameUndoStack.map(move => ({ row: move.row, col: move.col, value: move.value }))
      };
    }
  };
}
