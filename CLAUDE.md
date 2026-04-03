# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

学生信息处理工具 (Student Information Processing Tool) is an Electron-based desktop application for managing student information. It provides three main features:

1. **Excel to Word Conversion** - Converts Excel student data into formatted Word documents
2. **Photo Renaming** - Matches and renames student photos based on Excel data with format conversion support
3. **Template Download** - Download Excel template files for consistent data input

## Commands

```bash
npm start          # Run in development mode
npm run build      # Build/pack the application (generates .exe, .zip)
```

## Architecture

- **main.js** - Electron main process, handles IPC communication between renderer and main process
- **index.html** - Frontend UI with sidebar navigation and card-based layout
- **src/converter.js** - Excel to Word conversion using `docx` library, generates formatted tables with student data organized by department/class
- **src/photoRenamer.js** - Photo renaming class that matches photos by student ID (ksh) and renames to ID number (sfz), supports multiple image formats (JPG, PNG, GIF, BMP, TIFF, WebP)

## Key Features

### Excel to Word Converter
- Reads student data from Excel files
- Groups by department (系部) with custom sort order
- Extracts year from class name (e.g., "25gb机器人1班" → 2025)
- Determines education level (本科/专科/专升本) from class name
- Generates formatted Word tables with statistics

### Photo Renamer
- Case-insensitive matching between photo filenames and Excel data
- Supports format conversion (JPG, PNG, GIF, WebP, TIFF)
- Progress tracking via callbacks
- Handles中断恢复 (pause/resume capability)

### Template Download
- Built-in Excel template in `assets/学生信息模板.xlsx`
- Users can download via "下载模板" button
- Saves to user-selected location via system dialog

## Testing

Tests are located in the `tests/` directory:
```bash
node tests/test_converter.js    # Test Excel to Word conversion
```

## Dependencies

Key runtime dependencies:
- `electron` - Desktop framework
- `xlsx` - Excel file processing
- `docx` - Word document generation
- `sharp` - Image format conversion
- `fs-extra` - Enhanced file system operations
- `electron-updater` - Auto-update functionality

## Release Process

### Tags and Releases
Push a `v` prefixed tag to trigger build and release:
```bash
git tag v1.0.1
git push origin v1.0.1
```

GitHub Actions (`.github/workflows/build.yml`) will:
1. Build on Windows, macOS, and Linux
2. Create GitHub Release with all artifacts
3. Sync to Gitee (if `GITEE_TOKEN` configured)

### Release Notes
- File: `RELEASE_NOTES.md` in project root
- **IMPORTANT**: Update this file for every new feature or change
- Format:
  ```markdown
  # 🎉 学生信息处理工具 v1.0.1

  ## 📋 更新内容

  ### 新功能
  - 功能描述

  ### 修复
  - 修复内容

  ## 🔧 技术改进
  - 技术变更

  ---

  **开发者**：yejinxing  
  **邮箱**：yejinxing1728@qq.com  
  **开源协议**：GPL-3.0 License
  ```

### Version Update Steps
1. Update `RELEASE_NOTES.md` with new version and changes
2. Update `package.json` version field
3. Create and push tag:
   ```bash
   git tag v1.0.1
   git push origin v1.0.1
   ```
