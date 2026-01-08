# This Python file uses the following encoding: utf-8
import sys
import os
import shutil
import pandas as pd
from PySide2.QtWidgets import (QApplication, QWidget, QVBoxLayout, QHBoxLayout,
                               QPushButton, QLabel, QLineEdit, QTextEdit,
                               QFileDialog, QProgressBar, QComboBox)
from PySide2.QtCore import QThread, Signal, Qt
from PySide2.QtGui import QIcon
import openpyxl

try:
    from PIL import Image
    has_pillow = True
except ImportError:
    has_pillow = False


class RenameThread(QThread):
    progress = Signal(int)
    message = Signal(str)
    finished = Signal(bool)

    def __init__(self, excel_path, img_dir, output_dir, output_ext, input_field, output_field):
        super().__init__()
        self.excel_path = os.path.abspath(excel_path)
        self.img_dir = img_dir
        self.output_dir = output_dir
        self.output_ext = output_ext.lower()  # 统一转为小写
        self.input_field = input_field
        self.output_field = output_field

    def run(self):
        try:
            # 新增：检查文件是否存在且为 Excel
            if not os.path.exists(self.excel_path):
                self.message.emit(f"错误: 文件不存在 - {self.excel_path}")
                return

            # 根据扩展名选择引擎
            if self.excel_path.lower().endswith('.xlsx'):
                engine = 'openpyxl'  # 处理 .xlsx 文件
            elif self.excel_path.lower().endswith('.xls'):
                engine = 'xlrd'       # 处理 .xls 文件
            else:
                self.message.emit("错误: 不支持的文件格式，仅支持 .xlsx 或 .xls")
                self.finished.emit(False)
                return

            # 新增：检查文件是否被占用
            try:
                with open(self.excel_path, 'rb') as test_file:
                    pass
            except IOError:
                self.message.emit("错误: 文件被其他程序占用或权限不足")
                return

            # 检查Pillow是否安装
            if not has_pillow and self.output_ext != "keep":
                self.message.emit("错误: 未安装Pillow库，无法转换图片格式! 请执行: pip install pillow")
                self.finished.emit(False)
                return

            # 读取Excel数据
            self.message.emit(f"正在读取Excel文件（引擎: {engine}）...")
            df = pd.read_excel(self.excel_path, engine=engine)
            # 检查字段是否存在
            if self.input_field not in df.columns or self.output_field not in df.columns:
                self.message.emit(f"错误: Excel中缺少必要的字段 - {self.input_field} 或 {self.output_field}")
                self.finished.emit(False)
                return
            df[self.input_field] = df[self.input_field].astype(str).str.strip()

            if df.empty:
                self.message.emit("错误: Excel文件为空或未找到有效数据!")
                self.finished.emit(False)
                return

            self.message.emit(f"成功读取Excel: 共{len(df)}条记录")

            # 创建映射字典
            name_map = df.set_index(self.input_field)[self.output_field].to_dict()
            # 创建小写映射字典用于大小写不敏感匹配
            lower_map = {str(k).lower(): (v, k) for k, v in name_map.items()}

            # 确保输出目录存在
            os.makedirs(self.output_dir, exist_ok=True)
            self.message.emit(f"输出目录: {self.output_dir}")
            self.message.emit(f"输出格式: {self.output_ext if self.output_ext != 'keep' else '保持原格式'}")

            # 支持的图片格式
            img_exts = ('.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.tif', '.webp')

            # 获取所有图片文件
            all_files = [f for f in os.listdir(self.img_dir)
                         if os.path.isfile(os.path.join(self.img_dir, f))]
            image_files = [f for f in all_files if os.path.splitext(f)[1].lower() in img_exts]
            total_files = len(image_files)

            if not image_files:
                self.message.emit("错误: 未找到任何图片文件!")
                self.finished.emit(False)
                return

            processed = 0
            log_buffer = []  # 日志缓冲区

            # 处理图片文件
            for filename in image_files:
                file_path = os.path.join(self.img_dir, filename)
                file_base, orig_ext = os.path.splitext(filename)
                ksh = file_base.strip()

                # 大小写不敏感匹配
                ksh_lower = ksh.lower()
                if ksh_lower in lower_map:
                    sfz, actual_key = lower_map[ksh_lower]

                    # 确定输出格式
                    if self.output_ext == "keep":
                        output_ext = orig_ext
                    else:
                        # 标准化扩展名格式
                        ext_str = self.output_ext.strip().lower()
                        if not ext_str.startswith('.'):
                            ext_str = '.' + ext_str
                        output_ext = ext_str

                    # 构建基础新文件名
                    base_name = f"{sfz}{output_ext}"

                    # 避免文件名冲突
                    counter = 1
                    new_name = base_name
                    while os.path.exists(os.path.join(self.output_dir, new_name)):
                        new_name = f"{sfz}_{counter}{output_ext}"
                        counter += 1

                    dest_path = os.path.join(self.output_dir, new_name)

                    try:
                        # 格式转换处理
                        if self.output_ext != "keep" and output_ext.lower() != orig_ext.lower():
                            # 检查是否支持该格式
                            SUPPORTED_FORMATS = {'jpg', 'jpeg', 'png', 'gif'}
                            if output_ext[1:] not in SUPPORTED_FORMATS:
                                log_buffer.append(f"警告: 不支持的格式 {output_ext}，使用复制代替转换")
                                shutil.copy2(file_path, dest_path)
                            else:
                                img = Image.open(file_path)
                                # 转换格式并保存
                                if output_ext.lower() in ['.jpg', '.jpeg']:
                                    img.save(dest_path, 'JPEG', quality=95)
                                elif output_ext.lower() == '.png':
                                    img.save(dest_path, 'PNG')
                                elif output_ext.lower() == '.gif':
                                    img.save(dest_path, 'GIF')
                                else:
                                    img.save(dest_path)
                                log_buffer.append(f"转换成功: {filename} → {new_name}")
                        else:
                            # 直接复制文件
                            shutil.copy2(file_path, dest_path)
                            log_buffer.append(f"转换成功: {filename} → {new_name}")

                    except Exception as e:
                        log_buffer.append(f"文件处理失败[{filename}]: {str(e)}")
                else:
                    # 获取前3个样本键（如果有）
                    sample_keys = list(name_map.keys())[:3] if name_map else []
                    log_buffer.append(f"未匹配: {filename} | 样本考生号: {sample_keys}...")

                processed += 1

                # 每处理10个文件或最后一批，刷新日志和进度
                if processed % 10 == 0 or processed == total_files:
                    for msg in log_buffer:
                        self.message.emit(msg)
                    log_buffer = []

                    progress = int(processed / total_files * 100)
                    self.progress.emit(progress)

            self.message.emit(f"处理完成! 成功处理 {processed}/{total_files} 个文件")
            self.finished.emit(True)

        except Exception as e:
            self.message.emit(f"处理出错: {str(e)}")
            import traceback
            self.message.emit(traceback.format_exc())
            self.finished.emit(False)


class ImageRenamer(QWidget):
    def __init__(self):
        super().__init__()
        self.initUI()

    def initUI(self):
        self.setWindowTitle('考生照片重命名工具')
        self.setWindowIcon(QIcon("s.ico")) if os.path.exists("s.ico") else None
        self.setGeometry(300, 300, 650, 550)

        # 创建布局
        layout = QVBoxLayout()
        layout.setSpacing(10)

        # Excel文件选择与字段选择
        excel_layout = QHBoxLayout()
        self.excel_label = QLabel('Excel文件路径:')
        self.excel_input = QLineEdit()
        self.excel_input.setReadOnly(True)
        self.excel_input.setPlaceholderText("选择包含所需转换信息的Excel文件")
        self.excel_btn = QPushButton('浏览...')
        self.excel_btn.clicked.connect(self.select_excel)
        
        # 字段选择控件
        self.input_field_label = QLabel('将字段:')
        self.input_field_combo = QComboBox()
        self.input_field_combo.setMaximumWidth(120)
        self.output_field_label = QLabel('转为:')
        self.output_field_combo = QComboBox()
        self.output_field_combo.setMaximumWidth(120)
        
        excel_layout.addWidget(self.excel_label)
        excel_layout.addWidget(self.excel_input, 1)
        excel_layout.addWidget(self.excel_btn)
        excel_layout.addSpacing(15)
        excel_layout.addWidget(self.input_field_label)
        excel_layout.addWidget(self.input_field_combo)
        excel_layout.addWidget(self.output_field_label)
        excel_layout.addWidget(self.output_field_combo)

        # 图片目录选择
        img_layout = QHBoxLayout()
        self.img_label = QLabel('原始图片目录:')
        self.img_input = QLineEdit()
        self.img_input.setReadOnly(True)
        self.img_input.setPlaceholderText("选择包含考生照片的目录")
        self.img_btn = QPushButton('浏览...')
        self.img_btn.clicked.connect(self.select_img_dir)
        img_layout.addWidget(self.img_label)
        img_layout.addWidget(self.img_input, 1)
        img_layout.addWidget(self.img_btn)

        # 输出目录选择
        output_layout = QHBoxLayout()
        self.output_label = QLabel('输出目录:')
        self.output_input = QLineEdit()
        self.output_input.setReadOnly(True)
        self.output_input.setPlaceholderText("选择处理后的图片保存位置")
        self.output_btn = QPushButton('浏览...')
        self.output_btn.clicked.connect(self.select_output_dir)
        output_layout.addWidget(self.output_label)
        output_layout.addWidget(self.output_input, 1)
        output_layout.addWidget(self.output_btn)

        # 输出格式选择
        format_layout = QHBoxLayout()
        self.format_label = QLabel('输出格式:')
        self.format_combo = QComboBox()
        self.format_combo.addItems(['保持原格式', 'JPG格式', 'JPEG格式', 'PNG格式', 'GIF格式'])
        self.format_combo.setItemData(0, "keep", role=Qt.UserRole)  # 设置数据关联
        self.format_label.setToolTip("选择'保持原格式'将不转换图片格式")
        format_layout.addWidget(self.format_label)
        format_layout.addWidget(self.format_combo, 1)

        # 操作按钮
        btn_layout = QHBoxLayout()
        self.run_btn = QPushButton('开始处理')
        self.run_btn.setStyleSheet("background-color: #4CAF50; color: white; font-weight: bold;")
        self.run_btn.clicked.connect(self.start_renaming)
        self.run_btn.setEnabled(False)

        self.stop_btn = QPushButton('停止处理')
        self.stop_btn.setStyleSheet("background-color: #f44336; color: white;")
        self.stop_btn.setEnabled(False)
        btn_layout.addWidget(self.run_btn)
        btn_layout.addWidget(self.stop_btn)

        # 进度条
        self.progress = QProgressBar()
        self.progress.setRange(0, 100)
        self.progress.setValue(0)
        self.progress.setFormat("等待开始...")

        # 日志区域
        log_layout = QVBoxLayout()
        log_layout.addWidget(QLabel('操作日志:'))
        self.log = QTextEdit()
        self.log.setReadOnly(True)
        self.log.setPlaceholderText("操作日志将显示在这里...")
        log_layout.addWidget(self.log, 1)

        # 添加所有控件到主布局
        layout.addLayout(excel_layout)
        layout.addLayout(img_layout)
        layout.addLayout(output_layout)
        layout.addLayout(format_layout)
        layout.addLayout(btn_layout)
        layout.addWidget(self.progress)
        layout.addLayout(log_layout)

        self.setLayout(layout)

    def select_excel(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "选择Excel文件", "", "Excel文件 (*.xlsx *.xls);;所有文件 (*)"
        )
        if path:
            self.excel_input.setText(path)
            # 读取Excel列名并填充下拉框
            try:
                # 根据文件扩展名选择引擎
                if path.lower().endswith('.xlsx'):
                    engine = 'openpyxl'
                elif path.lower().endswith('.xls'):
                    engine = 'xlrd'
                else:
                    self.log.append("不支持的文件格式")
                    return
                # 只读取表头来获取列名
                df = pd.read_excel(path, engine=engine, nrows=0)
                columns = df.columns.tolist()
                self.input_field_combo.clear()
                self.output_field_combo.clear()
                self.input_field_combo.addItems(columns)
                self.output_field_combo.addItems(columns)
                # 默认选择ksh和sfz如果存在
                if 'ksh' in columns:
                    self.input_field_combo.setCurrentText('ksh')
                if 'sfz' in columns:
                    self.output_field_combo.setCurrentText('sfz')
            except Exception as e:
                self.log.append(f"读取Excel列名失败: {str(e)}")
            self.check_ready()

    def select_img_dir(self):
        path = QFileDialog.getExistingDirectory(self, "选择图片目录")
        if path:
            self.img_input.setText(path)
            self.check_ready()

    def select_output_dir(self):
        path = QFileDialog.getExistingDirectory(self, "选择输出目录")
        if path:
            self.output_input.setText(path)
            self.check_ready()

    def check_ready(self):
        """修复点：确保返回布尔值而非字符串"""
        excel_filled = bool(self.excel_input.text().strip())
        img_filled = bool(self.img_input.text().strip())
        output_filled = bool(self.output_input.text().strip())
        fields_selected = bool(self.input_field_combo.currentText() and self.output_field_combo.currentText())
        
        ready = excel_filled and img_filled and output_filled and fields_selected
        self.run_btn.setEnabled(ready)

    def start_renaming(self):
        # 禁用按钮防止重复操作
        self.run_btn.setEnabled(False)
        self.stop_btn.setEnabled(True)
        self.log.clear()
        self.log.append("开始处理...")
        self.progress.setFormat("处理中...")

        # 获取输出格式（将UI文本转换为内部标识）
        output_ext = self.format_combo.currentText()
        if output_ext == "保持原格式":
            output_ext_for_thread = "keep"
        else:
            # 从"JPG格式"中提取"jpg"
            output_ext_for_thread = output_ext.replace("格式", "").strip().lower()

        # 创建工作线程
        self.thread = RenameThread(
            excel_path=self.excel_input.text(),
            img_dir=self.img_input.text(),
            output_dir=self.output_input.text(),
            output_ext=output_ext_for_thread,
            input_field=self.input_field_combo.currentText(),
            output_field=self.output_field_combo.currentText()
        )

        # 连接信号
        self.thread.message.connect(self.log.append)
        self.thread.progress.connect(self.progress.setValue)
        self.thread.finished.connect(self.on_finished)
        self.stop_btn.clicked.connect(self.thread.terminate)

        # 启动线程
        self.thread.start()

    def on_finished(self, success):
        self.progress.setFormat("已完成!" if success else "已失败!")
        self.run_btn.setEnabled(True)
        self.stop_btn.setEnabled(False)
        self.log.append("操作已完成!" if success else "操作失败!")


if __name__ == "__main__":
    app = QApplication(sys.argv)
    window = ImageRenamer()
    window.show()
    sys.exit(app.exec_())