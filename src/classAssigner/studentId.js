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
