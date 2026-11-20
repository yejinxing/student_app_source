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
