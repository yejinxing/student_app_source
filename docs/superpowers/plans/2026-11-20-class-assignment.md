# 分班编学号 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新增独立“分班编学号”页面：读取学生 Excel，按专业均衡分班，按 11 位规则生成学号，并在保留原列的前提下导出 Excel。

**Architecture:** 业务逻辑放在不依赖 Electron 的 `src/classAssigner/` 纯 Node 模块，主进程通过 4 个 `ipcMain.handle` 通道暴露分析、生成和模板下载；渲染层只负责选择文件、确认表、班级数/年份编辑和结果展示。分析阶段只把专业组摘要传给渲染层，不传学生明细；生成阶段主进程重新读取并校验文件指纹。

**Tech Stack:** Electron 39、Node 22、CommonJS、`xlsx`、`fs-extra`、`node:test`、Playwright Electron 冒烟测试。

## Global Constraints

- 使用 CommonJS（`require` / `module.exports`），不引入 TypeScript、bundler 或新依赖。
- `src/classAssigner/` 不得 `require('electron')`；只允许 `xlsx`、`fs-extra`、`path` 和 Node 内置模块。
- 渲染层继续使用经典 `<script>`、`data-action` 事件委托和 `window.electronAPI`；不新增内联事件。
- 严格跨专业隔离：按 `层次代码 + 院系代码 + 专业代码` 分组，分班、男女配额、省份均衡、班级编号只在本组内进行。
- 学号固定 11 位：`年份(4) + 层次(1) + 院系(2) + 专业(1) + 班级(1) + 班内序号(2)`。
- 年份默认当前电脑本地年份，确认页可手动修改；必须是 4 位整数。
- 班级人数公式：前 `k-1` 个班取 `ceil(N/k)`，最后一个班取剩余人数；`last < 1` 的 `k` 无效。
- 自动建议目标 30–40 人：最大偏差最小 → 总偏差最小 → 班级数更少。
- 提醒等级：正常 30–40；黄色 28–29 或 41–42；红色 <28 或 >42；班级人数 >99 为错误。
- Excel 提供的班级数优先；无效时改用自动建议并红色提示；确认页最终输入无效时禁止生成。
- 输出保留输入全部列；目标列 `班级名称`、`班号`、`班级数量`、`学号` 已存在则原位覆盖，不存在则追加；`编号` 已存在则保留，不存在则按输入行序生成 `1..N`。
- 输出文件写在输入文件同目录，文件名 `<原名>_分班学号_YYYYMMDD_HHmmss.xlsx`，同名追加 `_1`、`_2`。
- `assets/学生分班模板.xlsx` 只允许包含表头，不得包含真实学生数据。
- 测试夹具只能使用合成姓名、合成身份证号、合成考生号；不得读取 `docs/` 下的真实文件。
- 所有新增/修改文件保持 UTF-8，中文文案与现有页面一致。

---

## File Structure

| 文件 | 责任 |
|---|---|
| `src/classAssigner/constants.js` | 表头、代码映射、阈值、目标列常量 |
| `src/classAssigner/studentId.js` | 代码规范化、年份校验、学号格式化 |
| `src/classAssigner/classPlan.js` | 班级人数、自动建议、提醒等级、`k=1..9` 选项 |
| `src/classAssigner/columns.js` | 表头识别、别名、必填列、输出列布局 |
| `src/classAssigner/excel.js` | 读取第一个非空工作表、写输出、生成输出路径 |
| `src/classAssigner/validation.js` | 必填/代码/重复值校验，带 Excel 行号 |
| `src/classAssigner/groups.js` | 按层次+院系+专业分组、班级数量来源、组摘要 |
| `src/classAssigner/assign.js` | 男女配额、省份均衡、班内排序、班级/序号分配 |
| `src/classAssigner/index.js` | `analyzeWorkbook` / `generateWorkbook` 对外入口 |
| `scripts/generate-class-template.js` | 生成仅表头的模板资产 |
| `assets/学生分班模板.xlsx` | 仅表头空模板（二进制，提交） |
| `src/main/ipc/classAssignIpc.js` | 4 个 IPC 通道、路径校验、模板下载 |
| `src/preload.js` | 增加 4 个 invoke 白名单通道 |
| `main.js` | 注册 `registerClassAssignIpc()` |
| `index.html` | 侧边栏、首页卡片、页面标记、确认弹窗、CSS/JS 引用 |
| `src/renderer/js/core.js` | 页面切换、`pageActions` 动作 |
| `src/renderer/js/class-assign.js` | 页面交互、确认表、二次确认、结果展示 |
| `src/renderer/css/class-assign.css` | 确认表、状态点、图例、年份输入样式 |
| `tests/unit/classAssigner.studentId.test.js` | 学号工具单测 |
| `tests/unit/classAssigner.classPlan.test.js` | 班级方案单测 |
| `tests/unit/classAssigner.columns.test.js` | 表头/输出布局单测 |
| `tests/unit/classAssigner.validation.test.js` | 数据校验单测 |
| `tests/unit/classAssigner.groups.test.js` | 分组/来源单测 |
| `tests/unit/classAssigner.assign.test.js` | 均衡分班单测 |
| `tests/integration/classAssigner.test.js` | 分析/生成集成测试 |
| `tests/integration/classAssigner.template.test.js` | 模板资产测试 |
| `tests/helpers/fixtures.js` | 增加分班工作簿测试辅助 |
| `tests/smoke/electron.smoke.test.js` | 页面切换、IPC 分析、CSS/JS 数量 |
| `README.md` / `CLAUDE.md` / `RELEASE_NOTES.md` | 功能、架构、发布说明 |

---

### Task 1: 学号工具与常量

**Files:**
- Create: `src/classAssigner/constants.js`
- Create: `src/classAssigner/studentId.js`
- Test: `tests/unit/classAssigner.studentId.test.js`

**Interfaces:**
- Produces:
  - `normalizeDeptCode(value): string|null`（2 位，1–99）
  - `normalizeLevelCode(value): string|null`（1 位，1–3）
  - `normalizeMajorCode(value): string|null`（1 位，1–9）
  - `normalizeClassNo(value): string|null`（1 位，1–9）
  - `normalizeSeq(value): string|null`（2 位，1–99）
  - `validateYear(value): string|null`（4 位）
  - `formatStudentId({ year, levelCode, deptCode, majorCode, classNo, seq }): string`
  - `isValidStudentId(id): boolean`
  - `toInteger(value): number|null`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/classAssigner.studentId.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    normalizeDeptCode,
    normalizeLevelCode,
    normalizeMajorCode,
    normalizeSeq,
    validateYear,
    formatStudentId,
    isValidStudentId
} = require('../../src/classAssigner/studentId');

test('规范化院系/层次/专业/序号', () => {
    assert.equal(normalizeDeptCode('1'), '01');
    assert.equal(normalizeDeptCode('09'), '09');
    assert.equal(normalizeDeptCode('100'), null);
    assert.equal(normalizeLevelCode('1'), '1');
    assert.equal(normalizeLevelCode('4'), null);
    assert.equal(normalizeMajorCode('9'), '9');
    assert.equal(normalizeMajorCode('10'), null);
    assert.equal(normalizeSeq(1), '01');
    assert.equal(normalizeSeq(99), '99');
    assert.equal(normalizeSeq(100), null);
});

test('校验入学年份', () => {
    assert.equal(validateYear(2026), '2026');
    assert.equal(validateYear('2027'), '2027');
    assert.equal(validateYear('26'), null);
    assert.equal(validateYear('20260'), null);
});

test('生成 11 位学号', () => {
    assert.equal(formatStudentId({
        year: 2026, levelCode: '1', deptCode: '01', majorCode: '1', classNo: 1, seq: 1
    }), '20261011101');
    assert.equal(formatStudentId({
        year: 2027, levelCode: '2', deptCode: '09', majorCode: '8', classNo: 4, seq: 30
    }), '20272098430');
    assert.equal(isValidStudentId('20261011101'), true);
    assert.equal(isValidStudentId('2026101110'), false);
});

test('非法参数抛错', () => {
    assert.throws(() => formatStudentId({
        year: '26', levelCode: '1', deptCode: '01', majorCode: '1', classNo: 1, seq: 1
    }));
    assert.throws(() => formatStudentId({
        year: 2026, levelCode: '4', deptCode: '01', majorCode: '1', classNo: 1, seq: 1
    }));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/unit/classAssigner.studentId.test.js
```

Expected: FAIL with `Cannot find module '../../src/classAssigner/studentId'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/classAssigner/constants.js`:

```js
const HEADER_ALIASES = {
    '身份证号': '身份证号码'
};

const REQUIRED_HEADERS = [
    '姓名',
    '性别',
    '层次代码',
    '院系名称',
    '院系代码',
    '专业名称',
    '专业代码'
];

const TARGET_COLUMNS = ['班级名称', '班号', '班级数量', '学号'];

const LEVEL_NAMES = {
    1: '本科',
    2: '专科',
    3: '专升本'
};

const KNOWN_DEPT_CODES = new Set(['01', '02', '03', '04', '05', '06', '07', '08', '09']);

const CLASS_SIZE_MIN = 30;
const CLASS_SIZE_MAX = 40;
const CLASS_SIZE_WARN_MIN = 28;
const CLASS_SIZE_WARN_MAX = 42;
const MAX_CLASS_COUNT = 9;
const MAX_CLASS_SIZE = 99;

module.exports = {
    HEADER_ALIASES,
    REQUIRED_HEADERS,
    TARGET_COLUMNS,
    LEVEL_NAMES,
    KNOWN_DEPT_CODES,
    CLASS_SIZE_MIN,
    CLASS_SIZE_MAX,
    CLASS_SIZE_WARN_MIN,
    CLASS_SIZE_WARN_MAX,
    MAX_CLASS_COUNT,
    MAX_CLASS_SIZE
};
```

Create `src/classAssigner/studentId.js`:

```js
const { MAX_CLASS_SIZE } = require('./constants');

function toInteger(value) {
    if (typeof value === 'number' && Number.isFinite(value) && Number.isInteger(value)) {
        return value;
    }
    const text = String(value == null ? '' : value).trim();
    if (!/^\d+$/.test(text)) return null;
    const number = Number(text);
    return Number.isSafeInteger(number) ? number : null;
}

function normalizeSingleDigit(value, min, max) {
    const number = toInteger(value);
    if (number === null || number < min || number > max) return null;
    return String(number);
}

function normalizeDeptCode(value) {
    const number = toInteger(value);
    if (number === null || number < 1 || number > 99) return null;
    return String(number).padStart(2, '0');
}

function normalizeLevelCode(value) {
    return normalizeSingleDigit(value, 1, 3);
}

function normalizeMajorCode(value) {
    return normalizeSingleDigit(value, 1, 9);
}

function normalizeClassNo(value) {
    return normalizeSingleDigit(value, 1, 9);
}

function normalizeSeq(value) {
    const number = toInteger(value);
    if (number === null || number < 1 || number > MAX_CLASS_SIZE) return null;
    return String(number).padStart(2, '0');
}

function validateYear(value) {
    const text = String(value == null ? '' : value).trim();
    if (!/^\d{4}$/.test(text)) return null;
    const number = Number(text);
    if (!Number.isInteger(number) || number < 1000 || number > 9999) return null;
    return String(number);
}

function formatStudentId({ year, levelCode, deptCode, majorCode, classNo, seq }) {
    const normalizedYear = validateYear(year);
    const normalizedLevel = normalizeLevelCode(levelCode);
    const normalizedDept = normalizeDeptCode(deptCode);
    const normalizedMajor = normalizeMajorCode(majorCode);
    const normalizedClass = normalizeClassNo(classNo);
    const normalizedSeq = normalizeSeq(seq);
    if (!normalizedYear || !normalizedLevel || !normalizedDept || !normalizedMajor || !normalizedClass || !normalizedSeq) {
        throw new Error('学号参数无效');
    }
    return `${normalizedYear}${normalizedLevel}${normalizedDept}${normalizedMajor}${normalizedClass}${normalizedSeq}`;
}

function isValidStudentId(id) {
    return /^\d{11}$/.test(String(id == null ? '' : id));
}

module.exports = {
    toInteger,
    normalizeDeptCode,
    normalizeLevelCode,
    normalizeMajorCode,
    normalizeClassNo,
    normalizeSeq,
    validateYear,
    formatStudentId,
    isValidStudentId
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/unit/classAssigner.studentId.test.js
```

Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/classAssigner/constants.js src/classAssigner/studentId.js tests/unit/classAssigner.studentId.test.js
git commit -m "feat: 添加分班学号基础工具"
```

---

### Task 2: 班级方案与自动建议

**Files:**
- Create: `src/classAssigner/classPlan.js`
- Test: `tests/unit/classAssigner.classPlan.test.js`

**Interfaces:**
- Consumes: `constants.js` 阈值。
- Produces:
  - `classSizes(total, classCount): number[]|null`
  - `deviation(size): number`
  - `levelForSizes(sizes): 'ok'|'warn'|'danger'|'invalid'`
  - `getPlanOptions(total): PlanOption[]`
  - `autoClassCount(total): PlanOption|null`
  - `PlanOption = { classCount, sizes, valid, level, reasons }`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/classAssigner.classPlan.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
    classSizes,
    levelForSizes,
    autoClassCount,
    getPlanOptions
} = require('../../src/classAssigner/classPlan');

test('班级人数公式', () => {
    assert.deepEqual(classSizes(100, 3), [34, 34, 32]);
    assert.deepEqual(classSizes(77, 2), [39, 38]);
    assert.deepEqual(classSizes(5, 5), [1, 1, 1, 1, 1]);
    assert.equal(classSizes(5, 4), null);
    assert.equal(classSizes(0, 1), null);
});

test('提醒等级边界', () => {
    assert.equal(levelForSizes([30, 40]), 'ok');
    assert.equal(levelForSizes([29, 40]), 'warn');
    assert.equal(levelForSizes([28, 40]), 'warn');
    assert.equal(levelForSizes([27, 40]), 'danger');
    assert.equal(levelForSizes([41]), 'warn');
    assert.equal(levelForSizes([42]), 'warn');
    assert.equal(levelForSizes([43]), 'danger');
    assert.equal(levelForSizes([100]), 'invalid');
});

test('自动建议班级数', () => {
    assert.equal(autoClassCount(50).classCount, 2);
    assert.deepEqual(autoClassCount(50).sizes, [25, 25]);
    assert.equal(autoClassCount(82).classCount, 2);
    assert.deepEqual(autoClassCount(82).sizes, [41, 41]);
    assert.equal(autoClassCount(120).classCount, 3);
    assert.deepEqual(autoClassCount(120).sizes, [40, 40, 40]);
    assert.equal(autoClassCount(20).classCount, 1);
    assert.equal(autoClassCount(400).classCount, 9);
    assert.equal(autoClassCount(892), null);
});

test('选项包含无效班级数', () => {
    const options = getPlanOptions(892);
    assert.equal(options.length, 9);
    assert.ok(options.every(option => option.valid === false));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/unit/classAssigner.classPlan.test.js
```

Expected: FAIL with `Cannot find module '../../src/classAssigner/classPlan'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/classAssigner/classPlan.js`:

```js
const {
    CLASS_SIZE_MIN,
    CLASS_SIZE_MAX,
    CLASS_SIZE_WARN_MIN,
    CLASS_SIZE_WARN_MAX,
    MAX_CLASS_COUNT,
    MAX_CLASS_SIZE
} = require('./constants');

function classSizes(total, classCount) {
    if (!Number.isInteger(total) || !Number.isInteger(classCount)) return null;
    if (total < 1 || classCount < 1 || classCount > MAX_CLASS_COUNT || classCount > total) return null;
    const size = Math.ceil(total / classCount);
    const last = total - size * (classCount - 1);
    if (last < 1) return null;
    return [...Array(classCount - 1).fill(size), last];
}

function deviation(size) {
    if (size < CLASS_SIZE_MIN) return CLASS_SIZE_MIN - size;
    if (size > CLASS_SIZE_MAX) return size - CLASS_SIZE_MAX;
    return 0;
}

function levelForSizes(sizes) {
    if (!Array.isArray(sizes) || sizes.length === 0) return 'invalid';
    if (sizes.some(size => !Number.isInteger(size) || size < 1 || size > MAX_CLASS_SIZE)) return 'invalid';
    const maxDeviation = Math.max(...sizes.map(deviation));
    if (maxDeviation === 0) return 'ok';
    if (sizes.some(size => size < CLASS_SIZE_WARN_MIN || size > CLASS_SIZE_WARN_MAX)) return 'danger';
    return 'warn';
}

function invalidPlan(classCount, reason) {
    return {
        classCount,
        sizes: null,
        valid: false,
        level: 'invalid',
        reasons: [reason]
    };
}

function planFor(total, classCount) {
    if (!Number.isInteger(total) || total < 1) return invalidPlan(classCount, '专业人数无效');
    if (!Number.isInteger(classCount) || classCount < 1) return invalidPlan(classCount, '班级数必须为正整数');
    if (classCount > MAX_CLASS_COUNT) return invalidPlan(classCount, '班级数不能超过 9');
    if (classCount > total) return invalidPlan(classCount, '班级数不能超过专业人数');
    const sizes = classSizes(total, classCount);
    if (!sizes) return invalidPlan(classCount, '该班级数无法均分');
    if (sizes.some(size => size > MAX_CLASS_SIZE)) {
        return {
            classCount,
            sizes,
            valid: false,
            level: 'invalid',
            reasons: ['班级人数超过 99，无法生成两位学生代码']
        };
    }
    const level = levelForSizes(sizes);
    const reasons = [];
    if (level === 'warn') reasons.push('存在班级人数接近 30–40 边界');
    if (level === 'danger') reasons.push('存在班级人数明显偏离 30–40');
    return { classCount, sizes, valid: true, level, reasons };
}

function getPlanOptions(total) {
    if (!Number.isInteger(total) || total < 1) return [];
    const max = Math.min(MAX_CLASS_COUNT, total);
    const options = [];
    for (let classCount = 1; classCount <= max; classCount += 1) {
        options.push(planFor(total, classCount));
    }
    return options;
}

function autoClassCount(total) {
    const candidates = getPlanOptions(total).filter(option => option.valid);
    if (candidates.length === 0) return null;
    candidates.sort((a, b) => {
        const aMax = Math.max(...a.sizes.map(deviation));
        const bMax = Math.max(...b.sizes.map(deviation));
        if (aMax !== bMax) return aMax - bMax;
        const aTotal = a.sizes.reduce((sum, size) => sum + deviation(size), 0);
        const bTotal = b.sizes.reduce((sum, size) => sum + deviation(size), 0);
        if (aTotal !== bTotal) return aTotal - bTotal;
        return a.classCount - b.classCount;
    });
    return candidates[0];
}

module.exports = {
    classSizes,
    deviation,
    levelForSizes,
    getPlanOptions,
    autoClassCount
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/unit/classAssigner.classPlan.test.js
```

Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/classAssigner/classPlan.js tests/unit/classAssigner.classPlan.test.js
git commit -m "feat: 添加班级方案与自动建议"
```

---

### Task 3: 表头映射与 Excel 读写

**Files:**
- Create: `src/classAssigner/columns.js`
- Create: `src/classAssigner/excel.js`
- Test: `tests/unit/classAssigner.columns.test.js`

**Interfaces:**
- Consumes: `constants.js` 的 `HEADER_ALIASES`、`REQUIRED_HEADERS`、`TARGET_COLUMNS`。
- Produces:
  - `mapHeaders(headerRow): { headers, index, duplicates, missing }`
  - `buildOutputLayout(headerMap, { addNumber }): { headers, index, appended }`
  - `getCell(row, headerMap, name): unknown`
  - `findHeaderRowIndex(rows): number`
  - `readWorkbook(filePath): { sheetName, headerRow, dataRows, headerRowIndex, fingerprint }`
  - `writeWorkbook(filePath, sheetName, headers, rows): void`
  - `buildOutputPath(filePath, now = new Date()): string`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/classAssigner.columns.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const xlsx = require('xlsx');

const { mapHeaders, buildOutputLayout } = require('../../src/classAssigner/columns');
const { readWorkbook, writeWorkbook, buildOutputPath } = require('../../src/classAssigner/excel');
const { makeTempDir, removeTempDir } = require('../helpers/tmp');

test('识别表头别名与缺失列', () => {
    const headerMap = mapHeaders([
        '姓名', '身份证号', '性别', '层次代码', '院系名称', '院系代码', '专业名称', '专业代码'
    ]);
    assert.equal(headerMap.index['身份证号码'], 1);
    assert.deepEqual(headerMap.missing, []);
    assert.deepEqual(headerMap.duplicates, []);

    const missing = mapHeaders(['姓名']);
    assert.ok(missing.missing.includes('性别'));
});

test('检测重复表头', () => {
    const duplicate = mapHeaders(['姓名', '姓名', '性别']);
    assert.ok(duplicate.duplicates.includes('姓名'));

    const aliasDuplicate = mapHeaders(['姓名', '身份证号', '身份证号码', '性别']);
    assert.ok(aliasDuplicate.duplicates.includes('身份证号码/身份证号'));
});

test('输出列原位覆盖或追加', () => {
    const headerMap = mapHeaders(['姓名', '学号', '班级名称']);
    const layout = buildOutputLayout(headerMap, { addNumber: true });
    assert.deepEqual(layout.headers, ['姓名', '学号', '班级名称', '编号', '班号', '班级数量']);
    assert.equal(layout.index['学号'], 1);
    assert.equal(layout.index['班级名称'], 2);
    assert.equal(layout.index['编号'], 3);
    assert.equal(layout.index['班号'], 4);
    assert.equal(layout.index['班级数量'], 5);
});

test('读写 Excel 并生成不覆盖的输出路径', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const inputPath = path.join(dir, 'input.xlsx');
    const workbook = xlsx.utils.book_new();
    const sheet = xlsx.utils.aoa_to_sheet([
        ['姓名', '性别'],
        ['张三', '男']
    ]);
    xlsx.utils.book_append_sheet(workbook, sheet, 'Sheet1');
    xlsx.writeFile(workbook, inputPath);

    const book = readWorkbook(inputPath);
    assert.equal(book.sheetName, 'Sheet1');
    assert.deepEqual(book.headerRow, ['姓名', '性别']);
    assert.equal(book.headerRowIndex, 0);
    assert.deepEqual(book.dataRows[0], ['张三', '男']);
    assert.match(book.fingerprint, /^\d+:\d+/);

    const outputPath = buildOutputPath(inputPath, new Date(2026, 10, 20, 12, 34, 56));
    assert.match(path.basename(outputPath), /^input_分班学号_20261120_123456\.xlsx$/);

    await fs.writeFile(outputPath, 'occupied');
    const nextPath = buildOutputPath(inputPath, new Date(2026, 10, 20, 12, 34, 56));
    assert.match(path.basename(nextPath), /^input_分班学号_20261120_123456_1\.xlsx$/);

    const writtenPath = path.join(dir, 'written.xlsx');
    writeWorkbook(writtenPath, 'Sheet1', ['姓名', '学号'], [['张三', '20261011101']]);
    const written = readWorkbook(writtenPath);
    assert.deepEqual(written.headerRow, ['姓名', '学号']);
    assert.deepEqual(written.dataRows[0], ['张三', '20261011101']);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/unit/classAssigner.columns.test.js
```

Expected: FAIL with `Cannot find module '../../src/classAssigner/columns'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/classAssigner/columns.js`:

```js
const {
    HEADER_ALIASES,
    REQUIRED_HEADERS,
    TARGET_COLUMNS
} = require('./constants');

function cleanHeader(value) {
    return String(value == null ? '' : value).trim();
}

function findHeaderRowIndex(rows) {
    return rows.findIndex(row => Array.isArray(row) && row.some(cell => cleanHeader(cell) !== ''));
}

function mapHeaders(headerRow) {
    const headers = (headerRow || []).map(cleanHeader);
    const duplicates = [];
    const seen = new Map();
    for (let index = 0; index < headers.length; index += 1) {
        const name = headers[index];
        if (!name) continue;
        if (seen.has(name)) duplicates.push(name);
        else seen.set(name, index);
    }

    const idIndex = headers.indexOf('身份证号码');
    const aliasIndex = headers.indexOf('身份证号');
    if (idIndex !== -1 && aliasIndex !== -1) {
        duplicates.push('身份证号码/身份证号');
    }

    const index = {};
    for (const [alias, canonical] of Object.entries(HEADER_ALIASES)) {
        const position = headers.indexOf(alias);
        if (position !== -1 && index[canonical] === undefined) index[canonical] = position;
    }
    for (let position = 0; position < headers.length; position += 1) {
        const name = headers[position];
        if (name && index[name] === undefined) index[name] = position;
    }

    const missing = REQUIRED_HEADERS.filter(name => index[name] === undefined);
    return { headers, index, duplicates, missing };
}

function getCell(row, headerMap, name) {
    const position = headerMap.index[name];
    if (position === undefined || !Array.isArray(row)) return '';
    const value = row[position];
    return value == null ? '' : value;
}

function buildOutputLayout(headerMap, { addNumber }) {
    const headers = headerMap.headers.slice();
    const index = {};
    for (let position = 0; position < headers.length; position += 1) {
        const name = headers[position];
        if (name && index[name] === undefined) index[name] = position;
    }

    const appended = [];
    if (addNumber && index['编号'] === undefined) appended.push('编号');
    for (const name of TARGET_COLUMNS) {
        if (index[name] === undefined) appended.push(name);
    }
    for (const name of appended) {
        index[name] = headers.length;
        headers.push(name);
    }
    return { headers, index, appended };
}

module.exports = {
    cleanHeader,
    findHeaderRowIndex,
    mapHeaders,
    getCell,
    buildOutputLayout
};
```

Create `src/classAssigner/excel.js`:

```js
const path = require('path');
const fs = require('fs-extra');
const xlsx = require('xlsx');
const { findHeaderRowIndex } = require('./columns');

function readWorkbook(filePath) {
    const stat = fs.statSync(filePath);
    const fingerprint = `${stat.size}:${stat.mtimeMs}`;
    const workbook = xlsx.readFile(filePath, { cellDates: false });

    for (const sheetName of workbook.SheetNames) {
        const worksheet = workbook.Sheets[sheetName];
        if (!worksheet) continue;
        const rows = xlsx.utils.sheet_to_json(worksheet, {
            header: 1,
            defval: '',
            raw: false,
            blankrows: true
        });
        const headerRowIndex = findHeaderRowIndex(rows);
        if (headerRowIndex === -1) continue;
        return {
            sheetName,
            headerRow: rows[headerRowIndex],
            dataRows: rows.slice(headerRowIndex + 1),
            headerRowIndex,
            fingerprint
        };
    }

    const error = new Error('Excel 中没有可读取的数据');
    error.code = 'SHEET_EMPTY';
    throw error;
}

function writeWorkbook(filePath, sheetName, headers, rows) {
    const worksheet = xlsx.utils.aoa_to_sheet([headers, ...rows]);
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, sheetName || 'Sheet1');
    xlsx.writeFile(workbook, filePath, { bookType: 'xlsx' });
}

function buildOutputPath(filePath, now = new Date()) {
    const dir = path.dirname(filePath);
    const base = path.basename(filePath, path.extname(filePath));
    const date = [
        now.getFullYear(),
        String(now.getMonth() + 1).padStart(2, '0'),
        String(now.getDate()).padStart(2, '0')
    ].join('');
    const time = [
        String(now.getHours()).padStart(2, '0'),
        String(now.getMinutes()).padStart(2, '0'),
        String(now.getSeconds()).padStart(2, '0')
    ].join('');
    const stamp = `${date}_${time}`;

    let outputPath = path.join(dir, `${base}_分班学号_${stamp}.xlsx`);
    let suffix = 1;
    while (fs.existsSync(outputPath)) {
        outputPath = path.join(dir, `${base}_分班学号_${stamp}_${suffix}.xlsx`);
        suffix += 1;
    }
    return outputPath;
}

module.exports = {
    readWorkbook,
    writeWorkbook,
    buildOutputPath
};
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/unit/classAssigner.columns.test.js
```

Expected: `# pass 4`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/classAssigner/columns.js src/classAssigner/excel.js tests/unit/classAssigner.columns.test.js
git commit -m "feat: 添加表头映射与 Excel 读写"
```

---

### Task 4: 学生数据校验

**Files:**
- Create: `src/classAssigner/validation.js`
- Test: `tests/unit/classAssigner.validation.test.js`

**Interfaces:**
- Consumes: `columns.getCell`、`studentId` 的规范化函数、`constants.LEVEL_NAMES`。
- Produces:
  - `validateRows(dataRows, headerMap, headerRowIndex): { errors, warnings, rows }`
  - `parseClassCount(raw): { value, invalid, raw }`
  - 行结构：`{ rowNumber, inputIndex, name, idCard, studentNo, gender, levelName, levelCode, province, deptName, deptCode, majorName, majorCode, groupKey, classCountValue, classCountInvalid, classCountRaw, originalRow }`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/classAssigner.validation.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { mapHeaders } = require('../../src/classAssigner/columns');
const { validateRows } = require('../../src/classAssigner/validation');

const HEADERS = [
    '姓名', '身份证号码', '考生号', '性别', '层次', '层次代码',
    '省份', '院系名称', '院系代码', '专业名称', '专业代码', '班级数量'
];

function makeRow(overrides = {}) {
    return [
        overrides.name ?? '张三',
        overrides.idCard ?? '110101200001010011',
        overrides.studentNo ?? '26140902513865',
        overrides.gender ?? '男',
        overrides.levelName ?? '本科',
        overrides.levelCode ?? '1',
        overrides.province ?? '湖北',
        overrides.deptName ?? '机械工程系',
        overrides.deptCode ?? '01',
        overrides.majorName ?? '机械设计制造及其自动化',
        overrides.majorCode ?? '1',
        overrides.classCount ?? '2'
    ];
}

test('校验通过并生成规范行', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([makeRow()], headerMap, 0);
    assert.deepEqual(result.errors, []);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].groupKey, '1|01|1');
    assert.equal(result.rows[0].deptCode, '01');
    assert.equal(result.rows[0].classCountValue, 2);
    assert.equal(result.rows[0].rowNumber, 2);
});

test('必填、性别、代码错误', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([
        makeRow({ name: '' }),
        makeRow({ gender: '未知', studentNo: 'A2', idCard: 'ID2' }),
        makeRow({ levelCode: '4', studentNo: 'A3', idCard: 'ID3' }),
        makeRow({ deptCode: '100', studentNo: 'A4', idCard: 'ID4' }),
        makeRow({ majorCode: '10', studentNo: 'A5', idCard: 'ID5' })
    ], headerMap, 0);

    const codes = result.errors.map(error => error.code);
    assert.ok(codes.includes('REQUIRED_FIELD_MISSING'));
    assert.ok(codes.includes('INVALID_GENDER'));
    assert.ok(codes.includes('INVALID_LEVEL_CODE'));
    assert.ok(codes.includes('INVALID_DEPT_CODE'));
    assert.ok(codes.includes('INVALID_MAJOR_CODE'));
});

test('省份缺失给警告并按未填写省份分组', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([makeRow({ province: '' })], headerMap, 0);
    assert.equal(result.rows[0].province, '未填写省份');
    assert.ok(result.warnings.some(warning => warning.code === 'PROVINCE_MISSING'));
});

test('重复考生号和身份证号报错', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([
        makeRow({ studentNo: 'S1', idCard: 'I1' }),
        makeRow({ studentNo: 'S1', idCard: 'I1', name: '李四' })
    ], headerMap, 0);
    const codes = result.errors.map(error => error.code);
    assert.ok(codes.includes('DUPLICATE_STUDENT_NO'));
    assert.ok(codes.includes('DUPLICATE_ID_CARD'));
});

test('同组名称冲突报错', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([
        makeRow(),
        makeRow({ name: '李四', studentNo: 'S2', idCard: 'I2', majorName: '另一个专业' })
    ], headerMap, 0);
    assert.ok(result.errors.some(error => error.code === 'GROUP_NAME_CONFLICT'));
});

test('无效班级数量标记为 classCountInvalid', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([makeRow({ classCount: 'abc' })], headerMap, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows[0].classCountValue, null);
    assert.equal(result.rows[0].classCountInvalid, true);
});

test('空白行忽略', () => {
    const headerMap = mapHeaders(HEADERS);
    const result = validateRows([new Array(HEADERS.length).fill('')], headerMap, 0);
    assert.equal(result.errors.length, 0);
    assert.equal(result.rows.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/unit/classAssigner.validation.test.js
```

Expected: FAIL with `Cannot find module '../../src/classAssigner/validation'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/classAssigner/validation.js`:

```js
const { LEVEL_NAMES, KNOWN_DEPT_CODES } = require('./constants');
const { getCell } = require('./columns');
const {
    toInteger,
    normalizeDeptCode,
    normalizeLevelCode,
    normalizeMajorCode
} = require('./studentId');

function makeError(code, message, extra = {}) {
    return { code, message, ...extra };
}

function makeWarning(code, message, extra = {}) {
    return { code, message, ...extra };
}

function parseClassCount(raw) {
    const text = String(raw == null ? '' : raw).trim();
    if (!text) return { value: null, invalid: false, raw: text };
    const value = toInteger(text);
    if (value === null || value < 1 || value > 9) {
        return { value: null, invalid: true, raw: text };
    }
    return { value, invalid: false, raw: text };
}

function isBlankRow(raw) {
    return raw.name === '' && raw.idCard === '' && raw.studentNo === '' &&
        raw.gender === '' && raw.levelNameRaw === '' && String(raw.levelCodeRaw).trim() === '' &&
        raw.province === '' && raw.deptName === '' && String(raw.deptCodeRaw).trim() === '' &&
        raw.majorName === '' && String(raw.majorCodeRaw).trim() === '' &&
        String(raw.classCountRaw).trim() === '';
}

function validateRows(dataRows, headerMap, headerRowIndex) {
    const errors = [];
    const warnings = [];
    const rows = [];
    const studentNoMap = new Map();
    const idCardMap = new Map();

    dataRows.forEach((sourceRow, index) => {
        const rowNumber = headerRowIndex + index + 2;
        const raw = {
            name: String(getCell(sourceRow, headerMap, '姓名')).trim(),
            idCard: String(getCell(sourceRow, headerMap, '身份证号码')).trim(),
            studentNo: String(getCell(sourceRow, headerMap, '考生号')).trim(),
            gender: String(getCell(sourceRow, headerMap, '性别')).trim(),
            levelNameRaw: String(getCell(sourceRow, headerMap, '层次')).trim(),
            levelCodeRaw: getCell(sourceRow, headerMap, '层次代码'),
            province: String(getCell(sourceRow, headerMap, '省份')).trim(),
            deptName: String(getCell(sourceRow, headerMap, '院系名称')).trim(),
            deptCodeRaw: getCell(sourceRow, headerMap, '院系代码'),
            majorName: String(getCell(sourceRow, headerMap, '专业名称')).trim(),
            majorCodeRaw: getCell(sourceRow, headerMap, '专业代码'),
            classCountRaw: getCell(sourceRow, headerMap, '班级数量')
        };
        if (isBlankRow(raw)) return;

        let rowHasError = false;
        const addError = (code, message, field) => {
            errors.push(makeError(code, message, { rowNumber, field }));
            rowHasError = true;
        };

        if (!raw.name) addError('REQUIRED_FIELD_MISSING', '姓名不能为空', '姓名');
        if (!raw.gender) addError('REQUIRED_FIELD_MISSING', '性别不能为空', '性别');
        else if (!['男', '女'].includes(raw.gender)) {
            addError('INVALID_GENDER', `性别必须是男或女：${raw.gender}`, '性别');
        }
        if (!raw.deptName) addError('REQUIRED_FIELD_MISSING', '院系名称不能为空', '院系名称');
        if (!raw.majorName) addError('REQUIRED_FIELD_MISSING', '专业名称不能为空', '专业名称');

        const levelCode = normalizeLevelCode(raw.levelCodeRaw);
        if (!levelCode) addError('INVALID_LEVEL_CODE', `层次代码必须是 1/2/3：${raw.levelCodeRaw}`, '层次代码');
        const deptCode = normalizeDeptCode(raw.deptCodeRaw);
        if (!deptCode) addError('INVALID_DEPT_CODE', `院系代码必须是 1–99：${raw.deptCodeRaw}`, '院系代码');
        const majorCode = normalizeMajorCode(raw.majorCodeRaw);
        if (!majorCode) addError('INVALID_MAJOR_CODE', `专业代码必须是 1–9：${raw.majorCodeRaw}`, '专业代码');

        if (!raw.province) {
            warnings.push(makeWarning('PROVINCE_MISSING', '省份为空，按“未填写省份”参与均衡', { rowNumber }));
            raw.province = '未填写省份';
        }
        if (deptCode && !KNOWN_DEPT_CODES.has(deptCode)) {
            warnings.push(makeWarning('DEPT_CODE_UNKNOWN', `院系代码 ${deptCode} 不在 01–09 范围内，请确认`, { rowNumber }));
        }

        const levelName = raw.levelNameRaw || (levelCode ? LEVEL_NAMES[levelCode] : '');
        if (!raw.levelNameRaw && levelCode) {
            warnings.push(makeWarning('LEVEL_NAME_FALLBACK', '层次名缺失，已按层次代码显示', { rowNumber }));
        }

        const classCount = parseClassCount(raw.classCountRaw);
        if (rowHasError) return;

        const row = {
            rowNumber,
            inputIndex: rows.length,
            name: raw.name,
            idCard: raw.idCard,
            studentNo: raw.studentNo,
            gender: raw.gender,
            levelName,
            levelCode,
            province: raw.province,
            deptName: raw.deptName,
            deptCode,
            majorName: raw.majorName,
            majorCode,
            groupKey: `${levelCode}|${deptCode}|${majorCode}`,
            classCountValue: classCount.value,
            classCountInvalid: classCount.invalid,
            classCountRaw: classCount.raw,
            originalRow: Array.isArray(sourceRow) ? sourceRow.slice() : []
        };
        rows.push(row);

        if (row.studentNo) {
            if (!studentNoMap.has(row.studentNo)) studentNoMap.set(row.studentNo, []);
            studentNoMap.get(row.studentNo).push(rowNumber);
        }
        if (row.idCard) {
            if (!idCardMap.has(row.idCard)) idCardMap.set(row.idCard, []);
            idCardMap.get(row.idCard).push(rowNumber);
        }
    });

    for (const [value, rowNumbers] of studentNoMap) {
        if (rowNumbers.length > 1) {
            errors.push(makeError('DUPLICATE_STUDENT_NO', `考生号重复：${value}`, { value, rowNumbers }));
        }
    }
    for (const [value, rowNumbers] of idCardMap) {
        if (rowNumbers.length > 1) {
            errors.push(makeError('DUPLICATE_ID_CARD', `身份证号重复：${value}`, { value, rowNumbers }));
        }
    }

    const groupMap = new Map();
    for (const row of rows) {
        if (!groupMap.has(row.groupKey)) groupMap.set(row.groupKey, []);
        groupMap.get(row.groupKey).push(row);
    }
    for (const [groupKey, groupRows] of groupMap) {
        for (const field of ['levelName', 'deptName', 'majorName']) {
            const values = [...new Set(groupRows.map(row => row[field]))];
            if (values.length > 1) {
                errors.push(makeError(
                    'GROUP_NAME_CONFLICT',
                    `同一专业组的${field}不一致：${values.join('、')}`,
                    { groupKey, field, values }
                ));
            }
        }
    }

    return { errors, warnings, rows };
}

module.exports = { validateRows, parseClassCount };
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/unit/classAssigner.validation.test.js
```

Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/classAssigner/validation.js tests/unit/classAssigner.validation.test.js
git commit -m "feat: 添加学生数据校验"
```

---

### Task 5: 专业分组与班级数量来源

**Files:**
- Create: `src/classAssigner/groups.js`
- Test: `tests/unit/classAssigner.groups.test.js`

**Interfaces:**
- Consumes: `classPlan.autoClassCount`、`classPlan.getPlanOptions`。
- Produces:
  - `buildGroups(rows): Group[]`
  - `toGroupSummary(group): GroupSummary`
  - `Group = { key, levelCode, levelName, deptCode, deptName, majorCode, majorName, students, total, classCountSource, initialClassCount, initialPlan, options, warnings }`
  - `GroupSummary` 与 `Group` 相同但不含 `students`，增加 `studentCount`。

- [ ] **Step 1: Write the failing test**

Create `tests/unit/classAssigner.groups.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { buildGroups, toGroupSummary } = require('../../src/classAssigner/groups');

function makeRow(overrides = {}) {
    return {
        groupKey: '1|01|1',
        levelCode: '1',
        levelName: '本科',
        deptCode: '01',
        deptName: '机械工程系',
        majorCode: '1',
        majorName: '机械设计制造及其自动化',
        gender: '男',
        province: '湖北',
        classCountValue: null,
        classCountInvalid: false,
        inputIndex: 0,
        ...overrides
    };
}

function rowsWithCounts(total, classCountValue, overrides = {}) {
    return Array.from({ length: total }, (_, index) => makeRow({
        inputIndex: index,
        classCountValue,
        ...overrides
    }));
}

test('全部为空使用自动建议', () => {
    const groups = buildGroups(rowsWithCounts(72, null));
    assert.equal(groups.length, 1);
    assert.equal(groups[0].classCountSource, 'auto');
    assert.equal(groups[0].initialClassCount, 2);
    assert.deepEqual(groups[0].initialPlan.sizes, [36, 36]);
});

test('全部填写一致使用 Excel 值', () => {
    const groups = buildGroups(rowsWithCounts(82, 2));
    assert.equal(groups[0].classCountSource, 'excel');
    assert.equal(groups[0].initialClassCount, 2);
    assert.equal(groups[0].initialPlan.level, 'warn');
});

test('部分行填写标记为 excel-partial', () => {
    const rows = rowsWithCounts(72, 2);
    rows[0].classCountValue = null;
    const groups = buildGroups(rows);
    assert.equal(groups[0].classCountSource, 'excel-partial');
    assert.ok(groups[0].warnings.some(warning => warning.code === 'CLASS_COUNT_EXCEL_PARTIAL'));
});

test('多个不同值取众数并标记不一致', () => {
    const rows = [
        ...rowsWithCounts(10, 2),
        ...rowsWithCounts(5, 3).map(row => ({ ...row, inputIndex: row.inputIndex + 10 }))
    ];
    const groups = buildGroups(rows);
    assert.equal(groups[0].classCountSource, 'excel-inconsistent');
    assert.equal(groups[0].initialClassCount, 2);
    assert.ok(groups[0].warnings.some(warning => warning.code === 'CLASS_COUNT_EXCEL_INCONSISTENT'));
});

test('无效值改用自动建议并标记', () => {
    const rows = rowsWithCounts(72, null).map((row, index) => ({
        ...row,
        classCountInvalid: index === 0,
        classCountValue: null
    }));
    const groups = buildGroups(rows);
    assert.equal(groups[0].classCountSource, 'excel-invalid');
    assert.equal(groups[0].initialClassCount, 2);
    assert.ok(groups[0].warnings.some(warning => warning.code === 'CLASS_COUNT_EXCEL_INVALID'));
});

test('同专业不同层次拆成两个组', () => {
    const rows = [
        ...rowsWithCounts(50, null),
        ...rowsWithCounts(60, null).map((row, index) => ({
            ...row,
            groupKey: '2|01|1',
            levelCode: '2',
            levelName: '专科',
            inputIndex: 50 + index
        }))
    ];
    const groups = buildGroups(rows);
    assert.equal(groups.length, 2);
    assert.deepEqual(groups.map(group => group.key), ['1|01|1', '2|01|1']);
});

test('组摘要不包含学生明细', () => {
    const groups = buildGroups(rowsWithCounts(72, null));
    const summary = toGroupSummary(groups[0]);
    assert.equal(summary.studentCount, 72);
    assert.equal(summary.students, undefined);
    assert.ok(Array.isArray(summary.options));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/unit/classAssigner.groups.test.js
```

Expected: FAIL with `Cannot find module '../../src/classAssigner/groups'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/classAssigner/groups.js`:

```js
const { autoClassCount, getPlanOptions } = require('./classPlan');

function mode(values) {
    const counts = new Map();
    for (const value of values) {
        counts.set(value, (counts.get(value) || 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
}

function pushWarning(warnings, code, message) {
    warnings.push({ code, message });
}

function buildGroups(rows) {
    const map = new Map();
    for (const row of rows) {
        if (!map.has(row.groupKey)) map.set(row.groupKey, []);
        map.get(row.groupKey).push(row);
    }

    const groups = [];
    for (const [key, students] of map) {
        const first = students[0];
        const validValues = students
            .filter(student => student.classCountValue !== null)
            .map(student => student.classCountValue);
        const invalidCount = students.filter(student => student.classCountInvalid).length;
        const filledCount = validValues.length + invalidCount;
        const auto = autoClassCount(students.length);
        const warnings = [];
        let classCountSource;
        let initialClassCount;

        if (invalidCount > 0) {
            classCountSource = 'excel-invalid';
            initialClassCount = auto ? auto.classCount : 1;
            pushWarning(warnings, 'CLASS_COUNT_EXCEL_INVALID', 'Excel 班级数量存在无效值，已改用自动建议');
        } else if (validValues.length === 0) {
            classCountSource = 'auto';
            initialClassCount = auto ? auto.classCount : 1;
        } else {
            const distinct = [...new Set(validValues)];
            if (distinct.length > 1) {
                classCountSource = 'excel-inconsistent';
                initialClassCount = mode(validValues);
                pushWarning(
                    warnings,
                    'CLASS_COUNT_EXCEL_INCONSISTENT',
                    `Excel 班级数量不一致：${distinct.join('、')}`
                );
            } else {
                initialClassCount = distinct[0];
                if (filledCount < students.length) {
                    classCountSource = 'excel-partial';
                    pushWarning(warnings, 'CLASS_COUNT_EXCEL_PARTIAL', '部分行未填写班级数量，已按专业统一');
                } else {
                    classCountSource = 'excel';
                }
            }
        }

        const options = getPlanOptions(students.length);
        const initialPlan = options.find(option => option.classCount === initialClassCount) || null;
        if (!initialPlan) {
            pushWarning(warnings, 'NO_VALID_CLASS_PLAN', '该专业没有可用的班级方案');
        } else if (initialPlan.level === 'danger') {
            pushWarning(warnings, 'CLASS_SIZE_DANGER', `班级人数需要重点确认：${initialPlan.sizes.join(' / ')}`);
        } else if (initialPlan.level === 'warn') {
            pushWarning(warnings, 'CLASS_SIZE_WARN', `班级人数接近边界：${initialPlan.sizes.join(' / ')}`);
        } else if (initialPlan.level === 'invalid') {
            pushWarning(warnings, 'CLASS_SIZE_OVERFLOW', '班级人数超过 99，无法生成学号');
        }

        groups.push({
            key,
            levelCode: first.levelCode,
            levelName: first.levelName,
            deptCode: first.deptCode,
            deptName: first.deptName,
            majorCode: first.majorCode,
            majorName: first.majorName,
            students,
            total: students.length,
            classCountSource,
            initialClassCount,
            initialPlan,
            options,
            warnings
        });
    }

    groups.sort((a, b) => {
        const levelDiff = Number(a.levelCode) - Number(b.levelCode);
        if (levelDiff !== 0) return levelDiff;
        const deptDiff = Number(a.deptCode) - Number(b.deptCode);
        if (deptDiff !== 0) return deptDiff;
        return Number(a.majorCode) - Number(b.majorCode);
    });

    return groups;
}

function toGroupSummary(group) {
    return {
        key: group.key,
        levelCode: group.levelCode,
        levelName: group.levelName,
        deptCode: group.deptCode,
        deptName: group.deptName,
        majorCode: group.majorCode,
        majorName: group.majorName,
        studentCount: group.total,
        classCountSource: group.classCountSource,
        initialClassCount: group.initialClassCount,
        initialPlan: group.initialPlan,
        options: group.options,
        warnings: group.warnings
    };
}

module.exports = { buildGroups, toGroupSummary, mode };
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/unit/classAssigner.groups.test.js
```

Expected: `# pass 7`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/classAssigner/groups.js tests/unit/classAssigner.groups.test.js
git commit -m "feat: 添加专业分组与班级数量来源"
```

---

### Task 6: 男女配额与省份均衡分班

**Files:**
- Create: `src/classAssigner/assign.js`
- Test: `tests/unit/classAssigner.assign.test.js`

**Interfaces:**
- Produces:
  - `allocateMaleQuotas(total, maleCount, sizes): number[]`
  - `assignGroup(students, plan): students`（原地写入 `classNo`、`seq`，返回按班级/性别/省份/输入顺序排序的数组）
  - `plan = { classCount, sizes, valid, level, reasons }`

- [ ] **Step 1: Write the failing test**

Create `tests/unit/classAssigner.assign.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');

const { allocateMaleQuotas, assignGroup } = require('../../src/classAssigner/assign');

function makeStudents(total, maleCount, provinces = ['湖北', '河南', '山东']) {
    return Array.from({ length: total }, (_, index) => ({
        name: `学生${index + 1}`,
        gender: index < maleCount ? '男' : '女',
        province: provinces[index % provinces.length],
        inputIndex: index,
        groupKey: '1|01|1',
        levelCode: '1',
        deptCode: '01',
        majorCode: '1'
    }));
}

function plan(sizes) {
    return {
        classCount: sizes.length,
        sizes,
        valid: true,
        level: 'ok',
        reasons: []
    };
}

test('男生配额按班级人数比例分配', () => {
    assert.deepEqual(allocateMaleQuotas(72, 60, [36, 36]), [30, 30]);
    assert.deepEqual(allocateMaleQuotas(120, 118, [40, 40, 40]), [40, 39, 39]);
});

test('72 人 60 男 12 女分 2 班', () => {
    const students = makeStudents(72, 60);
    const assigned = assignGroup(students, plan([36, 36]));
    const class1 = assigned.filter(student => student.classNo === 1);
    const class2 = assigned.filter(student => student.classNo === 2);

    assert.equal(class1.length, 36);
    assert.equal(class2.length, 36);
    assert.equal(class1.filter(student => student.gender === '男').length, 30);
    assert.equal(class2.filter(student => student.gender === '男').length, 30);
    assert.equal(class1.filter(student => student.gender === '女').length, 6);
    assert.equal(class2.filter(student => student.gender === '女').length, 6);
    assert.deepEqual(class1.map(student => student.seq), Array.from({ length: 36 }, (_, i) => i + 1));
});

test('每班男生在女生前', () => {
    const assigned = assignGroup(makeStudents(72, 60), plan([36, 36]));
    for (const classNo of [1, 2]) {
        const genders = assigned
            .filter(student => student.classNo === classNo)
            .map(student => student.gender);
        const firstFemale = genders.indexOf('女');
        assert.notEqual(firstFemale, -1);
        assert.ok(genders.slice(firstFemale).every(gender => gender === '女'));
    }
});

test('120 人 118 男 2 女分 3 班：两名女生分到不同班', () => {
    const assigned = assignGroup(makeStudents(120, 118), plan([40, 40, 40]));
    const femaleClasses = assigned
        .filter(student => student.gender === '女')
        .map(student => student.classNo)
        .sort();
    assert.deepEqual(femaleClasses, [2, 3]);
});

test('某省 5 人分 3 班为 2/2/1', () => {
    const students = makeStudents(5, 5, ['湖北']);
    const assigned = assignGroup(students, plan([2, 2, 1]));
    const counts = [1, 2, 3].map(classNo =>
        assigned.filter(student => student.classNo === classNo).length
    );
    assert.deepEqual(counts, [2, 2, 1]);
});

test('所有学生都分配且班级人数正确', () => {
    const assigned = assignGroup(makeStudents(82, 54), plan([41, 41]));
    assert.equal(assigned.length, 82);
    assert.equal(new Set(assigned.map(student => student.name)).size, 82);
    assert.equal(assigned.filter(student => student.classNo === 1).length, 41);
    assert.equal(assigned.filter(student => student.classNo === 2).length, 41);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/unit/classAssigner.assign.test.js
```

Expected: FAIL with `Cannot find module '../../src/classAssigner/assign'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/classAssigner/assign.js`:

```js
function allocateMaleQuotas(total, maleCount, sizes) {
    const quotas = sizes.map(size => Math.floor((maleCount * size) / total));
    let remainder = maleCount - quotas.reduce((sum, quota) => sum + quota, 0);
    const order = sizes
        .map((size, index) => ({
            index,
            fraction: (maleCount * size) / total - quotas[index],
            size
        }))
        .sort((a, b) => b.fraction - a.fraction || b.size - a.size || a.index - b.index);

    for (let i = 0; i < remainder; i += 1) {
        quotas[order[i].index] += 1;
    }
    return quotas;
}

function provinceRank(province, provinceOrder) {
    if (province === '未填写省份') return Number.MAX_SAFE_INTEGER;
    return provinceOrder.get(province) ?? Number.MAX_SAFE_INTEGER;
}

function assignGroup(students, plan) {
    if (!plan || !plan.valid || !Array.isArray(plan.sizes) || plan.sizes.length !== plan.classCount) {
        throw new Error('班级方案无效');
    }
    const total = students.length;
    if (plan.sizes.reduce((sum, size) => sum + size, 0) !== total) {
        throw new Error('班级人数之和与专业人数不一致');
    }

    const males = students.filter(student => student.gender === '男');
    const females = students.filter(student => student.gender === '女');
    if (males.length + females.length !== total) {
        throw new Error('存在未识别性别的学生');
    }

    const maleQuotas = allocateMaleQuotas(total, males.length, plan.sizes);
    const femaleQuotas = plan.sizes.map((size, index) => size - maleQuotas[index]);
    const remaining = {
        '男': maleQuotas.slice(),
        '女': femaleQuotas.slice()
    };

    const provinceOrder = new Map();
    for (const student of students) {
        if (!provinceOrder.has(student.province)) {
            provinceOrder.set(student.province, provinceOrder.size);
        }
    }
    const provinceCounts = plan.sizes.map(() => new Map());

    for (const gender of ['男', '女']) {
        const byProvince = new Map();
        for (const student of students) {
            if (student.gender !== gender) continue;
            if (!byProvince.has(student.province)) byProvince.set(student.province, []);
            byProvince.get(student.province).push(student);
        }

        const provinceGroups = [...byProvince.entries()]
            .map(([province, list]) => ({
                province,
                students: list,
                firstIndex: list[0].inputIndex
            }))
            .sort((a, b) => b.students.length - a.students.length || a.firstIndex - b.firstIndex);

        for (const group of provinceGroups) {
            for (const student of group.students) {
                let best = -1;
                for (let classIndex = 0; classIndex < plan.sizes.length; classIndex += 1) {
                    if (remaining[gender][classIndex] <= 0) continue;
                    if (best === -1) {
                        best = classIndex;
                        continue;
                    }
                    const currentProvinceCount = provinceCounts[classIndex].get(group.province) || 0;
                    const bestProvinceCount = provinceCounts[best].get(group.province) || 0;
                    if (currentProvinceCount < bestProvinceCount) {
                        best = classIndex;
                    } else if (
                        currentProvinceCount === bestProvinceCount &&
                        remaining[gender][classIndex] > remaining[gender][best]
                    ) {
                        best = classIndex;
                    }
                }
                if (best === -1) {
                    throw new Error(`无法为学生 ${student.name} 分配班级`);
                }
                student.classNo = best + 1;
                remaining[gender][best] -= 1;
                provinceCounts[best].set(
                    group.province,
                    (provinceCounts[best].get(group.province) || 0) + 1
                );
            }
        }
    }

    for (let classIndex = 0; classIndex < plan.sizes.length; classIndex += 1) {
        const classNo = classIndex + 1;
        const members = students.filter(student => student.classNo === classNo);
        if (members.length !== plan.sizes[classIndex]) {
            throw new Error(`第 ${classNo} 班人数与方案不一致`);
        }
        const maleCount = members.filter(student => student.gender === '男').length;
        if (maleCount !== maleQuotas[classIndex]) {
            throw new Error(`第 ${classNo} 班男生配额不一致`);
        }
    }

    const genderRank = { '男': 0, '女': 1 };
    students.sort((a, b) => (
        a.classNo - b.classNo ||
        genderRank[a.gender] - genderRank[b.gender] ||
        provinceRank(a.province, provinceOrder) - provinceRank(b.province, provinceOrder) ||
        a.inputIndex - b.inputIndex
    ));

    const sequenceByClass = new Map();
    for (const student of students) {
        const sequence = (sequenceByClass.get(student.classNo) || 0) + 1;
        student.seq = sequence;
        sequenceByClass.set(student.classNo, sequence);
    }

    return students;
}

module.exports = { allocateMaleQuotas, assignGroup };
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/unit/classAssigner.assign.test.js
```

Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/classAssigner/assign.js tests/unit/classAssigner.assign.test.js
git commit -m "feat: 添加男女配额与省份均衡分班"
```

---

### Task 7: 分析与生成入口

**Files:**
- Create: `src/classAssigner/index.js`
- Test: `tests/integration/classAssigner.test.js`

**Interfaces:**
- Consumes: all previous modules.
- Produces:
  - `analyzeWorkbook(filePath): { ok: true, data: { filePath, sheetName, fingerprint, defaultYear, groups, summary, existingTargetColumns }, warnings } | { ok: false, error: { code, message, details? }, warnings }`
  - `generateWorkbook({ filePath, fingerprint, classCounts, year }): { ok: true, data: { outputPath, summary }, warnings } | { ok: false, error }`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/classAssigner.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs-extra');
const xlsx = require('xlsx');

const { analyzeWorkbook, generateWorkbook } = require('../../src/classAssigner');
const { makeTempDir, removeTempDir } = require('../helpers/tmp');
const { writeClassAssignWorkbook } = require('../helpers/fixtures');

function makeRows({ prefix, total, maleCount, majorCode, majorName, classCount = '', offset = 0 }) {
    const provinces = ['湖北', '河南', '山东', '江西', '湖南'];
    return Array.from({ length: total }, (_, index) => ({
        '姓名': `${prefix}${String(index + 1).padStart(3, '0')}`,
        '身份证号码': `11010120000101${String(offset + index + 1).padStart(4, '0')}`,
        '考生号': `${prefix}${String(index + 1).padStart(6, '0')}`,
        '性别': index < maleCount ? '男' : '女',
        '层次': '本科',
        '层次代码': '1',
        '省份': provinces[index % provinces.length],
        '院系名称': '机械工程系',
        '院系代码': '01',
        '专业名称': majorName,
        '专业代码': majorCode,
        '班级数量': classCount
    }));
}

function readOutput(filePath) {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    return xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
}

test('分析并生成分班学号 Excel', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'students.xlsx');

    writeClassAssignWorkbook(inputPath, [
        ...makeRows({ prefix: 'A', total: 50, maleCount: 30, majorCode: '1', majorName: '专业A', offset: 0 }),
        ...makeRows({ prefix: 'B', total: 82, maleCount: 54, majorCode: '2', majorName: '专业B', classCount: '2', offset: 50 }),
        ...makeRows({ prefix: 'C', total: 72, maleCount: 60, majorCode: '3', majorName: '专业C', offset: 132 })
    ]);

    const analysis = analyzeWorkbook(inputPath);
    assert.equal(analysis.ok, true);
    assert.equal(analysis.data.groups.length, 3);
    assert.equal(analysis.data.defaultYear, new Date().getFullYear());
    assert.equal(analysis.data.groups[0].initialClassCount, 2);
    assert.equal(analysis.data.groups[1].initialClassCount, 2);
    assert.equal(analysis.data.groups[2].initialClassCount, 2);

    const classCounts = Object.fromEntries(
        analysis.data.groups.map(group => [group.key, group.initialClassCount])
    );
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: analysis.data.fingerprint,
        classCounts,
        year: 2027
    });
    assert.equal(result.ok, true);
    assert.equal(await fs.pathExists(result.data.outputPath), true);

    const rows = readOutput(result.data.outputPath);
    const header = rows[0];
    assert.ok(header.includes('班级名称'));
    assert.ok(header.includes('班号'));
    assert.ok(header.includes('班级数量'));
    assert.ok(header.includes('学号'));

    const dataRows = rows.slice(1);
    assert.equal(dataRows.length, 204);

    const classIndex = header.indexOf('班级名称');
    const countIndex = header.indexOf('班级数量');
    const idIndex = header.indexOf('学号');
    const majorIndex = header.indexOf('专业代码');

    const byMajor = { '1': [], '2': [], '3': [] };
    for (const row of dataRows) {
        byMajor[row[majorIndex]].push(row);
        assert.match(row[idIndex], /^2027\d{7}$/);
        assert.equal(row[idIndex].slice(7, 8), row[majorIndex]);
    }

    assert.deepEqual(
        [1, 2].map(classNo => byMajor['1'].filter(row => row[classIndex] === `${classNo}班`).length),
        [25, 25]
    );
    assert.deepEqual(
        [1, 2].map(classNo => byMajor['2'].filter(row => row[classIndex] === `${classNo}班`).length),
        [41, 41]
    );
    assert.deepEqual(
        [1, 2].map(classNo => byMajor['3'].filter(row => row[classIndex] === `${classNo}班`).length),
        [36, 36]
    );
    assert.ok(byMajor['1'].every(row => Number(row[countIndex]) === 2));

    const aNames = new Set(byMajor['1'].map(row => row[header.indexOf('姓名')]));
    assert.ok([...aNames].every(name => name.startsWith('A')));
});

test('文件指纹变化拒绝生成', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'students.xlsx');
    writeClassAssignWorkbook(inputPath, makeRows({
        prefix: 'D', total: 50, maleCount: 30, majorCode: '1', majorName: '专业D'
    }));

    analyzeWorkbook(inputPath);
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: '0:0',
        classCounts: { '1|01|1': 2 },
        year: 2027
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'FILE_CHANGED');
});

test('非法年份拒绝生成', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'students.xlsx');
    writeClassAssignWorkbook(inputPath, makeRows({
        prefix: 'E', total: 50, maleCount: 30, majorCode: '1', majorName: '专业E'
    }));
    const analysis = analyzeWorkbook(inputPath);
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: analysis.data.fingerprint,
        classCounts: { '1|01|1': 2 },
        year: '26'
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'INVALID_YEAR');
});

test('缺列和重复表头直接报错', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));

    const missingPath = path.join(dir, 'missing.xlsx');
    const missingWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(missingWorkbook, xlsx.utils.aoa_to_sheet([
        ['姓名', '性别', '层次代码', '院系名称', '院系代码', '专业名称'],
        ['张三', '男', '1', '机械工程系', '01', '专业A']
    ]), 'Sheet1');
    xlsx.writeFile(missingWorkbook, missingPath);
    const missing = analyzeWorkbook(missingPath);
    assert.equal(missing.ok, false);
    assert.equal(missing.error.code, 'HEADER_MISSING');

    const duplicatePath = path.join(dir, 'duplicate.xlsx');
    const duplicateWorkbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(duplicateWorkbook, xlsx.utils.aoa_to_sheet([
        ['姓名', '姓名', '性别', '层次代码', '院系名称', '院系代码', '专业名称', '专业代码'],
        ['张三', '张三', '男', '1', '机械工程系', '01', '专业A', '1']
    ]), 'Sheet1');
    xlsx.writeFile(duplicateWorkbook, duplicatePath);
    const duplicate = analyzeWorkbook(duplicatePath);
    assert.equal(duplicate.ok, false);
    assert.equal(duplicate.error.code, 'HEADER_DUPLICATE');
});

test('无可用班级方案报错', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'too-many.xlsx');
    writeClassAssignWorkbook(inputPath, makeRows({
        prefix: 'F', total: 892, maleCount: 500, majorCode: '1', majorName: '专业F'
    }));

    const result = analyzeWorkbook(inputPath);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'NO_VALID_CLASS_PLAN');
});

test('无效班级数阻止生成', async (t) => {
    const dir = await makeTempDir();
    t.after(() => removeTempDir(dir));
    const inputPath = path.join(dir, 'invalid-count.xlsx');
    writeClassAssignWorkbook(inputPath, makeRows({
        prefix: 'G', total: 50, maleCount: 30, majorCode: '1', majorName: '专业G'
    }));
    const analysis = analyzeWorkbook(inputPath);
    const result = generateWorkbook({
        filePath: inputPath,
        fingerprint: analysis.data.fingerprint,
        classCounts: { '1|01|1': 0 },
        year: 2027
    });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, 'CLASS_COUNT_INVALID');
});
```

Add `writeClassAssignWorkbook` to `tests/helpers/fixtures.js` before running:

```js
const CLASS_ASSIGN_COLUMNS = [
    '姓名', '身份证号码', '考生号', '性别', '层次', '层次代码',
    '省份', '院系名称', '院系代码', '专业名称', '专业代码', '班级数量'
];

function writeClassAssignWorkbook(filePath, rows) {
    const worksheet = xlsx.utils.json_to_sheet(rows, { header: CLASS_ASSIGN_COLUMNS });
    const workbook = xlsx.utils.book_new();
    xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
    xlsx.writeFile(workbook, filePath);
}
```

Export it:

```js
module.exports = {
    STUDENT_COLUMNS,
    CLASS_ASSIGN_COLUMNS,
    defaultStudentRows,
    writeStudentWorkbook,
    writeClassAssignWorkbook
};
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/integration/classAssigner.test.js
```

Expected: FAIL with `Cannot find module '../../src/classAssigner'`.

- [ ] **Step 3: Write minimal implementation**

Create `src/classAssigner/index.js`:

```js
const { mapHeaders, buildOutputLayout } = require('./columns');
const { readWorkbook, writeWorkbook, buildOutputPath } = require('./excel');
const { validateRows } = require('./validation');
const { buildGroups, toGroupSummary } = require('./groups');
const { assignGroup } = require('./assign');
const { formatStudentId, validateYear, toInteger } = require('./studentId');
const { TARGET_COLUMNS } = require('./constants');

function fail(code, message, details, warnings = []) {
    return { ok: false, error: { code, message, details }, warnings };
}

function analyzeWorkbook(filePath) {
    const book = readWorkbook(filePath);
    const headerMap = mapHeaders(book.headerRow);
    if (headerMap.duplicates.length > 0) {
        return fail('HEADER_DUPLICATE', `表头重复：${headerMap.duplicates.join('、')}`);
    }
    if (headerMap.missing.length > 0) {
        return fail('HEADER_MISSING', `缺少必需列：${headerMap.missing.join('、')}`);
    }

    const validation = validateRows(book.dataRows, headerMap, book.headerRowIndex);
    if (validation.errors.length > 0) {
        const first = validation.errors[0];
        return fail(first.code, first.message, validation.errors, validation.warnings);
    }
    if (validation.rows.length === 0) {
        return fail('SHEET_EMPTY', '没有可处理的学生数据', undefined, validation.warnings);
    }

    const groups = buildGroups(validation.rows);
    const noValid = groups.filter(group => !group.options.some(option => option.valid));
    if (noValid.length > 0) {
        return fail(
            'NO_VALID_CLASS_PLAN',
            `以下专业没有可用的班级方案：${noValid.map(group => group.majorName).join('、')}`,
            noValid.map(group => group.key),
            validation.warnings
        );
    }

    const warnings = [...validation.warnings, ...groups.flatMap(group => group.warnings)];
    const sourceCounts = {
        excel: 0,
        'excel-partial': 0,
        'excel-inconsistent': 0,
        'excel-invalid': 0,
        auto: 0
    };
    for (const group of groups) sourceCounts[group.classCountSource] += 1;

    return {
        ok: true,
        data: {
            filePath,
            sheetName: book.sheetName,
            fingerprint: book.fingerprint,
            defaultYear: new Date().getFullYear(),
            groups: groups.map(toGroupSummary),
            summary: {
                totalStudents: validation.rows.length,
                groupCount: groups.length,
                deptCount: new Set(groups.map(group => group.deptCode)).size,
                sourceCounts,
                warningCount: warnings.length,
                dangerCount: groups.filter(group => group.initialPlan && group.initialPlan.level === 'danger').length
            },
            existingTargetColumns: TARGET_COLUMNS.filter(name => headerMap.index[name] !== undefined)
        },
        warnings
    };
}

function generateWorkbook({ filePath, fingerprint, classCounts, year }) {
    if (!fingerprint) {
        return fail('FILE_CHANGED', '缺少文件指纹，请重新解析');
    }
    const book = readWorkbook(filePath);
    if (book.fingerprint !== fingerprint) {
        return fail('FILE_CHANGED', '文件在确认期间发生变化，请重新解析');
    }

    const yearText = validateYear(year);
    if (!yearText) return fail('INVALID_YEAR', '入学年份必须是 4 位数字');

    const headerMap = mapHeaders(book.headerRow);
    if (headerMap.duplicates.length > 0) {
        return fail('HEADER_DUPLICATE', `表头重复：${headerMap.duplicates.join('、')}`);
    }
    if (headerMap.missing.length > 0) {
        return fail('HEADER_MISSING', `缺少必需列：${headerMap.missing.join('、')}`);
    }

    const validation = validateRows(book.dataRows, headerMap, book.headerRowIndex);
    if (validation.errors.length > 0) {
        const first = validation.errors[0];
        return fail(first.code, first.message, validation.errors, validation.warnings);
    }
    if (validation.rows.length === 0) {
        return fail('SHEET_EMPTY', '没有可处理的学生数据', undefined, validation.warnings);
    }

    const groups = buildGroups(validation.rows);
    const overrides = classCounts && typeof classCounts === 'object' && !Array.isArray(classCounts)
        ? classCounts
        : {};

    for (const group of groups) {
        const raw = Object.prototype.hasOwnProperty.call(overrides, group.key)
            ? overrides[group.key]
            : group.initialClassCount;
        const requested = toInteger(raw);
        const option = requested === null
            ? null
            : group.options.find(candidate => candidate.classCount === requested);
        if (!option || !option.valid) {
            const reason = option ? option.reasons.join('；') : '班级数必须是 1–9 的整数';
            return fail('CLASS_COUNT_INVALID', `${group.majorName} 的班级数无效：${reason}`);
        }
        group.finalClassCount = requested;
        group.finalPlan = option;
    }

    const outputItems = [];
    const usedIds = new Set();
    for (const group of groups) {
        const assigned = assignGroup(group.students.slice(), group.finalPlan);
        for (const student of assigned) {
            if (
                student.groupKey !== group.key ||
                student.levelCode !== group.levelCode ||
                student.deptCode !== group.deptCode ||
                student.majorCode !== group.majorCode
            ) {
                return fail('GROUP_KEY_CHANGED', '学生专业归属在分班过程中发生变化');
            }
            const studentId = formatStudentId({
                year: yearText,
                levelCode: group.levelCode,
                deptCode: group.deptCode,
                majorCode: group.majorCode,
                classNo: student.classNo,
                seq: student.seq
            });
            if (usedIds.has(studentId)) {
                return fail('STUDENT_ID_DUPLICATE', `学号重复：${studentId}`);
            }
            usedIds.add(studentId);
            outputItems.push({ student, group, studentId });
        }
    }

    const addNumber = headerMap.index['编号'] === undefined;
    const layout = buildOutputLayout(headerMap, { addNumber });
    const outputRows = outputItems.map(({ student, group, studentId }) => {
        const row = student.originalRow.slice();
        while (row.length < layout.headers.length) row.push('');
        row[layout.index['班级名称']] = `${student.classNo}班`;
        row[layout.index['班号']] = student.classNo;
        row[layout.index['班级数量']] = group.finalClassCount;
        row[layout.index['学号']] = studentId;
        if (addNumber) row[layout.index['编号']] = student.inputIndex + 1;
        return row;
    });

    const outputPath = buildOutputPath(filePath);
    try {
        writeWorkbook(outputPath, book.sheetName, layout.headers, outputRows);
    } catch (error) {
        return fail('OUTPUT_WRITE_FAILED', `写入输出文件失败：${error.message}`);
    }

    const warnings = [...validation.warnings, ...groups.flatMap(group => group.warnings)];
    return {
        ok: true,
        data: {
            outputPath,
            summary: {
                totalStudents: outputRows.length,
                groupCount: groups.length,
                classCount: groups.reduce((sum, group) => sum + group.finalClassCount, 0),
                warningCount: warnings.length
            }
        },
        warnings
    };
}

module.exports = { analyzeWorkbook, generateWorkbook };
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/integration/classAssigner.test.js
```

Expected: `# pass 6`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/classAssigner/index.js tests/integration/classAssigner.test.js tests/helpers/fixtures.js
git commit -m "feat: 添加分班分析生成入口与集成测试"
```

---

### Task 8: 仅表头模板资产

**Files:**
- Create: `scripts/generate-class-template.js`
- Create: `assets/学生分班模板.xlsx`（运行脚本生成）
- Test: `tests/integration/classAssigner.template.test.js`

**Interfaces:**
- Produces: 模板文件表头固定为 `姓名、身份证号码、考生号、性别、层次、层次代码、省份、院系名称、院系代码、专业名称、专业代码、班级数量`，只有表头行。

- [ ] **Step 1: Write the failing test**

Create `tests/integration/classAssigner.template.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const xlsx = require('xlsx');

const { CLASS_ASSIGN_COLUMNS } = require('../helpers/fixtures');

test('分班模板只有表头，没有数据行', () => {
    const templatePath = path.resolve(__dirname, '..', '..', 'assets', '学生分班模板.xlsx');
    const workbook = xlsx.readFile(templatePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false });
    assert.deepEqual(rows, [CLASS_ASSIGN_COLUMNS]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test tests/integration/classAssigner.template.test.js
```

Expected: FAIL with `ENOENT` for the template path.

- [ ] **Step 3: Write the generator and run it**

Create `scripts/generate-class-template.js`:

```js
const path = require('path');
const xlsx = require('xlsx');

const headers = [
    '姓名', '身份证号码', '考生号', '性别', '层次', '层次代码',
    '省份', '院系名称', '院系代码', '专业名称', '专业代码', '班级数量'
];

const worksheet = xlsx.utils.aoa_to_sheet([headers]);
worksheet['!cols'] = headers.map(header => ({ wch: Math.max(12, header.length * 2) }));
const workbook = xlsx.utils.book_new();
xlsx.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
xlsx.writeFile(workbook, path.resolve(__dirname, '..', 'assets', '学生分班模板.xlsx'), { bookType: 'xlsx' });
console.log('生成 assets/学生分班模板.xlsx');
```

Run:

```bash
node scripts/generate-class-template.js
```

Expected: `生成 assets/学生分班模板.xlsx`，并创建 `assets/学生分班模板.xlsx`。

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test tests/integration/classAssigner.template.test.js
```

Expected: `# pass 1`, `# fail 0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-class-template.js assets/学生分班模板.xlsx tests/integration/classAssigner.template.test.js
git commit -m "feat: 添加仅表头的分班模板"
```

---

### Task 9: 主进程 IPC 与 preload 白名单

**Files:**
- Create: `src/main/ipc/classAssignIpc.js`
- Modify: `src/preload.js`（`INVOKE_CHANNELS`）
- Modify: `main.js`（require + register）
- Test: `node --check` + `npm test`

**Interfaces:**
- Channels:
  - `select-class-assign-excel`（invoke）
  - `analyze-class-assign-excel`（invoke，`{ filePath }`）
  - `generate-class-assign`（invoke，`{ filePath, fingerprint, classCounts, year }`）
  - `download-class-assign-template`（invoke）
- `registerClassAssignIpc(): void`

- [ ] **Step 1: Write the failing check**

Run:

```bash
node --check src/main/ipc/classAssignIpc.js
```

Expected: FAIL with `Cannot find module` / `ENOENT` for the new file.

- [ ] **Step 2: Write minimal implementation**

Create `src/main/ipc/classAssignIpc.js`:

```js
const path = require('path');
const fs = require('fs-extra');
const { ipcMain, dialog } = require('electron');
const { getMainWindow } = require('../window');
const { assetPath } = require('../paths');
const { analyzeWorkbook, generateWorkbook } = require('../../classAssigner');

function assertExcelPath(filePath) {
    const resolved = path.resolve(String(filePath || ''));
    if (!fs.existsSync(resolved)) {
        const error = new Error('文件不存在，请重新选择');
        error.code = 'FILE_NOT_FOUND';
        throw error;
    }
    const realPath = fs.realpathSync(resolved);
    const stat = fs.statSync(realPath);
    if (!stat.isFile()) {
        const error = new Error('所选路径不是文件');
        error.code = 'FILE_TYPE_INVALID';
        throw error;
    }
    const extension = path.extname(realPath).toLowerCase();
    if (!['.xls', '.xlsx'].includes(extension)) {
        const error = new Error('只支持 .xls 和 .xlsx 文件');
        error.code = 'FILE_TYPE_INVALID';
        throw error;
    }
    return realPath;
}

function toErrorPayload(error) {
    return {
        code: error && error.code ? error.code : 'UNEXPECTED_ERROR',
        message: error && error.message ? error.message : String(error),
        details: error && error.details
    };
}

function registerClassAssignIpc() {
    ipcMain.handle('select-class-assign-excel', async () => {
        const result = await dialog.showOpenDialog(getMainWindow(), {
            properties: ['openFile'],
            filters: [{ name: 'Excel Files', extensions: ['xlsx', 'xls'] }]
        });
        return result.canceled ? null : result.filePaths[0];
    });

    ipcMain.handle('analyze-class-assign-excel', async (event, options) => {
        try {
            const filePath = assertExcelPath(options && options.filePath);
            return analyzeWorkbook(filePath);
        } catch (error) {
            return { ok: false, error: toErrorPayload(error), warnings: [] };
        }
    });

    ipcMain.handle('generate-class-assign', async (event, options) => {
        try {
            const filePath = assertExcelPath(options && options.filePath);
            return generateWorkbook({
                filePath,
                fingerprint: options && options.fingerprint,
                classCounts: options && options.classCounts,
                year: options && options.year
            });
        } catch (error) {
            return { ok: false, error: toErrorPayload(error), warnings: [] };
        }
    });

    ipcMain.handle('download-class-assign-template', async () => {
        try {
            const templatePath = assetPath('学生分班模板.xlsx');
            if (!fs.existsSync(templatePath)) {
                return {
                    success: false,
                    code: 'TEMPLATE_NOT_FOUND',
                    message: '未找到分班模板，请重新安装或更新应用。'
                };
            }
            const result = await dialog.showSaveDialog(getMainWindow(), {
                title: '保存分班模板',
                defaultPath: '学生分班模板.xlsx',
                filters: [{ name: 'Excel Files', extensions: ['xlsx'] }]
            });
            if (result.canceled || !result.filePath) {
                return { success: false, code: 'CANCELED', message: '已取消' };
            }
            await fs.copyFile(templatePath, result.filePath);
            return { success: true, path: result.filePath };
        } catch (error) {
            return {
                success: false,
                code: 'TEMPLATE_COPY_FAILED',
                message: error.message
            };
        }
    });
}

module.exports = { registerClassAssignIpc, assertExcelPath };
```

Modify `src/preload.js` `INVOKE_CHANNELS` to include:

```js
    'select-class-assign-excel',
    'analyze-class-assign-excel',
    'generate-class-assign',
    'download-class-assign-template',
```

The full set becomes:

```js
const INVOKE_CHANNELS = new Set([
    'select-file',
    'select-pdf-dir',
    'get-excel-columns',
    'detect-exam-schedule',
    'open-file',
    'select-class-assign-excel',
    'analyze-class-assign-excel',
    'generate-class-assign',
    'download-class-assign-template'
]);
```

Modify `main.js`:

```js
const { registerClassAssignIpc } = require('./src/main/ipc/classAssignIpc');
```

Add the registration next to the other `register...` calls:

```js
registerTicketAuditIpc();
registerClassAssignIpc();
```

- [ ] **Step 3: Run syntax checks and existing tests**

Run:

```bash
node --check src/main/ipc/classAssignIpc.js
node --check main.js
node --check src/preload.js
npm test
```

Expected: syntax checks pass; existing tests pass with `# fail 0`.

- [ ] **Step 4: Commit**

```bash
git add src/main/ipc/classAssignIpc.js src/preload.js main.js
git commit -m "feat: 接入分班编学号 IPC"
```

---

### Task 10: 页面标记、样式与 core 接线

**Files:**
- Modify: `index.html`
- Modify: `src/renderer/js/core.js`
- Create: `src/renderer/css/class-assign.css`
- Test: `npm run test:smoke`（在 Task 11 更新断言后通过）

**Interfaces:**
- Consumes: none.
- Produces DOM ids:
  - `class-assign-page`
  - `class-assign-excel-path`
  - `class-assign-file-status`
  - `class-assign-plan-card`
  - `class-assign-summary`
  - `class-assign-year`
  - `class-assign-warning-banner`
  - `class-assign-only-warnings`
  - `class-assign-plan-body`
  - `class-assign-form-error`
  - `class-assign-generate-btn`
  - `class-assign-result`
  - `class-assign-confirm-modal`
  - `class-assign-confirm-list`

- [ ] **Step 1: Add CSS link**

In `index.html`, after:

```html
<link rel="stylesheet" href="src/renderer/css/pages.css">
```

insert:

```html
<link rel="stylesheet" href="src/renderer/css/class-assign.css">
```

- [ ] **Step 2: Add sidebar nav item**

After the closing `</div>` of the `data-page="photo-rename"` nav item and before `</nav>`, insert:

```html
            <div class="nav-item" data-action="show-page" data-page="class-assign" title="分班编学号">
                <span class="nav-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 6h16M4 12h16M4 18h10"/>
                        <circle cx="18" cy="18" r="3"/>
                    </svg>
                </span>
                <span class="nav-label">分班编学号</span>
            </div>
```

- [ ] **Step 3: Add home quick-action card**

After the closing `</div>` of the `data-page="photo-rename"` quick-action card and before the settings card, insert:

```html
                <div class="quick-action-card" data-action="show-page-by-name" data-page="class-assign">
                    <div class="quick-action-icon" style="background: linear-gradient(135deg, #06b6d4 0%, #22d3ee 100%);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <path d="M4 6h16M4 12h16M4 18h10"/>
                            <circle cx="18" cy="18" r="3"/>
                        </svg>
                    </div>
                    <div class="quick-action-info">
                        <h4>分班编学号</h4>
                        <p>按专业均衡分班并生成学号</p>
                    </div>
                    <span class="quick-action-arrow">→</span>
                </div>
```

- [ ] **Step 4: Add page markup**

Insert this block immediately before `<div id="settings-page" style="display:none;">`:

```html
        <div id="class-assign-page" style="display:none;">
            <div class="page-header">
                <h2>分班编学号</h2>
                <p class="page-header-subtitle">按专业均衡分班并生成学号</p>
            </div>

            <div class="card">
                <p style="color: var(--text-secondary); margin-bottom: 20px; font-size: 14px; line-height: 1.6;">
                    选择学生信息 Excel，系统按专业均衡分班并生成 11 位学号。班级数量优先读取 Excel，缺失时自动建议。
                </p>
                <div class="form-grid">
                    <div class="form-group full-width">
                        <label class="form-label">学生信息 Excel</label>
                        <div class="input-group">
                            <input type="text" id="class-assign-excel-path" readonly placeholder="选择包含学生信息的 Excel 文件">
                            <button class="btn btn-secondary" data-action="select-class-assign-excel">浏览</button>
                        </div>
                    </div>
                </div>
                <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:16px;">
                    <button class="btn btn-outline" data-action="download-class-assign-template">下载模板</button>
                </div>
                <div id="class-assign-file-status" class="status"></div>
            </div>

            <div class="card" id="class-assign-plan-card" style="display:none; margin-top:20px;">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap; margin-bottom:16px;">
                    <div>
                        <h3 style="margin:0; font-size:15px; font-weight:600; color:var(--primary);">确认分班方案</h3>
                        <p id="class-assign-summary" style="margin:6px 0 0; font-size:13px; color:var(--text-muted);"></p>
                    </div>
                    <div class="form-group" style="margin:0; min-width:160px;">
                        <label class="form-label">入学年份</label>
                        <input type="number" id="class-assign-year" class="class-assign-year-input" min="2000" max="2100" step="1">
                    </div>
                </div>
                <div id="class-assign-warning-banner" class="status" style="display:none;"></div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:12px; flex-wrap:wrap; margin:12px 0;">
                    <div style="font-size:12px; color:var(--text-muted);">
                        图例：
                        <span class="class-assign-legend class-assign-legend-ok">正常 30–40</span>
                        <span class="class-assign-legend class-assign-legend-warn">接近边界 28–29 / 41–42</span>
                        <span class="class-assign-legend class-assign-legend-danger">需重点确认 &lt;28 或 &gt;42</span>
                    </div>
                    <label style="font-size:13px; color:var(--text-secondary); display:flex; align-items:center; gap:6px;">
                        <input type="checkbox" id="class-assign-only-warnings"> 只看需要确认的专业
                    </label>
                </div>
                <div style="overflow:auto; max-height:420px; border:1px solid var(--border); border-radius:var(--radius-sm);">
                    <table class="class-assign-table">
                        <thead>
                            <tr>
                                <th>院系</th>
                                <th>专业</th>
                                <th>层次</th>
                                <th>专业人数</th>
                                <th>班级数量</th>
                                <th>各班人数</th>
                            </tr>
                        </thead>
                        <tbody id="class-assign-plan-body"></tbody>
                    </table>
                </div>
                <div style="display:flex; justify-content:flex-end; align-items:center; gap:12px; margin-top:16px;">
                    <span id="class-assign-form-error" style="color:var(--danger); font-size:13px;"></span>
                    <button id="class-assign-generate-btn" class="btn" data-action="start-class-assign" disabled>生成分班学号 Excel</button>
                </div>
                <div id="class-assign-result" class="status"></div>
            </div>
        </div>
```

- [ ] **Step 5: Add confirmation modal**

Insert immediately before `<div class="content">`:

```html
    <!-- 分班编学号二次确认弹窗 -->
    <div class="modal-overlay" id="class-assign-confirm-modal" data-action="close-class-assign-overlay">
        <div class="modal-content">
            <button class="modal-close" data-action="close-class-assign-confirm">&times;</button>
            <h3 style="margin-bottom:12px;">确认生成</h3>
            <p style="color:var(--text-secondary); font-size:14px; line-height:1.6; margin-bottom:12px;">
                以下专业的班级人数需要重点确认，请确认是否继续生成：
            </p>
            <ul id="class-assign-confirm-list" class="class-assign-confirm-list"></ul>
            <div style="display:flex; justify-content:flex-end; gap:12px; margin-top:20px;">
                <button class="btn btn-secondary" data-action="close-class-assign-confirm">返回修改</button>
                <button class="btn btn-danger" data-action="confirm-class-assign">仍然生成</button>
            </div>
        </div>
    </div>
```

- [ ] **Step 6: Add script tag**

After:

```html
<script src="src/renderer/js/photo-rename.js"></script>
```

insert:

```html
<script src="src/renderer/js/class-assign.js"></script>
```

- [ ] **Step 7: Update core.js page switching and actions**

In `showPage`, after the photo-rename line, add:

```js
document.getElementById('class-assign-page').style.display = page === 'class-assign' ? 'block' : 'none';
```

In `showPageByName`, add the same line after the photo-rename line.

Replace the `pageIndex` object with:

```js
const pageIndex = {
    'home': 0,
    'convert': 1,
    'ticket-audit': 2,
    'photo-rename': 3,
    'class-assign': 4,
    'settings': 5
};
```

In `pageActions`, add:

```js
'select-class-assign-excel': () => selectClassAssignExcel(),
'start-class-assign': () => startClassAssign(),
'download-class-assign-template': () => downloadClassAssignTemplate(),
'close-class-assign-overlay': (element, clickEvent) => {
    if (!clickEvent.target.closest('.modal-content')) closeClassAssignConfirm();
},
'close-class-assign-confirm': () => closeClassAssignConfirm(),
'confirm-class-assign': () => confirmClassAssign(),
```

- [ ] **Step 8: Create class-assign.css**

Create `src/renderer/css/class-assign.css`:

```css
        .class-assign-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 13px;
        }

        .class-assign-table th,
        .class-assign-table td {
            padding: 10px 12px;
            border-bottom: 1px solid var(--border);
            text-align: left;
            vertical-align: middle;
        }

        .class-assign-table th {
            position: sticky;
            top: 0;
            z-index: 1;
            background: var(--bg-secondary);
            font-weight: 600;
            color: var(--text-secondary);
            white-space: nowrap;
        }

        .class-assign-table tbody tr:hover {
            background: rgba(0, 0, 0, 0.02);
        }

        .class-assign-table tbody tr.class-assign-row-warn {
            background: rgba(245, 158, 11, 0.08);
        }

        .class-assign-table tbody tr.class-assign-row-danger {
            background: rgba(239, 68, 68, 0.08);
        }

        .class-assign-count-input {
            width: 72px;
            padding: 6px 8px;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            background: var(--bg-primary);
            color: var(--text);
            text-align: center;
        }

        .class-assign-sizes {
            white-space: nowrap;
        }

        .class-assign-status-dot {
            display: inline-block;
            width: 8px;
            height: 8px;
            margin-right: 6px;
            border-radius: 50%;
            vertical-align: middle;
        }

        .class-assign-status-ok {
            background: #10b981;
        }

        .class-assign-status-warn {
            background: #f59e0b;
        }

        .class-assign-status-danger {
            background: #ef4444;
        }

        .class-assign-legend {
            display: inline-flex;
            align-items: center;
            margin-right: 12px;
        }

        .class-assign-legend-ok {
            color: #10b981;
        }

        .class-assign-legend-warn {
            color: #f59e0b;
        }

        .class-assign-legend-danger {
            color: #ef4444;
        }

        .class-assign-year-input {
            width: 100%;
            padding: 8px 10px;
            border: 1px solid var(--border);
            border-radius: var(--radius-sm);
            background: var(--bg-primary);
            color: var(--text);
        }

        .class-assign-confirm-list {
            max-height: 220px;
            margin: 0;
            padding-left: 20px;
            overflow: auto;
            color: var(--text-secondary);
            font-size: 13px;
            line-height: 1.8;
        }
```

- [ ] **Step 9: Commit**

```bash
git add index.html src/renderer/js/core.js src/renderer/css/class-assign.css
git commit -m "feat: 添加分班编学号页面骨架与样式"
```

---

### Task 11: 渲染层交互与冒烟测试

**Files:**
- Create: `src/renderer/js/class-assign.js`
- Modify: `tests/helpers/fixtures.js`（若 Task 7 未完成辅助函数，则在此完成）
- Modify: `tests/smoke/electron.smoke.test.js`
- Test: `npm run test:smoke`

**Interfaces:**
- Consumes: `window.electronAPI.invoke`、core.js 的 `ipcRenderer` / `showToast` / `openGeneratedFile` / `pageActions`。
- Produces global functions: `selectClassAssignExcel`、`downloadClassAssignTemplate`、`startClassAssign`、`closeClassAssignConfirm`、`confirmClassAssign`。

- [ ] **Step 1: Write the failing smoke assertions**

In `tests/smoke/electron.smoke.test.js`:

1. Change the test title from `'Electron 应用启动并可切换五个页面'` to `'Electron 应用启动并可切换六个页面'`.
2. Change `assert.equal(assets.cssCount, 8);` to `assert.equal(assets.cssCount, 9);`.
3. Change `assert.equal(assets.jsCount, 7);` to `assert.equal(assets.jsCount, 8);`.
4. Change the fixture import:

```js
const { writeStudentWorkbook, writeClassAssignWorkbook } = require('../helpers/fixtures');
```

5. After the convert page click, add:

```js
    await page.evaluate(() => document.querySelector('.sidebar-nav .nav-item[data-page="class-assign"]').click());
    const classAssignDisplay = await page.evaluate(() => document.getElementById('class-assign-page').style.display);
    assert.notEqual(classAssignDisplay, 'none');

    const classAssignActions = await page.evaluate(() => ({
        select: typeof selectClassAssignExcel === 'function',
        start: typeof startClassAssign === 'function',
        template: typeof downloadClassAssignTemplate === 'function'
    }));
    assert.equal(classAssignActions.select, true);
    assert.equal(classAssignActions.start, true);
    assert.equal(classAssignActions.template, true);
```

6. Create a class-assign fixture near the other fixture setup:

```js
    const classAssignPath = path.join(dir, 'class-assign.xlsx');
    writeClassAssignWorkbook(classAssignPath, [
        {
            '姓名': '测试甲', '身份证号码': '110101200001010011', '考生号': 'T000001',
            '性别': '男', '层次': '本科', '层次代码': '1', '省份': '湖北',
            '院系名称': '机械工程系', '院系代码': '01',
            '专业名称': '机械设计制造及其自动化', '专业代码': '1', '班级数量': '2'
        },
        {
            '姓名': '测试乙', '身份证号码': '110101200001010022', '考生号': 'T000002',
            '性别': '女', '层次': '本科', '层次代码': '1', '省份': '河南',
            '院系名称': '机械工程系', '院系代码': '01',
            '专业名称': '机械设计制造及其自动化', '专业代码': '1', '班级数量': '2'
        }
    ]);
```

7. After the existing `get-excel-columns` assertion, add:

```js
    const classAssignAnalysis = await page.evaluate((filePath) => {
        return window.electronAPI.invoke('analyze-class-assign-excel', { filePath });
    }, classAssignPath);
    assert.equal(classAssignAnalysis.ok, true);
    assert.equal(classAssignAnalysis.data.groups.length, 1);
    assert.equal(classAssignAnalysis.data.groups[0].studentCount, 2);
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm run test:smoke
```

Expected: FAIL because `src/renderer/js/class-assign.js` is missing and/or counts are not yet 9/8.

- [ ] **Step 3: Write the renderer implementation**

Create `src/renderer/js/class-assign.js`:

```js
        let classAssignState = null;

        function setClassAssignStatus(elementId, message, type = '') {
            const element = document.getElementById(elementId);
            if (!element) return;
            element.className = type ? `status ${type}` : 'status';
            element.textContent = message || '';
        }

        async function selectClassAssignExcel() {
            try {
                const filePath = await ipcRenderer.invoke('select-class-assign-excel');
                if (!filePath) return;
                document.getElementById('class-assign-excel-path').value = filePath;
                await analyzeClassAssignFile(filePath);
            } catch (error) {
                setClassAssignStatus('class-assign-file-status', `选择文件失败：${error.message}`, 'error');
            }
        }

        async function analyzeClassAssignFile(filePath) {
            classAssignState = null;
            document.getElementById('class-assign-plan-card').style.display = 'none';
            setClassAssignStatus('class-assign-file-status', '正在读取并分析...', '');
            try {
                const result = await ipcRenderer.invoke('analyze-class-assign-excel', { filePath });
                if (!result || !result.ok) {
                    const message = result && result.error ? result.error.message : '分析失败';
                    setClassAssignStatus('class-assign-file-status', message, 'error');
                    return;
                }
                classAssignState = result.data;
                classAssignState.overrides = {};
                renderClassAssignState();
                setClassAssignStatus('class-assign-file-status', '分析完成，请确认分班方案。', 'success');
            } catch (error) {
                setClassAssignStatus('class-assign-file-status', `分析失败：${error.message}`, 'error');
            }
        }

        async function downloadClassAssignTemplate() {
            try {
                const result = await ipcRenderer.invoke('download-class-assign-template');
                if (result && result.success) {
                    showToast(`模板已保存至：${result.path}`, 'success');
                } else if (result && result.code !== 'CANCELED') {
                    showToast(result.message || '模板下载失败', 'error');
                }
            } catch (error) {
                showToast(`模板下载失败：${error.message}`, 'error');
            }
        }

        function renderClassAssignState() {
            const data = classAssignState;
            if (!data) return;
            document.getElementById('class-assign-plan-card').style.display = 'block';
            document.getElementById('class-assign-year').value = String(data.defaultYear);
            document.getElementById('class-assign-result').className = 'status';
            document.getElementById('class-assign-result').textContent = '';
            renderClassAssignSummary();
            renderClassAssignGroups();
            updateClassAssignGenerateButton();
        }

        function renderClassAssignSummary() {
            const data = classAssignState;
            if (!data) return;
            const source = data.summary.sourceCounts || {};
            document.getElementById('class-assign-summary').textContent =
                `学生 ${data.summary.totalStudents} 人 · ${data.summary.deptCount} 个院系 · ` +
                `${data.summary.groupCount} 个专业组 · Excel 班级数 ${source.excel || 0} 组 · ` +
                `部分填写 ${source['excel-partial'] || 0} 组 · 自动建议 ${source.auto || 0} 组 · ` +
                `不一致 ${source['excel-inconsistent'] || 0} 组 · 无效 ${source['excel-invalid'] || 0} 组`;
        }

        function classAssignOption(group, classCount) {
            return group.options.find(option => option.classCount === classCount) || null;
        }

        function classAssignRowClass(level) {
            if (level === 'danger' || level === 'invalid') return 'class-assign-row-danger';
            if (level === 'warn') return 'class-assign-row-warn';
            return '';
        }

        function classAssignStatusClass(level) {
            if (level === 'warn') return 'class-assign-status-warn';
            if (level === 'danger' || level === 'invalid') return 'class-assign-status-danger';
            return 'class-assign-status-ok';
        }

        function classAssignStatusTitle(level, reasons) {
            if (level === 'ok') return '正常';
            if (level === 'warn') return '接近边界';
            if (level === 'danger') return '需要重点确认';
            return `无效：${(reasons || []).join('；')}`;
        }

        function classAssignEffectiveLevel(group, option) {
            if (!option || !option.valid || option.level === 'danger' || option.level === 'invalid') return 'danger';
            if (option.level === 'warn') return 'warn';
            if (group.warnings.some(warning => warning.code === 'CLASS_COUNT_EXCEL_INVALID')) return 'danger';
            if (group.warnings.some(warning =>
                warning.code === 'CLASS_COUNT_EXCEL_INCONSISTENT' ||
                warning.code === 'CLASS_COUNT_EXCEL_PARTIAL'
            )) return 'warn';
            return 'ok';
        }

        function classAssignCountFor(group) {
            const data = classAssignState;
            return Object.prototype.hasOwnProperty.call(data.overrides, group.key)
                ? data.overrides[group.key]
                : group.initialClassCount;
        }

        function renderClassAssignGroups() {
            const data = classAssignState;
            const body = document.getElementById('class-assign-plan-body');
            if (!data || !body) return;
            const onlyWarnings = document.getElementById('class-assign-only-warnings').checked;
            body.textContent = '';

            for (const group of data.groups) {
                const classCount = classAssignCountFor(group);
                const option = classAssignOption(group, classCount);
                const level = classAssignEffectiveLevel(group, option);
                if (onlyWarnings && level === 'ok') continue;

                const tr = document.createElement('tr');
                tr.dataset.groupKey = group.key;
                tr.className = classAssignRowClass(level);

                for (const text of [group.deptName, group.majorName, group.levelName, String(group.studentCount)]) {
                    const td = document.createElement('td');
                    td.textContent = text;
                    tr.appendChild(td);
                }

                const countTd = document.createElement('td');
                const input = document.createElement('input');
                input.type = 'number';
                input.min = '1';
                input.max = '9';
                input.step = '1';
                input.className = 'class-assign-count-input';
                input.dataset.groupKey = group.key;
                input.value = classCount === null ? '' : String(classCount);
                countTd.appendChild(input);
                tr.appendChild(countTd);

                const sizesTd = document.createElement('td');
                sizesTd.className = 'class-assign-sizes';
                const dot = document.createElement('span');
                dot.className = `class-assign-status-dot ${classAssignStatusClass(level)}`;
                dot.title = classAssignStatusTitle(level, option ? option.reasons : []);
                sizesTd.appendChild(dot);
                sizesTd.appendChild(document.createTextNode(option && option.sizes ? option.sizes.join(' / ') : '—'));
                tr.appendChild(sizesTd);

                body.appendChild(tr);
            }

            updateClassAssignBanner();
        }

        function updateClassAssignBanner() {
            const data = classAssignState;
            const banner = document.getElementById('class-assign-warning-banner');
            if (!data || !banner) return;
            let warnings = 0;
            let dangers = 0;
            for (const group of data.groups) {
                const option = classAssignOption(group, classAssignCountFor(group));
                const level = classAssignEffectiveLevel(group, option);
                if (level === 'danger') dangers += 1;
                else if (level === 'warn') warnings += 1;
            }
            if (warnings + dangers > 0) {
                banner.style.display = 'block';
                banner.className = 'status warning';
                banner.textContent = `有 ${warnings} 个专业接近边界，${dangers} 个专业需要重点确认或修正。`;
            } else {
                banner.style.display = 'none';
                banner.textContent = '';
            }
        }

        function updateClassAssignRow(groupKey) {
            const data = classAssignState;
            if (!data) return;
            const input = document.querySelector(`.class-assign-count-input[data-group-key="${CSS.escape(groupKey)}"]`);
            if (!input) return;
            const raw = input.value.trim();
            const value = raw === '' ? null : Number(raw);
            data.overrides[groupKey] = Number.isInteger(value) ? value : null;

            const group = data.groups.find(item => item.key === groupKey);
            const option = group ? classAssignOption(group, data.overrides[groupKey]) : null;
            const level = group ? classAssignEffectiveLevel(group, option) : 'danger';
            const tr = input.closest('tr');
            tr.className = classAssignRowClass(level);

            const sizesTd = tr.querySelector('.class-assign-sizes');
            sizesTd.textContent = '';
            const dot = document.createElement('span');
            dot.className = `class-assign-status-dot ${classAssignStatusClass(level)}`;
            dot.title = classAssignStatusTitle(level, option ? option.reasons : []);
            sizesTd.appendChild(dot);
            sizesTd.appendChild(document.createTextNode(option && option.sizes ? option.sizes.join(' / ') : '—'));

            updateClassAssignGenerateButton();
        }

        function getClassAssignValidation() {
            const data = classAssignState;
            if (!data) return { ok: false, message: '请先选择并分析 Excel 文件' };
            const year = Number(document.getElementById('class-assign-year').value);
            if (!Number.isInteger(year) || year < 1000 || year > 9999) {
                return { ok: false, message: '入学年份必须是 4 位数字' };
            }
            const counts = {};
            for (const group of data.groups) {
                const raw = classAssignCountFor(group);
                if (!Number.isInteger(raw) || raw < 1 || raw > 9) {
                    return { ok: false, message: `${group.majorName} 的班级数必须是 1–9 的整数` };
                }
                const option = classAssignOption(group, raw);
                if (!option || !option.valid) {
                    return {
                        ok: false,
                        message: `${group.majorName}：${option ? option.reasons.join('；') : '班级方案无效'}`
                    };
                }
                counts[group.key] = raw;
            }
            return { ok: true, counts, year };
        }

        function updateClassAssignGenerateButton() {
            const button = document.getElementById('class-assign-generate-btn');
            const error = document.getElementById('class-assign-form-error');
            if (!button) return;
            const validation = getClassAssignValidation();
            button.disabled = !validation.ok;
            error.textContent = validation.ok ? '' : validation.message;
            updateClassAssignBanner();
        }

        function startClassAssign() {
            const validation = getClassAssignValidation();
            if (!validation.ok) {
                updateClassAssignGenerateButton();
                return;
            }

            const dangerGroups = classAssignState.groups.filter(group => {
                const option = classAssignOption(group, validation.counts[group.key]);
                return classAssignEffectiveLevel(group, option) === 'danger';
            });

            if (dangerGroups.length > 0) {
                const list = document.getElementById('class-assign-confirm-list');
                list.textContent = '';
                for (const group of dangerGroups) {
                    const option = classAssignOption(group, validation.counts[group.key]);
                    const reasons = group.warnings
                        .filter(warning => warning.code === 'CLASS_COUNT_EXCEL_INVALID')
                        .map(warning => warning.message);
                    const li = document.createElement('li');
                    li.textContent = `${group.deptName} / ${group.majorName}：` +
                        (option && option.sizes ? `${option.sizes.join(' / ')} 人` : '班级方案无效') +
                        (reasons.length ? `（${reasons.join('；')}）` : '');
                    list.appendChild(li);
                }
                document.getElementById('class-assign-confirm-modal').classList.add('active');
                return;
            }

            generateClassAssign();
        }

        function closeClassAssignConfirm() {
            document.getElementById('class-assign-confirm-modal').classList.remove('active');
        }

        function confirmClassAssign() {
            closeClassAssignConfirm();
            generateClassAssign();
        }

        async function generateClassAssign() {
            const validation = getClassAssignValidation();
            if (!validation.ok) {
                updateClassAssignGenerateButton();
                return;
            }
            const button = document.getElementById('class-assign-generate-btn');
            const resultElement = document.getElementById('class-assign-result');
            button.disabled = true;
            button.textContent = '生成中...';
            resultElement.className = 'status';
            resultElement.textContent = '';

            try {
                const result = await ipcRenderer.invoke('generate-class-assign', {
                    filePath: classAssignState.filePath,
                    fingerprint: classAssignState.fingerprint,
                    classCounts: validation.counts,
                    year: validation.year
                });
                if (!result || !result.ok) {
                    resultElement.className = 'status error';
                    resultElement.textContent = result && result.error ? result.error.message : '生成失败';
                    return;
                }
                resultElement.className = 'status success';
                resultElement.textContent = '生成成功：';
                const link = document.createElement('a');
                link.href = '#';
                link.className = 'file-link';
                link.textContent = result.data.outputPath;
                link.addEventListener('click', (event) => {
                    event.preventDefault();
                    openGeneratedFile(result.data.outputPath);
                });
                resultElement.appendChild(link);
            } catch (error) {
                resultElement.className = 'status error';
                resultElement.textContent = `生成失败：${error.message}`;
            } finally {
                button.textContent = '生成分班学号 Excel';
                updateClassAssignGenerateButton();
            }
        }

        document.addEventListener('DOMContentLoaded', () => {
            const filter = document.getElementById('class-assign-only-warnings');
            if (filter) filter.addEventListener('change', renderClassAssignGroups);
            const year = document.getElementById('class-assign-year');
            if (year) year.addEventListener('input', updateClassAssignGenerateButton);
            const body = document.getElementById('class-assign-plan-body');
            if (body) {
                body.addEventListener('input', (event) => {
                    const input = event.target.closest('.class-assign-count-input');
                    if (input) updateClassAssignRow(input.dataset.groupKey);
                });
            }
        });
```

- [ ] **Step 4: Run smoke test to verify it passes**

Run:

```bash
npm run test:smoke
```

Expected: PASS; page switches to `class-assign-page`; analysis returns one group with 2 students; CSS count 9; JS count 8.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/js/class-assign.js tests/helpers/fixtures.js tests/smoke/electron.smoke.test.js
git commit -m "feat: 添加分班编学号页面交互与冒烟测试"
```

---

### Task 12: 文档与全量验证

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`
- Modify: `RELEASE_NOTES.md`
- Test: `npm test`、`npm run test:coverage`、`npm run test:smoke`

- [ ] **Step 1: Update README**

Add a feature section after the ticket audit section, and renumber the existing “4. 系统特性” to “5. 系统特性”。同时把开头概述中的“新生名册文档生成、准考证审核和考生照片重命名功能”更新为包含“分班编学号”。

```markdown
### 4. 分班编学号
- 选择学生信息 Excel，按“层次 + 院系 + 专业”分组，专业之间严格隔离
- 班级数量优先读取 Excel；缺失时按每班 30–40 人自动建议
- 确认页可修改班级数和入学年份，各班人数自动重算
- 男女均衡、省份均衡，班内男生在前、女生在后
- 按 11 位规则生成学号，保留原列并导出新的 Excel
- 提供仅表头的“学生分班模板.xlsx”下载
```

Update the project structure block:

```text
│   ├── classAssigner/          # 分班、均衡、学号生成与 Excel 导出
```

Update the test line to remove the fixed “42 个” count:

```markdown
npm test                  # 单元 + 集成测试（node:test）
```

- [ ] **Step 2: Update CLAUDE.md**

Add `classAssigner/` under `src/`；同时把 `Project Overview` 的功能数量从 three 更新为 four，并加入“分班编学号”：

```markdown
- **src/classAssigner/** - 分班、均衡、学号生成与 Excel 导出（不依赖 Electron）
```

Add a feature subsection:

```markdown
### 分班编学号
- 按 `层次代码 + 院系代码 + 专业代码` 分组，跨专业严格隔离
- 班级数量优先读取 Excel，缺失时自动建议 30–40 人/班
- 男女配额 + 省份均衡 + 班内男生优先排序
- 学号 11 位：年份 + 层次 + 院系 + 专业 + 班级 + 班内序号
- IPC：`select-class-assign-excel`、`analyze-class-assign-excel`、`generate-class-assign`、`download-class-assign-template`
```

Update the testing line to remove the fixed “42 tests” count if present.

- [ ] **Step 3: Update RELEASE_NOTES.md**

Under the refactor/optimization section, add:

```markdown
- 新增“分班编学号”功能：按专业均衡分班、生成 11 位学号并导出 Excel
- 分班确认页支持修改班级数和入学年份，异常班额分级提示
- 新增仅表头的“学生分班模板.xlsx”下载
```

- [ ] **Step 4: Run full verification**

Run:

```bash
npm test
npm run test:coverage
npm run test:smoke
```

Expected:

- `npm test`: all tests pass, `# fail 0`.
- `npm run test:coverage`: new `src/classAssigner/` modules have line coverage at or above 90%; overall at or above 80%.
- `npm run test:smoke`: PASS, including class-assign page and analyze IPC.

If coverage is below target, add tests for uncovered branches in `classPlan.js`, `validation.js`, or `assign.js`, then rerun.

- [ ] **Step 5: Commit**

`CLAUDE.md` 若被 `.gitignore` 忽略，只做本地更新，不强制加入提交；提交 README 和 RELEASE_NOTES。

```bash
git add README.md RELEASE_NOTES.md
git commit -m "docs: 更新分班编学号功能说明"
```

---

## Self-Review

**Spec coverage:**

- 学号 11 位规则：Task 1、Task 7、Task 11。
- 年份默认当前年且可修改：Task 7（`defaultYear`、`validateYear`）、Task 10（年份输入）、Task 11（提交 `year`）。
- 班级数量 Excel 优先/自动建议/不一致/无效：Task 5、Task 7。
- 班级人数公式与 30–40 提醒：Task 2、Task 5。
- 男女均衡、省份均衡、男生优先：Task 6。
- 跨专业隔离：Task 5（分组）、Task 7（生成前后校验）。
- 表格 6 列、不显示状态/来源列：Task 10、Task 11。
- 专业人数定义：Task 10 文案、Task 11 表格。
- 编号保留/生成：Task 7、Task 11。
- 输出文件命名/不覆盖：Task 3、Task 7。
- 模板下载仅表头：Task 8、Task 9。
- IPC/preload/主进程：Task 9。
- 页面/首页/侧边栏：Task 10。
- 测试/冒烟/覆盖率/文档：Task 11、Task 12。

**Placeholder scan:** 无 `TBD`、`TODO`、`待补`；每个代码步骤均包含实际代码，每个命令均包含预期结果。

**Type consistency:** `PlanOption` 的 `classCount/sizes/valid/level/reasons` 在 Task 2、5、7、11 中保持一致；`GroupSummary.studentCount` 与 `Group.total` 在 Task 5、11 中一致；`analyzeWorkbook` 返回 `data.defaultYear`，Task 11 使用 `data.defaultYear`；`generateWorkbook` 接收 `{ filePath, fingerprint, classCounts, year }`，Task 9、11 一致。

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-11-20-class-assignment.md`. Two execution options:**

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

**Which approach?**



