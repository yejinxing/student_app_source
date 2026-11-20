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
