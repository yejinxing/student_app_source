const { convertExcelToWord } = require('./document');
const { cmToTwip } = require('./styles');
const { extractYearFromClassName, getYearFromClasses, getLevel, getDeptIndex, DEPT_ORDER, calculateStatistics } = require('./statistics');

module.exports = {
    convertExcelToWord,
    cmToTwip,
    extractYearFromClassName,
    getYearFromClasses,
    getLevel,
    getDeptIndex,
    DEPT_ORDER,
    calculateStatistics
};
