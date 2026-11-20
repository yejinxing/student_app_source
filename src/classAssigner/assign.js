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
