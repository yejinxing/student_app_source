const calculateTextWidth = (text) => {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        if (/[\u4e00-\u9fff]/.test(char)) {
            width += 2;
        } else if (/[^\x00-\x7f]/.test(char)) {
            width += 2;
        } else {
            width += 1;
        }
    }
    return width;
};

const testCases = [
    "计算机科学与技术",
    "电子信息工程",
    "视觉传达设计（数字媒体方向）",
    "英语（师范）",
    "机械设计制造及其自动化（智能制造方向）",
    "国际经济与贸易",
    "应用化学（精细化工方向）",
    "生物技术（基因工程方向）"
];

console.log("=== 文本宽度计算测试 ===\n");
testCases.forEach(text => {
    const width = calculateTextWidth(text);
    console.log(`文本: "${text}"`);
    console.log(`字符数: ${text.length}`);
    console.log(`计算宽度: ${width}`);
    console.log(`预估厘米宽度: ${width * 0.2}cm`);
    console.log("--------------------------");
});