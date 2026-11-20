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
