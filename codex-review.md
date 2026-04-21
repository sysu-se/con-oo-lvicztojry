# con-oo-lvicztojry - Review

## Review 结论

代码已经表现出用 Sudoku/Game 加适配层收口业务逻辑的方向，但当前提交还没有稳定完成“让领域对象真实驱动 Svelte 游戏流程”这件事。最关键的问题是接入层 API 与 Svelte 3 的 store 用法不匹配、键盘流程仍依赖旧状态、并且领域层允许清空 givens，这些问题会同时伤害 OOP 边界、业务正确性和前端接入质量。

## 总体评价

| 维度 | 评价 |
| --- | --- |
| OOP | fair |
| JS Convention | fair |
| Sudoku Business | poor |
| OOD | fair |

## 缺点

### 1. Store Adapter API 与 Svelte 的 $store 用法不兼容

- 严重程度：core
- 位置：src/node_modules/@sudoku/gameStore.js:58-127; src/components/Board/index.svelte:40-51; src/components/Controls/ActionBar/Actions.svelte:15-57; src/components/Modal/Types/Share.svelte:12
- 原因：当前 gameStore 是普通对象，内部字段 grid/invalidCells/isComplete 才是 store；但组件却写成 $gameStore.grid、$gameStore.canUndo 这样的形式。按 Svelte 3 语义，$ 订阅的是 gameStore 本身，而不是它的属性；与此同时 canUndo/canRedo 在适配器里还被同名方法覆盖。静态上看，这意味着视图层并没有以合法的 Svelte store 方式消费领域对象。

### 2. 题面 givens 可被清空，违反数独核心业务规则

- 严重程度：core
- 位置：src/domain/index.js:59-62
- 原因：Sudoku.guess() 只在 value 不等于 0 时阻止修改 given，因此对 given 输入 0 会被允许。数独题面数字应当完全不可编辑，领域层放开“擦除 givens”会直接制造非法盘面，也会让后续 Undo/Redo 记录不合法状态。

### 3. 键盘交互仍依赖旧 grid store，说明真实流程没有完全切到领域对象

- 严重程度：core
- 位置：src/node_modules/@sudoku/game.js:21-23; src/node_modules/@sudoku/stores/keyboard.js:1-10; src/components/Controls/Keyboard.svelte:10-29
- 原因：startNew()/startCustom() 只初始化 gameStore，但 keyboardDisabled 仍从旧 grid store 推导。这样“当前格是否允许输入”不再由当前 Game/Sudoku 决定，而由一个不再同步的旧数据源决定，双数据源问题仍然存在，接入没有真正闭环。

### 4. 适配器用重名方法覆盖了响应式 canUndo/canRedo 字段

- 严重程度：major
- 位置：src/node_modules/@sudoku/gameStore.js:29-30,58-64,119-127
- 原因：返回对象时先暴露了 canUndo/canRedo 两个 writable store，后面又定义了同名方法。对象字面量中后者会覆盖前者，使 API 与注释设计不一致，也让撤销/重做状态无法以统一的响应式字段被 View 消费。

### 5. View 层丢失了 given 与玩家输入的业务语义

- 严重程度：major
- 位置：src/components/Board/index.svelte:48; src/node_modules/@sudoku/gameStore.js:33-48
- 原因：Sudoku 已经建模了 givens，但适配层没有暴露 isGiven 或等价视图状态，模板却用当前值是否为 0 来推断 userNumber。0 只能表示空格，不能表示“这是玩家填的数字”，导致领域模型中的关键业务语义在接入层被抹平。

### 6. 冲突高亮条件与领域校验结果不一致

- 严重程度：major
- 位置：src/components/Board/index.svelte:51; src/domain/index.js:86-121
- 原因：validate() 只会把非 0 的冲突格放进 invalidCells，但模板又要求当前格子值为 0 时才显示 conflictingNumber。这两个条件在业务上不能同时成立，说明领域层输出和 View 条件没有对齐，冲突提示流程在静态阅读下是断开的。

### 7. 分享链接没有随响应式 sencode 一起更新

- 严重程度：minor
- 位置：src/components/Modal/Types/Share.svelte:12-18
- 原因：sencode 是 reactive statement 生成的，但 link、encodedLink 和社交分享链接是顶层 const，只会在组件初始化时计算一次。按静态阅读，这些链接可能不是当前 gameStore 盘面的最新外表化结果。

## 优点

### 1. 对外暴露数据时做了防御性拷贝

- 位置：src/domain/index.js:18-19,37-39,71-74,135-139
- 原因：创建、读取、克隆和序列化时都复制了 grid/givens，避免外部代码直接污染领域对象内部状态，这对历史管理和响应式边界都很重要。

### 2. 领域层明确建模了 givens 概念

- 位置：src/domain/index.js:21-34,42-43
- 原因：createSudoku() 显式维护 givenCells，并提供 isGiven()，说明作者意识到了题面数字与玩家输入应当有不同业务语义，这是数独建模里正确的一步。

### 3. Undo/Redo 使用 previousValue，语义优于简单回零

- 位置：src/domain/index.js:205-259
- 原因：Game 在历史中记录 previousValue，undo() 能恢复真实上一状态，redo() 再恢复目标值，能覆盖同一格多次改写的场景，业务语义是对的。

### 4. 适配层有明确的同步入口和订阅释放意识

- 位置：src/node_modules/@sudoku/gameStore.js:50-56,67-79,88-99
- 原因：syncToStores() 集中负责领域对象到 Svelte store 的映射，unsubscribeCurrent() 也说明作者在尝试避免重复订阅和把业务逻辑散落到组件里。

### 5. 开始新局和加载自定义题目已尝试经由领域适配层统一入口

- 位置：src/node_modules/@sudoku/game.js:15-23,33-41
- 原因：startNew()/startCustom() 不再让组件直接操作二维数组，而是先生成或解码盘面，再交给 gameStore.initGame()，这符合把游戏主流程收口到应用层/领域层的方向。

## 补充说明

- 本次结论仅基于静态审查；按你的要求未运行 tests、未执行 build、也未实际打开浏览器验证交互。
- 关于 $gameStore.xxx、响应式是否刷新、按钮可用态、分享链接是否更新等判断，均基于 Svelte 3 的 store 语义和代码数据流做出的静态推断，而不是运行时观测。
- 审查范围限制在 src/domain/* 及其关联接入文件；旧 grid/userGrid 等文件只在它们直接影响领域对象接入质量时被引用。
- 未实际验证 generateSudoku()/solveSudoku() 及题库生成器本身的正确性，因此与题库质量、求解器算法正确性相关的结论不在本次审查范围内。
