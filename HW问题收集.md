## HW 问题收集

列举在HW 1、HW1.1过程里，你所遇到的 2-3 个通过自己学习已经解决的问题，和 2-3 个尚未解决的问题与挑战

### 已解决

1. Undo/Redo 无法恢复真实上一状态（同一格多次编辑时会被错误清空）
   1. **上下文**：HW1 初版中，history/undoStack 只保存 `{ row, col, value }`，`undo()` 时直接将格子写成 0。这导致如果同一格被编辑多次，撤销后无法回到真实的上一个值。
   2. **解决手段**：
      - 在 Move 对象中增加 `previousValue` 字段
      - `Sudoku.guess()` 现在返回旧值：`const previousValue = grid[row][col]; grid[row][col] = value; return previousValue;`
      - `Game.undo()` 恢复到 `previousValue` 而不是简单设为 0
      - 这样能支持同一格多次改写的完整撤销

2. Game 的聚合边界被 Sudoku 引用泄漏，外部可绕过历史管理
   1. **上下文**：HW1 中直接暴露 `getSudoku()` 返回当前 sudoku 引用，外部代码可以 `game.getSudoku().guess(...)` 绕过 Game 的历史记录。
   2. **解决手段**：
      - `getSudoku()` 现在返回 `currentSudoku.clone()` 的深拷贝
      - 内部 currentSudoku 通过 `sudoku.clone()` 与输入隔离
      - 外部无法通过返回值直接污染内部状态

3. 题面初始值 (givens) 可被清空，违反数独业务规则
   1. **上下文**：HW1 中 `Sudoku.guess()` 允许对 given 输入 0，导致题目数字被擦除。
   2. **解决手段**：
      - Sudoku 构造时维护 `givenCells` Set，记录哪些格子是题目初始值
      - `guess()` 增加检查：`if (this.isGiven(row, col) && value !== 0) throw new Error(...)`
      - Given 完全不可编辑，业务约束在领域层强制实现

### 未解决

1. Store Adapter 与 Svelte 3 响应式机制的接入还不完整
   1. **上下文**：Game 对象中增加了 `subscribe()` 方法和 `notify()` 通知机制，但真实的 Svelte store 适配层与组件消费方式还不清晰。当前不确定：
      - 组件应该如何正确订阅 gameStore 的多个响应式字段（grid, invalidCells, canUndo, canRedo）
      - $gameStore.xxx 的语法是否真的有效，还是应该写成 $grid, $invalidCells 等
      - Store Adapter 应该是纯对象（属性为内部 store）还是本身成为 store

   2. **尝试解决手段**：
      - 尝试直接在 Domain 对象上实现 subscribe/notify，类似自定义 store 的思路
      - 阅读 Svelte 3 官方文档中关于 custom store 的部分，但仍有细节不清：如何让 `$gameStore.grid` 真正绑定到内部的 grid 变化？
      - 考虑将 gameStore 设计为工厂函数返回的对象，其中包含 writable store（如 `writable(grid)`）和方法，但这样会改变 API 形态

2. 序列化/反序列化时 givens 信息的完整性与一致性保证
   1. **上下文**：`Sudoku.toJSON()` 现在保存了 givens 列表，但反序列化的流程需要确保：
      - `createSudokuFromJSON()` 能正确恢复 givenCells 
      - `createGameFromJSON()` 中，恢复的 Sudoku 是否正确继承了 given 约束
      - 如果有多次 undo/redo 后再序列化，given 信息是否始终一致
      - 分享链接中编码的盘面信息是否能正确包含 givens

   2. **尝试解决手段**：
      - 实现了 givenCells 在 JSON 中的持久化，但没有写集成测试验证整个序列化-反序列化-操作-再序列化的循环是否保持一致性
      - 需要测试用例覆盖：序列化空盘面、满盘面、中间状态等各种场景
      - 需要验证分享功能中的 solveSudoku / generateSudoku 是否会影响 givenCells 的解析

3. 响应式边界和 View 层接入的流程链路还未完整接通
   1. **上下文**：虽然 Sudoku 和 Game 领域对象已改进，但真实的 Svelte 组件如何调用这些接口仍待澄清：
      - 用户在棋盘上点击一个格子进行输入，这个事件如何映射到 `game.guess()`？
      - Undo/Redo 按钮应该如何调用领域对象的接口，并确保 UI 跟着刷新？
      - 胜利判断、冲突高亮等 UI 逻辑应该由谁驱动（适配层还是组件）？
      - 键盘输入流程（Keyboard.svelte）是否已经集成到新的数据流中？

   2. **尝试解决手段**：
      - 在代码中增加了 Game 的 subscribe/notify，但尚未在实际组件中调用
      - 需要改造 Board/index.svelte、Controls/index.svelte 等关键组件，让它们调用 gameStore 的方法而非直接操作状态
      - 需要理清 Keyboard.svelte 中的事件处理流程，确保最终都通过 gameStore.guess() 进入领域对象
