# 改进领域对象并接入 Svelte - 设计文档

## 一、领域对象设计

### 1. `Sudoku` 对象

**职责**：表示数独局面（Board/State）

**数据**：

- `grid`：9x9 的二维数组，存储当前数独状态

**接口**：

- `getGrid()`：返回当前 grid 的深拷贝
- `guess(move)`：在指定位置填入数字
- `validate()`：返回冲突单元格坐标列表（如 `["0,3", "1,5"]`）
- `isComplete()`：判断游戏是否完成（所有格子填满且无冲突）
- `clone()`：返回当前局面的深拷贝
- `toJSON()`：序列化为 JSON 对象
- `toString()`：返回用于调试的字符串表示
- `subscribe(fn)`：订阅状态变化
- `unsubscribe(fn)`：取消订阅

**设计理由**：
`Sudoku` 是纯粹的领域对象，只负责维护数独局面的状态和提供校验能力。它不关心游戏历史、撤销/重做等游戏逻辑，只关注"当前这个数独盘面是什么状态"。

---

### 2. `Game` 对象

**职责**：管理游戏会话（Game Session）

**数据**：

- `sudoku`：当前 Sudoku 对象
- `history`：历史操作栈（用于 undo）
- `undoStack`：撤销栈（用于 redo）

**接口**：

- `getSudoku()`：获取当前 Sudoku 对象
- `guess(move)`：执行一次猜测操作
- `undo()`：撤销最近一次操作
- `redo()`：重做被撤销的操作
- `canUndo()`：判断是否可以撤销
- `canRedo()`：判断是否可以重做
- `toJSON()`：序列化为 JSON 对象
- `subscribe(fn)`：订阅状态变化
- `unsubscribe(fn)`：取消订阅

**设计理由**：
`Game` 是 UI 层与领域层之间的接口。UI 组件只需要与 `Game` 交互，而不需要直接操作 `Sudoku`。`Game` 负责管理游戏的生命周期和历史记录。

---

### 3. `Move` 对象

**职责**：表示一次用户输入操作

**结构**：

```js
{ row: number, col: number, value: number }
```

**设计理由**：
`Move` 是一个简单的**值对象**（Value Object），不是实体对象。它没有身份标识，只有数据。两个相同的 `Move`（row、col、value 都相同）可以视为完全等价。

#### Move 是值对象还是实体对象？

**`Move` 是值对象。**

**理由**：

1. **无身份标识**：`Move` 不需要唯一 ID，两个相同的 move 是完全等价的
2. **不可变性**：`Move` 一旦创建就不应该被修改，所有操作都返回新的副本
3. **用途单一**：只用于传递数据，不承载业务逻辑
4. **生命周期短**：`Move` 只在操作发生时存在，不需要长期追踪

如果 `Move` 是实体对象，会导致：

- 需要管理对象身份（identity）
- 增加不必要的复杂性
- 在序列化/反序列化时需要处理对象引用

---

### 4. History 中存储的是什么？

**History 中存储的是 `Move` 值对象的深拷贝。**

**为什么存 Move 而不是存 Snapshot？**

| 方案        | 优点                     | 缺点                           |
| ----------- | ------------------------ | ------------------------------ |
| 存 Move     | 内存占用小，只需存储变化 | 撤销/重做需要重放操作          |
| 存 Snapshot | 撤销/重做直接恢复状态    | 内存占用大，每个快照 81 个数字 |

**选择存 Move 的理由**：

1. **内存效率**：数独游戏中，用户操作次数可能很多，但每次操作只改变一个格子
2. **语义清晰**：Undo/Redo 的本质是"撤销/重做用户的操作"，而不是"恢复到某个状态"
3. **序列化友好**：Move 序列比 Snapshot 序列更容易序列化和传输

**当前实现策略**：

- 每次 `undo()` 时，直接将 grid 中对应位置设为 0
- 不需要重放所有操作，因为 grid 始终是当前状态

---

### 5. 复制策略与深拷贝/浅拷贝

#### 哪些地方需要深拷贝？

| 场景                    | 是否需要深拷贝 | 原因                               |
| ----------------------- | -------------- | ---------------------------------- |
| `createSudoku(input)` | 是             | 防止外部修改输入数组影响内部状态   |
| `getGrid()`           | 是             | 防止外部修改返回的数组影响内部状态 |
| `clone()`             | 是             | 需要创建完全独立的副本             |
| `guess(move)`         | 是             | 防止外部修改 move 对象             |
| `history.push(move)`  | 是             | 防止后续修改影响历史记录           |
| `toJSON()`            | 是             | 确保返回的数据不受后续修改影响     |

#### 深拷贝实现方式

```js
// 二维数组深拷贝
const copy = original.map(row => [...row]);

// Move 对象深拷贝
const moveCopy = { row: move.row, col: move.col, value: move.value };
```

#### 如果误用浅拷贝会导致什么问题？

**场景 1：输入污染**

```js
// 错误实现
const grid = input;  // 浅拷贝

// 外部修改 input 会影响内部 grid
input[0][0] = 5;  // 内部 grid 也被修改了！
```

**场景 2：历史污染**

```js
// 错误实现
history.push(move);  // 浅拷贝

// 后续修改 move 会影响历史记录
move.value = 0;  // history 中的 move 也被修改了！
```

**场景 3：返回污染**

```js
// 错误实现
return this.grid;  // 浅拷贝

// 外部修改返回值会影响内部状态
const grid = sudoku.getGrid();
grid[0][0] = 5;  // 内部 grid 也被修改了！
```

---

### 6. 序列化/反序列化设计

#### Sudoku.toJSON()

```js
{
  grid: number[][]  // 9x9 二维数组
}
```

#### Game.toJSON()

```js
{
  sudoku: { grid: number[][] },
  history: Move[],
  undoStack: Move[]
}
```

#### 恢复时如何重建对象？

**Sudoku 恢复**：

```js
createSudokuFromJSON(json) {
  return createSudoku(json.grid);
}
```

**Game 恢复**：

```js
createGameFromJSON(json) {
  // 1. 从 grid 创建初始 Sudoku
  const initialSudoku = createSudoku(json.sudoku.grid);
  
  // 2. 创建 Game 并恢复历史状态
  return createGameWithHistory({
    sudoku: initialSudoku,
    history: json.history,
    undoStack: json.undoStack
  });
}
```

**注意**：由于 `json.sudoku.grid` 已经是最终状态（所有操作执行后的结果），我们实际上不需要重放 history。但为了保持 history 和 undoStack 的一致性（用于后续的 undo/redo 操作），我们需要恢复这些栈的内容。

---

### 7. 外表化接口设计

#### `Sudoku.toString()`

```
Sudoku Grid:
5 3 0 0 7 0 0 0 0
6 0 0 1 9 5 0 0 0
0 9 8 0 0 0 0 6 0
8 0 0 0 6 0 0 0 3
4 0 0 8 0 3 0 0 1
7 0 0 0 2 0 0 0 6
0 6 0 0 0 0 2 8 0
0 0 0 4 1 9 0 0 5
0 0 0 0 8 0 0 7 9
```

**设计理由**：

- 使用空格分隔数字，便于阅读
- 0 表示空格（未填写的格子）
- 每行一个换行，符合数独的视觉习惯

#### `Sudoku.toJSON()` / `Game.toJSON()`

返回纯 JSON 对象，可用于：

- 保存到 localStorage
- 通过网络传输
- 调试时打印状态

---

## 二、领域对象如何被消费

### 1. View 层直接消费的是什么？

View 层直接消费的是 **`gameStore`（Store Adapter）**，而不是直接消费 `Game` 或 `Sudoku` 领域对象。

架构分层：

```
┌─────────────────────────────────────┐
│         Svelte Components           │  ← View 层
│  (Board, Keyboard, Actions, etc.)   │
└──────────────┬──────────────────────┘
               │ 使用 $gameStore.grid, $gameStore.invalidCells
               │ 调用 gameStore.guess(), undo(), redo()
┌──────────────▼──────────────────────┐
│        gameStore (Adapter)          │  ← 适配层
│  - 持有 Game / Sudoku 领域对象      │
│  - 暴露 Svelte writable stores      │
│  - 提供 UI 可调用的方法             │
└──────────────┬──────────────────────┘
               │ 内部调用
┌──────────────▼──────────────────────┐
│    Game / Sudoku (Domain Objects)   │  ← 领域层
│  - 纯业务逻辑，无 UI 依赖           │
│  - 提供 subscribe() 通知机制        │
└─────────────────────────────────────┘
```

### 2. View 层拿到的数据是什么？

UI 组件通过 `gameStore` 获取以下响应式状态：

| Store                       | 类型           | 说明                | 消费组件                          |
| --------------------------- | -------------- | ------------------- | --------------------------------- |
| `$gameStore.grid`         | `number[][]` | 当前数独网格（9x9） | `Board/index.svelte`            |
| `$gameStore.invalidCells` | `string[]`   | 冲突单元格坐标列表  | `Board/index.svelte`            |
| `$gameStore.canUndo`      | `boolean`    | 是否可以撤销        | `ActionBar/Actions.svelte`      |
| `$gameStore.canRedo`      | `boolean`    | 是否可以重做        | `ActionBar/Actions.svelte`      |
| `$gameStore.isComplete`   | `boolean`    | 游戏是否完成        | `App.svelte` (通过 `gameWon`) |

### 3. 用户操作如何进入领域对象？

所有用户操作都通过 `gameStore` 暴露的方法进入领域对象：

```
用户点击数字键 (Keyboard.svelte)
    → gameStore.guess(row, col, value)
        → game.guess({row, col, value})
            → sudoku.guess(move)
                → 修改内部 grid
                → notify() 通知订阅者
                    → gameStore.syncToStores()
                        → grid.set(newGrid) 触发 UI 更新

用户点击撤销 (Actions.svelte)
    → gameStore.undo()
        → game.undo()
            → 从 history 弹出最后一步
            → 推入 undoStack
            → sudoku.guess({row, col, value: 0}) 清除格子
                → notify() 通知订阅者
                    → gameStore.syncToStores() 触发 UI 更新

用户点击重做
    → gameStore.redo()
        → game.redo()
            → 从 undoStack 弹出
            → 推入 history
            → sudoku.guess(move)
                → notify() → syncToStores() → UI 更新
```

### 4. 领域对象变化后，Svelte 为什么会更新？

这是通过 **订阅-通知机制** 实现的：

```javascript
// gameStore.js 中
game.subscribe(() => {
  syncToStores();  // 当领域对象变化时，同步到 Svelte stores
});

function syncToStores() {
  const sudoku = game.getSudoku();
  grid.set(sudoku.getGrid());        // 设置 grid store
  invalidCells.set(sudoku.validate()); // 设置 invalidCells store
  canUndo.set(game.canUndo());
  canRedo.set(game.canRedo());
  isComplete.set(sudoku.isComplete());
}
```

当 `Game` 或 `Sudoku` 内部状态变化时，调用 `notify()`，触发 `syncToStores()`，进而更新所有 Svelte writable stores。由于 Svelte 的 `$store` 语法会自动订阅 store 的变化，UI 会在 store 更新时自动重新渲染。

---

## 三、响应式机制说明

### 1. 依赖的响应式机制

本方案依赖的是 **Svelte writable store + 订阅通知机制**：

- `Game` 和 `Sudoku` 领域对象内部维护自己的状态（grid, history, undoStack）
- 领域对象提供 `subscribe(fn)` 方法，允许外部订阅状态变化
- 每次 `guess()` / `undo()` / `redo()` 操作后，调用 `notify()` 通知所有订阅者
- `gameStore` 订阅了领域对象的变化
- 收到通知后，`gameStore` 将领域对象的状态同步到 Svelte writable stores
- Svelte 组件通过 `$store` 语法消费这些 stores

### 2. 响应式暴露给 UI 的数据

| 状态         | 暴露方式                                    | 是否响应式 |
| ------------ | ------------------------------------------- | ---------- |
| grid         | `gameStore.grid` (writable store)         | ✅ 是      |
| invalidCells | `gameStore.invalidCells` (writable store) | ✅ 是      |
| canUndo      | `gameStore.canUndo` (writable store)      | ✅ 是      |
| canRedo      | `gameStore.canRedo` (writable store)      | ✅ 是      |
| isComplete   | `gameStore.isComplete` (writable store)   | ✅ 是      |

### 3. 留在领域对象内部的状态

以下状态**不**直接暴露给 UI，留在领域对象内部管理：

| 状态               | 位置            | 说明                          |
| ------------------ | --------------- | ----------------------------- |
| history (历史记录) | `Game` 内部   | 仅通过 `canUndo()` 间接暴露 |
| undoStack (撤销栈) | `Game` 内部   | 仅通过 `canRedo()` 间接暴露 |
| grid (Sudoku 内部) | `Sudoku` 内部 | 通过 `getGrid()` 深拷贝暴露 |
| 订阅者列表         | `Game` 内部   | 内部管理，不暴露              |

### 4. 如果直接 mutate 内部对象会出现什么问题？

如果不用本方案，而是直接 mutate 内部对象（例如直接修改 `userGrid` store 或二维数组），会出现以下问题：

#### 问题 1: Svelte 可能不触发更新

Svelte 3 的响应式系统基于赋值（`=`）和 store 的 `set()` / `update()`。如果只是直接修改数组元素：

```javascript
// ❌ 错误示例：直接修改数组元素
grid[row][col] = value;  // Svelte 可能不会检测到变化！
```

这种情况下，数组引用没有变，Svelte 的 reactive statements（`$:`）不会触发，UI 不会更新。

#### 问题 2: 外部引用污染

```javascript
// ❌ 错误示例：返回内部引用
getGrid() {
  return this.grid;  // 外部可以直接修改内部状态！
}
```

外部代码拿到引用后直接修改，绕过了领域对象的业务逻辑（如历史记录、验证等）。

#### 问题 3: 历史管理混乱

```javascript
// ❌ 错误示例：UI 直接修改 grid
userGrid.set(pos, value);  // 绕过了 Game.guess()
```

如果 UI 直接修改 grid 而不通过 `Game.guess()`，历史记录不会被更新，导致 undo/redo 失效。

### 5. 本方案如何避免这些问题？

- **深拷贝隔离**：`getGrid()` 返回深拷贝，外部无法直接修改内部状态
- **统一入口**：所有修改都通过 `gameStore.guess()` → `Game.guess()` → `Sudoku.guess()` 链路
- **自动通知**：每次修改后自动 `notify()`，确保 store 同步更新
- **单一数据源**：`gameStore.grid` 是 UI 渲染的唯一数据源，避免多状态源导致的不一致

---

## 四、改进说明

### 1. 相比 Homework1，改进了什么？

| 改进项                   | HW1               | HW1.1               | 说明                     |
| ------------------------ | ----------------- | ------------------- | ------------------------ |
| **接入 Svelte UI** | ❌ 只在测试中可用 | ✅ 真实接入游戏流程 | 这是本次作业的核心目标   |
| **响应式机制**     | ❌ 无             | ✅ subscribe/notify | 领域对象可被 Svelte 消费 |
| **校验能力**       | 无                | `validate()`      | Sudoku 可计算冲突单元格  |
| **完成状态**       | 无                | `isComplete()`    | 可判断游戏是否完成       |
| **Store Adapter**  | 无                | `gameStore`       | 桥接领域层与 View 层     |

### 2. 为什么 HW1 中的做法不足以支撑真实接入？

HW1 的实现是纯粹的领域对象，没有考虑以下问题：

1. **无响应式机制**：HW1 的 `Game` 和 `Sudoku` 没有提供订阅接口，Svelte 无法感知状态变化
2. **无适配层**：没有 Store Adapter，UI 不知道该消费什么
3. **未接入 UI**：领域对象只在测试中创建和操作，真实界面没有使用它们
4. **数据源不统一**：UI 直接使用 `userGrid` store，与领域对象没有关系

### 3. 新设计的 trade-off

#### 优点

- **清晰的职责边界**：领域对象专注业务逻辑，adapter 专注响应式桥接，UI 组件专注渲染
- **可测试性**：领域对象不依赖 Svelte，可以独立测试
- **可维护性**：如果将来迁移到 Svelte 5 或其他框架，只需修改 adapter 层，领域对象不变
- **单一数据源**：`gameStore.grid` 是 UI 的唯一数据源，避免状态不一致

#### 缺点

- **额外的抽象层**：增加了一个 adapter 层，理解成本略高
- **数据拷贝开销**：每次同步都做深拷贝，对于大型网格可能有性能影响（但 9x9 数独影响可忽略）
- **双重状态管理**：领域对象内部维护状态，同时 store 也维护一份副本（这是为了保证响应式的必要代价）

---

## 五、Svelte 响应式机制详解

### 1. 为什么修改对象内部字段后，界面不一定自动更新？

Svelte 3 的响应式系统基于**赋值检测**（assignment detection），而不是基于深度监听（deep observation）。

```javascript
// ❌ 不会触发更新：直接修改数组元素
grid[row][col] = value;  // 只是修改了数组元素，grid 引用未变

// ✅ 会触发更新：重新赋值
grid = grid.map((r, i) => i === row ? r.map((c, j) => j === col ? value : c) : r);
```

Svelte 编译器在编译时会追踪赋值操作（`=`），如果只是修改对象/数组内部元素而没有重新赋值，Svelte 无法检测到变化。

### 2. 为什么直接改二维数组元素，有时 Svelte 不会按预期刷新？

这是因为 Svelte 的响应式依赖是**浅层比较**：

```javascript
$: console.log(grid);  // 只在 grid 引用变化时触发

// 以下操作不会触发上面的 reactive statement：
grid[0][0] = 5;  // grid 还是同一个引用
grid[0].push(5); // grid[0] 还是同一个引用

// 以下操作会触发：
grid = [...grid];  // 新数组引用
grid = grid.map(...);  // 新数组引用
```

**我们的解决方案**：通过 writable store 的 `set()` 方法，每次传入新引用（深拷贝后的 grid），确保 Svelte 能检测到变化。

### 3. 为什么 store 可以被 `$store` 消费？

Svelte 的 store 协议要求对象实现 `subscribe()` 方法：

```javascript
// writable store 的接口
{
  subscribe: (run: (value: any) => void) => () => void,
  set: (value: any) => void,
  update: (updater: (value: any) => any) => void
}
```

`$store` 语法是 Svelte 编译器提供的**自动订阅/取消订阅**机制：

```svelte
<script>
  import { writable } from 'svelte/store';
  const count = writable(0);
  
  // $count 会自动订阅 count 的变化
  // 组件销毁时会自动取消订阅
</script>

<p>Count: {$count}</p>  <!-- 自动响应 count.set() -->
```

### 4. 为什么 `$:` 有时会更新，有时不会更新？

`$:` reactive statement 的执行时机取决于其**依赖项**：

```javascript
// 依赖 grid 引用
$: console.log('grid changed', grid);  // 只在 grid 引用变化时触发

// 依赖 grid[0][0]
$: console.log('cell changed', grid[0][0]);  // 只在 grid[0][0] 变化时触发

// 依赖多个值
$: total = grid.flat().filter(x => x !== 0).length;  // 依赖 grid 中的所有值
```

**问题场景**：

```javascript
let grid = [[0,0], [0,0]];

// ❌ 不会触发任何 reactive statement
grid[0][0] = 5;

// ✅ 会触发依赖 grid 的 reactive statement
grid = [[5,0], [0,0]];
```

**间接依赖问题**：

```javascript
// gameStore 内部
$: gridCopy = game.getSudoku().getGrid();  // 依赖 game 的 notify

// ❌ 如果 game.notify 不触发 gridCopy 的重新计算
// UI 就不会更新

// ✅ 正确做法：通过 store.set() 显式触发
grid.set(game.getSudoku().getGrid());
```

### 5. 我们的方案依赖的响应式机制

我们使用的是 **writable store + 显式 set()** 机制：

```javascript
// gameStore.js
import { writable } from 'svelte/store';

const grid = writable([]);
const invalidCells = writable([]);
const canUndo = writable(false);
const canRedo = writable(false);
const isComplete = writable(false);

// 领域对象变化时同步到 stores
function syncToStores() {
  const sudoku = game.getSudoku();
  grid.set(sudoku.getGrid());              // ✅ 新引用，触发 UI 更新
  invalidCells.set(sudoku.validate());     // ✅ 新数组，触发 UI 更新
  canUndo.set(game.canUndo());
  canRedo.set(game.canRedo());
  isComplete.set(sudoku.isComplete());
}

// 订阅领域对象的变化
game.subscribe(syncToStores);
```

**为什么这样能工作**：

1. `game.guess()` / `undo()` / `redo()` 执行后调用 `notify()`
2. `notify()` 触发 `syncToStores()`
3. `syncToStores()` 调用各 store 的 `set()` 方法
4. `set()` 方法通知 Svelte 订阅者（UI 组件）
5. Svelte 检测到 store 值变化，重新渲染

### 6. 如果错误地直接 mutate 对象，会出什么问题？

#### 场景 A: 直接修改 grid 元素

```javascript
// ❌ 错误做法
function handleCellClick(row, col, value) {
  $gameStore.grid[row][col] = value;  // 不会触发 UI 更新
}
```

**问题**：`$gameStore.grid` 是 writable store 的值，直接修改其内部元素不会触发 `set()`，Svelte 不知道变化了。

#### 场景 B: 绕过 gameStore 直接操作

```javascript
// ❌ 错误做法
let userGrid = writable(initialGrid);

function handleGuess(row, col, value) {
  userGrid.update(g => {
    g[row][col] = value;  // 即使 update 会触发，历史也没更新
    return g;
  });
  // Game 的 history 没有更新，undo/redo 失效！
}
```

**问题**：绕过了领域对象，导致业务逻辑（历史记录、校验等）不执行。

### 7. 为什么我们的方案不会出现这些问题？

| 问题                   | 我们的方案                                             | 为什么有效                                 |
| ---------------------- | ------------------------------------------------------ | ------------------------------------------ |
| 直接修改数组元素不刷新 | 通过 `grid.set(newGrid)` 传入新引用                  | Svelte 检测到 store 值引用变化             |
| 外部引用污染内部状态   | `getGrid()` 返回深拷贝                               | 外部修改不影响内部 grid                    |
| 绕过业务逻辑           | 所有操作通过 `gameStore.guess()` → `Game.guess()` | 统一入口，保证历史记录、校验等逻辑执行     |
| 状态不一致             | `syncToStores()` 同步所有 stores                     | grid、invalidCells、canUndo 等始终保持一致 |

---

## 六、课堂讨论

### 1. 你的 view 层直接消费的是谁？

View 层直接消费的是 `gameStore`（Store Adapter），不是 `Game` 或 `Sudoku`。

### 2. 为什么你的 UI 在领域对象变化后会刷新？

因为 `gameStore` 订阅了领域对象的变化（`game.subscribe()`），当领域对象执行 `guess/undo/redo` 后调用 `notify()`，触发 `syncToStores()` 更新 Svelte stores，而 Svelte 的 `$store` 语法会自动订阅和响应 store 变化。

### 3. 你的方案中，响应式边界在哪里？

响应式边界在 `gameStore.syncToStores()` 方法中：

- **内部**：领域对象（`Game`, `Sudoku`）自己管理状态和通知
- **外部**：Svelte stores 对外暴露响应式数据
- **边界**：`gameStore` 的订阅回调是响应式的入口

### 4. 你的 Sudoku / Game 哪些状态对 UI 可见，哪些不可见？

| 状态            | 可见性    | 暴露方式                                     |
| --------------- | --------- | -------------------------------------------- |
| grid            | ✅ 可见   | 通过 `gameStore.grid`                      |
| invalidCells    | ✅ 可见   | 通过 `gameStore.invalidCells`              |
| canUndo/canRedo | ✅ 可见   | 通过 `gameStore.canUndo/canRedo`           |
| isComplete      | ✅ 可见   | 通过 `gameStore.isComplete` → `gameWon` |
| history         | ❌ 不可见 | 内部状态，仅暴露 canUndo 状态                |
| undoStack       | ❌ 不可见 | 内部状态，仅暴露 canRedo 状态                |

### 5. 如果将来迁移到 Svelte 5，哪一层最稳定，哪一层最可能改动？

- **最稳定**：`Sudoku` 和 `Game` 领域对象（纯 JS，无框架依赖）
- **最可能改动**：`gameStore` adapter 层（需要适配 Svelte 5 的 runes 响应式机制）
- **可能需要调整**：UI 组件中的 `$store` 语法（Svelte 5 使用 `$state` 和 `$derived`）

---

## 七、实现改进记录（HW1.1 接入修复）

### 1. 修复的问题

在初始接入时，存在以下关键问题，本次已全部修复：

#### 问题 1：订阅泄漏（gameStore.js）

**问题描述**：`initGame()` 和 `loadFromJSON()` 每次调用都会创建新的订阅，但没有取消旧订阅，导致：
- 内存泄漏
- 多次触发 `syncToStores()`
- 旧 Game 对象无法被 GC 回收

**修复方案**：
```javascript
// 保存取消订阅函数
let unsubscribeGame = null;

function unsubscribeCurrent() {
  if (unsubscribeGame) {
    unsubscribeGame();
    unsubscribeGame = null;
  }
}

// 在 initGame 和 loadFromJSON 中先取消旧订阅
unsubscribeCurrent();
unsubscribeGame = game.subscribe(() => {
  syncToStores();
});
```

#### 问题 2：双重初始化（game.js）

**问题描述**：`startNew()` 和 `startCustom()` 同时调用：
1. `grid.generate(diff)` - 设置旧 grid store
2. 通过订阅机制再初始化 `gameStore.initGame()`

这导致：
- 不必要的异步等待
- 两套 grid 体系并行存在
- 数据源不清晰

**修复方案**：
```javascript
// 直接生成/解码 grid，然后一次性初始化 gameStore
const generatedGrid = generateSudoku(diff);
gameStore.initGame(generatedGrid);
```

不再依赖旧 grid store 的订阅机制，改为直接传递数据。

#### 问题 3：UI 组件引用旧数据源

**问题描述**：多个 UI 组件仍然引用旧的 `grid` 和 `userGrid` stores：
- `Board/index.svelte` - 引用 `$grid`
- `Keyboard.svelte` - 导入未使用的 `userGrid`
- `Actions.svelte` - hint 功能引用 `$userGrid`
- `Share.svelte` - 使用旧 `grid.getSencode()` 方法

**修复方案**：
将所有对旧 stores 的引用统一改为 `$gameStore.grid`：
```svelte
<!-- 修改前 -->
{#each $grid as row, y}
  ...
{/each}

<!-- 修改后 -->
{#each $gameStore.grid as row, y}
  ...
{/each}
```

### 2. 改进效果

| 改进项 | 改进前 | 改进后 |
|--------|--------|--------|
| **数据源** | 双数据源（grid + gameStore.grid） | 单一数据源（gameStore.grid） |
| **内存管理** | 订阅泄漏，持续增长 | 正确取消订阅，无泄漏 |
| **初始化流程** | 异步订阅，双重初始化 | 同步初始化，清晰高效 |
| **代码清晰度** | 散落在多处的 grid 引用 | 统一到 gameStore |
| **可维护性** | 难以追踪数据流 | 清晰的分层架构 |

### 3. 架构验证

修改后的架构完全符合 DESIGN.md 中的设计：

```
┌─────────────────────────────────────┐
│         Svelte Components           │  ← View 层
│  (Board, Keyboard, Actions, etc.)   │     只消费 $gameStore.*
└──────────────┬──────────────────────┘
               │ 使用 $gameStore.grid, $gameStore.invalidCells
               │ 调用 gameStore.guess(), undo(), redo()
┌──────────────▼──────────────────────┐
│        gameStore (Adapter)          │  ← 适配层
│  - 持有 Game / Sudoku 领域对象      │     正确的订阅管理
│  - 暴露 Svelte writable stores      │     同步初始化流程
│  - 提供 UI 可调用的方法             │
└──────────────┬──────────────────────┘
               │ 内部调用
┌──────────────▼──────────────────────┐
│    Game / Sudoku (Domain Objects)   │  ← 领域层
│  - 纯业务逻辑，无 UI 依赖           │
│  - 提供 subscribe() 通知机制        │
└─────────────────────────────────────┘
```

### 4. 测试要点

- ✅ 开始新游戏 - grid 正确显示
- ✅ 用户输入 - 通过 gameStore.guess() 正确更新
- ✅ 撤销/重做 - UI 正确响应变化
- ✅ 冲突检测 - invalidCells 正确高亮
- ✅ 游戏完成 - isComplete 触发 gameWon
- ✅ 分享功能 - 从 gameStore.grid 正确编码
- ✅ 内存泄漏 - 多次切换游戏无累积订阅
