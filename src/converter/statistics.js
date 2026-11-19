// 从班级名称中提取年份（如"25gb机器人1班"→2025，"24gb机制1班"→2024）
function extractYearFromClassName(className) {
    if (!className) return null;
    
    // 匹配开头的2位数字（如25、24等）
    const match = className.match(/^(\d{2})/);
    if (match) {
        const yearSuffix = parseInt(match[1], 10);
        // 假设20xx年，如25→2025，24→2024
        return 2000 + yearSuffix;
    }
    return null;
}

// 从所有班级名称中获取统一的年份
function getYearFromClasses(classes) {
    for (const classInfo of classes) {
        const year = extractYearFromClassName(classInfo.className);
        if (year) return year;
    }
    // 如果无法从班级名称获取，使用当前年份
    return new Date().getFullYear();
}

// 判断层次（层次与学制是两个独立的概念）
// 层次：本科/专科/专升本
// 学制：直接使用表格中的原始内容（如"四年"、"三年"、"二年"、"五年"等）
function getLevel(levelField, className) {
    // 优先从表格中的"层次"字段获取
    if (levelField) {
        const levelStr = String(levelField).trim();
        if (levelStr.includes('专升本')) {
            return '专升本';
        }
        if (levelStr.includes('专科')) {
            return '专科';
        }
        if (levelStr.includes('本科')) {
            return '本科';
        }
    }
    
    // 如果表格中没有层次字段或无法识别，则根据班级名称判断
    if (className) {
        const lowerClassName = className.toLowerCase();
        // 注意：gbs 要在 gb 之前判断，因为 gbs 包含 gb
        if (lowerClassName.includes('gbs') || lowerClassName.includes('专升本')) {
            return '专升本';
        }
        if (lowerClassName.includes('gz') || lowerClassName.includes('专科')) {
            return '专科';
        }
        if (lowerClassName.includes('gb') || lowerClassName.includes('本科')) {
            return '本科';
        }
    }
    
    return '本科'; // 默认本科
}

// 系部排序顺序
const DEPT_ORDER = [
    '机械工程系',
    '电气与电子工程系',
    '计算机系',
    '生化工程系',
    '土木工程系',
    '经济系',
    '管理系',
    '外国语系',
    '艺术设计系'
];

// 获取系部排序索引
function getDeptIndex(dept) {
    const index = DEPT_ORDER.indexOf(dept);
    return index === -1 ? DEPT_ORDER.length : index;
}

// 计算统计数据
function calculateStatistics(data) {
    const statistics = {
        byDept: {},          // 按系部统计
        byLevel: {},         // 按层次统计
        totalClassCount: 0,
        totalStudents: 0,
        totalLevels: {},
        totalGender: {},
        totalPolitics: {},
        totalEthnicity: {},
        classes: []          // 所有班级信息，用于生成目录
    };
    
    // 先按系、专业、班级分组
    const groups = {};
    data.forEach(row => {
        const level = getLevel(row['层次'], row['班级名称']);
        const key = `${row['系（部）']}_${row['专业名称']}_${row['班级名称']}_${row['学制']}`;
        
        if (!groups[key]) {
            groups[key] = {
                dept: row['系（部）'] || '',
                major: row['专业名称'] || '',
                className: row['班级名称'] || '',
                duration: row['学制'] || '',
                level: level,
                students: []
            };
        }
        groups[key].students.push({
            ...row,
            level: level
        });
    });
    
    // 统计每个班级
    const classKeys = Object.keys(groups);
    statistics.totalClassCount = classKeys.length;
    
    for (const key of classKeys) {
        const group = groups[key];
        const dept = group.dept;
        const level = group.level;
        
        // 初始化系部统计
        if (!statistics.byDept[dept]) {
            statistics.byDept[dept] = {
                classCount: 0,
                total: 0,
                levels: {},
                gender: {},
                politics: {},
                ethnicity: {},
                classes: []
            };
        }
        
        // 初始化层次统计
        if (!statistics.byLevel[level]) {
            statistics.byLevel[level] = {
                byDept: {},
                total: {
                    classCount: 0,
                    studentCount: 0,
                    gender: {},
                    politics: {},
                    ethnicity: {}
                },
                classes: []
            };
        }
        
        if (!statistics.byLevel[level].byDept[dept]) {
            statistics.byLevel[level].byDept[dept] = {
                classCount: 0,
                total: 0,
                gender: {},
                politics: {},
                ethnicity: {},
                classes: []
            };
        }
        
        // 更新班级数
        statistics.byDept[dept].classCount++;
        statistics.byLevel[level].byDept[dept].classCount++;
        statistics.byLevel[level].total.classCount++;
        
        // 记录班级信息
        const classInfo = {
            dept: dept,
            className: group.className,
            level: level,
            studentCount: group.students.length,
            students: group.students,
            major: group.major,
            duration: group.duration
        };
        
        statistics.byDept[dept].classes.push(classInfo);
        statistics.byLevel[level].byDept[dept].classes.push(classInfo);
        statistics.byLevel[level].classes.push(classInfo);
        statistics.classes.push(classInfo);
        
        // 统计学生
        for (const student of group.students) {
            statistics.totalStudents++;
            statistics.byDept[dept].total++;
            statistics.byLevel[level].byDept[dept].total++;
            statistics.byLevel[level].total.studentCount++;
            
            // 层次统计
            statistics.totalLevels[level] = (statistics.totalLevels[level] || 0) + 1;
            statistics.byDept[dept].levels[level] = (statistics.byDept[dept].levels[level] || 0) + 1;
            
            // 性别统计
            const gender = student['性别'] || '未知';
            statistics.totalGender[gender] = (statistics.totalGender[gender] || 0) + 1;
            statistics.byDept[dept].gender[gender] = (statistics.byDept[dept].gender[gender] || 0) + 1;
            statistics.byLevel[level].byDept[dept].gender[gender] = (statistics.byLevel[level].byDept[dept].gender[gender] || 0) + 1;
            statistics.byLevel[level].total.gender[gender] = (statistics.byLevel[level].total.gender[gender] || 0) + 1;
            
            // 政治面貌统计
            const politics = student['政治面貌'] || '群众';
            statistics.totalPolitics[politics] = (statistics.totalPolitics[politics] || 0) + 1;
            statistics.byDept[dept].politics[politics] = (statistics.byDept[dept].politics[politics] || 0) + 1;
            statistics.byLevel[level].byDept[dept].politics[politics] = (statistics.byLevel[level].byDept[dept].politics[politics] || 0) + 1;
            statistics.byLevel[level].total.politics[politics] = (statistics.byLevel[level].total.politics[politics] || 0) + 1;
            
            // 民族统计（汉族/少数民族）
            const ethnicityRaw = student['民族'] || '汉族';
            const ethnicity = ethnicityRaw === '汉族' ? '汉族' : '少数民族';
            statistics.totalEthnicity[ethnicity] = (statistics.totalEthnicity[ethnicity] || 0) + 1;
            statistics.byDept[dept].ethnicity[ethnicity] = (statistics.byDept[dept].ethnicity[ethnicity] || 0) + 1;
            statistics.byLevel[level].byDept[dept].ethnicity[ethnicity] = (statistics.byLevel[level].byDept[dept].ethnicity[ethnicity] || 0) + 1;
            statistics.byLevel[level].total.ethnicity[ethnicity] = (statistics.byLevel[level].total.ethnicity[ethnicity] || 0) + 1;
        }
    }
    
    return { statistics, groups };
}

module.exports = {
    extractYearFromClassName,
    getYearFromClasses,
    getLevel,
    getDeptIndex,
    DEPT_ORDER,
    calculateStatistics
};
