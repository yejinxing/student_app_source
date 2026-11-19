    // 计算文本的字符宽度（估算）
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
    
    // 计算表格列宽的动态分配算法
    const calculateColumnWidths = (label1, value1, label2, value2) => {
        const PAGE_WIDTH = 21.0;
        const LEFT_MARGIN = 2.58;
        const RIGHT_MARGIN = 1.98;
        const AVAILABLE_WIDTH = PAGE_WIDTH - LEFT_MARGIN - RIGHT_MARGIN;
        
        const minCol1Width = 25;
        const maxCol1Width = 40;
        
        const majorLength = value2.length;
        
        let col1Percent;
        if (majorLength <= 8) {
            col1Percent = 35;
        } else if (majorLength <= 12) {
            col1Percent = 30;
        } else if (majorLength <= 16) {
            col1Percent = 28;
        } else {
            col1Percent = 25;
        }
        
        col1Percent = Math.max(minCol1Width, Math.min(maxCol1Width, col1Percent));
        const col2Percent = 100 - col1Percent;
        
        return {
            col1Percent: col1Percent,
            col2Percent: col2Percent
        };
    };

module.exports = { calculateTextWidth, calculateColumnWidths };
