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
