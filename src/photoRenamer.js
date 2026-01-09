const xlsx = require('xlsx');
const fs = require('fs-extra');
const path = require('path');
const sharp = require('sharp');

// 支持的输入图片格式
const SUPPORTED_INPUT_FORMATS = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'tiff', 'tif', 'webp'];

// 输出格式映射（sharp 库格式名）
const OUTPUT_FORMAT_MAP = {
    'keep': 'keep',
    'jpg': 'jpeg',
    'jpeg': 'jpeg',
    'png': 'png',
    'gif': 'gif',
    'webp': 'webp',
    'tiff': 'tiff'
    // 注意：bmp 不支持输出，sharp 库不支持
};

class PhotoRenamer {
    constructor(options) {
        this.excelPath = options.excelPath;
        this.imgDir = options.photoDir;
        this.outputDir = options.outputDir;
        this.outputExt = options.outputExt;
        this.inputField = options.inputField || 'ksh';
        this.outputField = options.outputField || 'sfz';
        this.statusCallback = null;
        this.progressCallback = null;
        this.finishCallback = null;
    }

    setStatusCallback(callback) {
        this.statusCallback = callback;
    }

    setProgressCallback(callback) {
        this.progressCallback = callback;
    }

    setFinishCallback(callback) {
        this.finishCallback = callback;
    }

    async run() {
        try {
            // 检查Excel文件是否存在
            if (!await fs.pathExists(this.excelPath)) {
                this.statusCallback(`错误: 文件不存在 - ${this.excelPath}`);
                this.finishCallback(false);
                return;
            }

            // 检查Excel文件格式
            const ext = path.extname(this.excelPath).toLowerCase();
            if (ext !== '.xlsx' && ext !== '.xls') {
                this.statusCallback("错误: 不支持的文件格式，仅支持 .xlsx 或 .xls");
                this.finishCallback(false);
                return;
            }

            // 读取Excel数据
            this.statusCallback("正在读取Excel文件...");
            const workbook = xlsx.readFile(this.excelPath);
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const data = xlsx.utils.sheet_to_json(worksheet);

            // 检查字段是否存在
            if (data.length === 0) {
                this.statusCallback("错误: Excel文件为空或未找到有效数据!");
                this.finishCallback(false);
                return;
            }

            const firstRow = data[0];
            if (!Object.keys(firstRow).includes(this.inputField) || !Object.keys(firstRow).includes(this.outputField)) {
                this.statusCallback(`错误: Excel中缺少必要的字段 - ${this.inputField} 或 ${this.outputField}`);
                this.finishCallback(false);
                return;
            }

            // 创建映射字典
            const nameMap = new Map();
            const lowerMap = new Map();
            
            data.forEach(row => {
                const inputVal = String(row[this.inputField]).trim();
                const outputVal = String(row[this.outputField]).trim();
                nameMap.set(inputVal, outputVal);
                lowerMap.set(inputVal.toLowerCase(), { value: outputVal, key: inputVal });
            });

            this.statusCallback(`成功读取Excel: 共${data.length}条记录`);

            // 确保输出目录存在
            await fs.ensureDir(this.outputDir);
            this.statusCallback(`输出目录: ${this.outputDir}`);
            // 显示输出格式
            let formatText = this.outputExt;
            if (this.outputExt === 'keep') {
                formatText = '保持原格式';
            } else if (!this.outputExt.includes('格式')) {
                formatText = `${this.outputExt.toUpperCase()}格式`;
            }
            this.statusCallback(`输出格式: ${formatText}`);

            // 获取所有图片文件
            const allFiles = await fs.readdir(this.imgDir);
            const imageFiles = [];
            
            allFiles.forEach(file => {
                const fileExt = path.extname(file).toLowerCase();
                if (SUPPORTED_INPUT_FORMATS.includes(fileExt.substring(1))) {
                    imageFiles.push(file);
                }
            });

            if (imageFiles.length === 0) {
                this.statusCallback("错误: 未找到任何图片文件!");
                this.finishCallback(false);
                return;
            }

            // 处理图片文件
            const totalFiles = imageFiles.length;
            let processedFiles = 0;

            for (const filename of imageFiles) {
                const fileBase = path.parse(filename).name;
                const fileExt = path.parse(filename).ext;
                const ksh = fileBase.trim();

                // 大小写不敏感匹配
                const kshLower = ksh.toLowerCase();
                if (lowerMap.has(kshLower)) {
                    const { value: sfz, key: actualKey } = lowerMap.get(kshLower);

                    // 确定输出格式
                    let outputFileExt;
                    if (this.outputExt === 'keep') {
                        outputFileExt = fileExt;
                    } else {
                        // 标准化扩展名格式
                        let ext_str = this.outputExt.trim().toLowerCase();
                        if (!ext_str.startsWith('.')) {
                            ext_str = '.' + ext_str;
                        }
                        outputFileExt = ext_str;
                    }

                    // 构建新文件名
                    let baseName = `${sfz}${outputFileExt}`;
                    let counter = 1;
                    let newFileName = baseName;
                    
                    while (await fs.pathExists(path.join(this.outputDir, newFileName))) {
                        newFileName = `${sfz}_${counter}${outputFileExt}`;
                        counter++;
                    }

                    const srcPath = path.join(this.imgDir, filename);
                    const destPath = path.join(this.outputDir, newFileName);

                    try {
                        // 格式转换处理
                        if (this.outputExt !== 'keep' && outputFileExt.toLowerCase() !== fileExt.toLowerCase()) {
                            // 检查是否支持该格式
                            const SUPPORTED_FORMATS = ['jpg', 'jpeg', 'png', 'gif'];
                            const targetFormat = outputFileExt.substring(1).toLowerCase();
                            
                            if (!SUPPORTED_FORMATS.includes(targetFormat)) {
                                this.statusCallback(`警告: 不支持的格式 ${outputFileExt}，使用复制代替转换`);
                                await fs.copy(srcPath, destPath);
                            } else {
                                // 使用 sharp 进行格式转换
                                const mappedFormat = OUTPUT_FORMAT_MAP[targetFormat] || targetFormat;
                                await sharp(srcPath)
                                    .toFormat(mappedFormat)
                                    .toFile(destPath);
                                this.statusCallback(`转换成功: ${filename} → ${newFileName}`);
                            }
                        } else {
                            // 直接复制文件
                            await fs.copy(srcPath, destPath);
                            this.statusCallback(`转换成功: ${filename} → ${newFileName}`);
                        }
                    } catch (error) {
                        this.statusCallback(`文件处理失败[${filename}]: ${error.message}`);
                    }
                } else {
                    // 获取前3个样本键（如果有）
                    const sampleKeys = Array.from(nameMap.keys()).slice(0, 3);
                    this.statusCallback(`未匹配: ${filename} | 样本${this.inputField}: ${sampleKeys.join(', ')}...`);
                }

                processedFiles++;
                
                // 更新进度
                const progress = Math.round((processedFiles / totalFiles) * 100);
                this.progressCallback(progress);
            }

            this.statusCallback(`处理完成! 成功处理 ${processedFiles}/${totalFiles} 个文件`);
            this.finishCallback(true);
        } catch (error) {
            this.statusCallback(`处理出错: ${error.message}`);
            this.statusCallback(error.stack);
            this.finishCallback(false);
        }
    }
}

module.exports = PhotoRenamer;
