# Next.js 文档 PDF 抓取器

## 环境要求

- Node.js >= 20.0.0

这个项目是一个网页抓取器,它从 Next.js 文档网站获取页面并将其转换为 PDF 文件。它利用 Puppeteer 库来自动化网页浏览过程并从渲染后的网页生成 PDF 文件。

## 特性

- 从 Next.js 文档网站抓取导航链接
- 为每个文档页面生成 PDF 文件
- 根据 URL 模式将 PDF 文件组织到子目录中
- 合并根目录和每个子目录下的 PDF 文件
- 支持使用指数退避重试失败的请求
- 可配置并发抓取任务数
- 日志记录和错误处理

## 开始使用

1. 克隆代码库
2. 安装依赖: `npm install`
3. 通过修改 `config.js` 文件配置项目
4. 运行抓取器: `node main.js`

## 合并PDF文件

合并PDF文件并生成带标签的目录。
请确保已安装`pymupdf`库，若未安装，请执行`pip install pymupdf`进行安装。

```bash
pip install pymupdf
python mergePdf.py
```
> 注意：Node.js 对于生成目录的支持不佳。因此，合并 PDF 文件的脚本是用 Python 编写的，并且需要一个 Python 环境。

## 配置

项目配置位于 `config.js` 文件中,可用选项如下:

- `rootURL`: 需要抓取的网站根URL
- `pdfDir`: 保存PDF文件的目录
- `concurrency`: 最大并发抓取任务数
- `navLinksSelector`: 导航链接的CSS选择器
- `contentSelector`: 主内容区域的CSS选择器  
- `ignoreURLs`: 抓取时需要忽略的URL模式数组

## 项目结构

- `main.js`: 应用程序入口点
- `scraper.js`: 包含用于抓取任务的 `Scraper` 类
- `pdfUtils.js`: 合并PDF文件和确定文件路径的工具函数
- `fileUtils.js`: 管理目录的工具函数
- `utils.js`: 滚动和延迟的辅助函数
- `config.js`: 项目配置文件

## 依赖项

- `puppeteer`: 用于自动化网页浏览的库
- `async`: 管理异步控制流的库
- `pdf-lib`: 用于操作和合并PDF文件的库

## 许可证

本项目使用 [MIT 许可证](LICENSE)。