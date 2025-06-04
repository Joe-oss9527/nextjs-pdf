#!/usr/bin/env python3
"""
优化的PDF合并服务类
支持流式处理、内存优化和企业级错误处理
"""

import os
import sys
import json
import logging
import fitz  # PyMuPDF
from datetime import datetime
from urllib.parse import urlparse
from typing import Dict, List, Optional, Callable, Any
import gc
import psutil
import time

class PDFMergerError(Exception):
    """PDF合并相关异常"""
    pass

class ConfigurationError(PDFMergerError):
    """配置错误异常"""
    pass

class FileProcessingError(PDFMergerError):
    """文件处理异常"""
    pass

class PDFMerger:
    """
    企业级PDF合并服务类
    
    特性：
    - 流式处理，避免内存溢出
    - 完整的错误处理和恢复机制
    - 进度跟踪和性能监控
    - 配置驱动和灵活扩展
    - 内存使用优化
    """
    
    def __init__(self, config_path: str = 'config.json', logger: Optional[logging.Logger] = None):
        """
        初始化PDF合并器
        
        Args:
            config_path: 配置文件路径
            logger: 可选的日志记录器
        """
        self.config_path = config_path
        self.logger = logger or self._setup_logger()
        
        # 加载配置
        self.config = self._load_config(config_path)
        
        # 设置路径
        self.pdf_dir = self.config['pdfDir']
        self.metadata_dir = os.path.join(
            self.pdf_dir, 
            self.config.get('metadata', {}).get('directory', 'metadata')
        )
        self.final_pdf_dir = os.path.join(
            self.pdf_dir, 
            self.config.get('output', {}).get('finalPdfDirectory', 'finalPdf')
        )
        
        # 性能监控
        self.stats = {
            'files_processed': 0,
            'total_pages': 0,
            'start_time': None,
            'memory_peak': 0,
            'errors': []
        }
        
        # 加载文章标题
        self.article_titles = self._load_article_titles()
        
        self.logger.info(f"PDF合并器初始化完成 - PDF目录: {self.pdf_dir}")

    def _setup_logger(self) -> logging.Logger:
        """设置默认日志记录器"""
        logger = logging.getLogger('PDFMerger')
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
        return logger

    def _load_config(self, config_path: str) -> Dict[str, Any]:
        """
        加载配置文件
        
        Args:
            config_path: 配置文件路径
            
        Returns:
            配置字典
            
        Raises:
            ConfigurationError: 配置加载失败
        """
        try:
            if not os.path.exists(config_path):
                raise ConfigurationError(f"配置文件不存在: {config_path}")
            
            with open(config_path, 'r', encoding='utf-8') as f:
                config = json.load(f)
            
            # 验证必需的配置项
            required_keys = ['rootURL', 'pdfDir']
            for key in required_keys:
                if key not in config:
                    raise ConfigurationError(f"缺少必需的配置项: {key}")
            
            return config
            
        except json.JSONDecodeError as e:
            raise ConfigurationError(f"配置文件JSON格式错误: {e}")
        except Exception as e:
            raise ConfigurationError(f"配置加载失败: {e}")

    def _load_article_titles(self) -> Dict[str, str]:
        """
        加载文章标题映射
        
        Returns:
            文章标题字典
        """
        article_titles = {}
        
        try:
            # 尝试从元数据目录加载
            metadata_file = os.path.join(self.metadata_dir, 'articleTitles.json')
            if os.path.exists(metadata_file):
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    article_titles = json.load(f)
                    self.logger.info(f"从元数据目录加载了 {len(article_titles)} 个文章标题")
            
            # 回退到PDF目录
            if not article_titles:
                fallback_file = os.path.join(self.pdf_dir, 'articleTitles.json')
                if os.path.exists(fallback_file):
                    with open(fallback_file, 'r', encoding='utf-8') as f:
                        article_titles = json.load(f)
                        self.logger.info(f"从PDF目录加载了 {len(article_titles)} 个文章标题")
                        
        except Exception as e:
            self.logger.warning(f"加载文章标题失败: {e}")
        
        return article_titles

    def _get_pdf_files(self, directory_path: str) -> List[str]:
        """
        获取目录中的PDF文件列表（已排序）
        
        Args:
            directory_path: 目录路径
            
        Returns:
            排序后的PDF文件列表
        """
        try:
            if not os.path.exists(directory_path):
                self.logger.warning(f"目录不存在: {directory_path}")
                return []
            
            files = [
                f for f in os.listdir(directory_path) 
                if f.endswith('.pdf') and os.path.isfile(os.path.join(directory_path, f))
            ]
            
            # 按数字前缀排序
            def get_sort_key(filename: str) -> int:
                try:
                    return int(filename.split('-')[0])
                except (ValueError, IndexError):
                    return 999999  # 将无效格式的文件排到最后
            
            files.sort(key=get_sort_key)
            
            self.logger.info(f"找到 {len(files)} 个PDF文件在 {directory_path}")
            return files
            
        except Exception as e:
            self.logger.error(f"获取PDF文件列表失败: {e}")
            return []

    def _create_bookmark_title(self, filename: str, article_titles: Dict[str, str]) -> str:
        """
        创建书签标题
        
        Args:
            filename: 文件名
            article_titles: 文章标题映射
            
        Returns:
            书签标题
        """
        try:
            # 提取数字前缀
            parts = filename.split('-')
            if len(parts) < 2:
                return os.path.splitext(filename)[0]
            
            number_prefix = parts[0]
            
            # 查找文章标题
            article_title = article_titles.get(number_prefix, '')
            if article_title:
                return article_title
            
            # 回退到清理后的文件名
            cleaned_name = '-'.join(parts[1:])
            return os.path.splitext(cleaned_name)[0]
            
        except Exception as e:
            self.logger.warning(f"创建书签标题失败 {filename}: {e}")
            return os.path.splitext(filename)[0]

    def _monitor_memory(self) -> None:
        """监控内存使用情况"""
        try:
            process = psutil.Process()
            memory_mb = process.memory_info().rss / 1024 / 1024
            self.stats['memory_peak'] = max(self.stats['memory_peak'], memory_mb)
            
            # 如果内存使用超过阈值，强制垃圾回收
            if memory_mb > 500:  # 500MB阈值
                gc.collect()
                self.logger.debug(f"内存使用: {memory_mb:.1f}MB, 已执行垃圾回收")
        except Exception:
            pass  # 内存监控失败不应影响主流程

    def merge_pdfs_stream(
        self, 
        directory_path: str, 
        output_path: str, 
        progress_callback: Optional[Callable[[int, int], None]] = None
    ) -> bool:
        """
        流式合并PDF文件
        
        Args:
            directory_path: 源目录路径
            output_path: 输出文件路径
            progress_callback: 进度回调函数
            
        Returns:
            合并是否成功
            
        Raises:
            FileProcessingError: 文件处理错误
        """
        files = self._get_pdf_files(directory_path)
        if not files:
            self.logger.warning(f"目录中没有PDF文件: {directory_path}")
            return False

        merged_pdf = None
        current_file_pdf = None
        
        try:
            # 确保输出目录存在
            os.makedirs(os.path.dirname(output_path), exist_ok=True)
            
            merged_pdf = fitz.open()  # 创建空的PDF文档
            toc = []  # 目录结构
            
            self.logger.info(f"开始合并 {len(files)} 个PDF文件到 {output_path}")
            
            for i, filename in enumerate(files):
                try:
                    file_path = os.path.join(directory_path, filename)
                    
                    # 打开当前PDF文件
                    current_file_pdf = fitz.open(file_path)
                    page_count = current_file_pdf.page_count
                    
                    if page_count == 0:
                        self.logger.warning(f"跳过空PDF文件: {filename}")
                        current_file_pdf.close()
                        continue
                    
                    # 记录合并前的页数
                    start_page = merged_pdf.page_count
                    
                    # 插入PDF页面
                    merged_pdf.insert_pdf(current_file_pdf)
                    
                    # 创建书签
                    bookmark_title = self._create_bookmark_title(filename, self.article_titles)
                    toc.append([
                        1,  # 级别
                        bookmark_title,  # 标题
                        start_page + 1,  # 页码（从1开始）
                        {"kind": 1, "page": start_page}  # 链接信息
                    ])
                    
                    # 关闭当前文件
                    current_file_pdf.close()
                    current_file_pdf = None
                    
                    # 更新统计
                    self.stats['files_processed'] += 1
                    self.stats['total_pages'] += page_count
                    
                    # 内存监控
                    self._monitor_memory()
                    
                    # 进度回调
                    if progress_callback:
                        progress_callback(i + 1, len(files))
                    
                    self.logger.debug(f"已合并: {filename} ({page_count} 页)")
                    
                except Exception as e:
                    error_msg = f"处理文件失败 {filename}: {e}"
                    self.logger.error(error_msg)
                    self.stats['errors'].append(error_msg)
                    
                    if current_file_pdf:
                        current_file_pdf.close()
                        current_file_pdf = None
                    
                    # 继续处理下一个文件
                    continue
            
            # 设置目录结构
            if toc:
                merged_pdf.set_toc(toc)
                self.logger.info(f"设置了 {len(toc)} 个书签")
            
            # 保存合并后的PDF
            merged_pdf.save(output_path)
            self.logger.info(f"PDF合并完成: {output_path}")
            
            return True
            
        except Exception as e:
            error_msg = f"PDF合并失败: {e}"
            self.logger.error(error_msg)
            self.stats['errors'].append(error_msg)
            raise FileProcessingError(error_msg)
            
        finally:
            # 清理资源
            if current_file_pdf:
                current_file_pdf.close()
            if merged_pdf:
                merged_pdf.close()
            
            # 强制垃圾回收
            gc.collect()

    def merge_directory(self, directory_name: Optional[str] = None) -> List[str]:
        """
        合并指定目录或所有子目录的PDF文件
        
        Args:
            directory_name: 目录名（None表示合并所有）
            
        Returns:
            成功合并的文件列表
        """
        if not os.path.exists(self.pdf_dir):
            raise FileProcessingError(f"PDF目录不存在: {self.pdf_dir}")
        
        # 确保输出目录存在
        os.makedirs(self.final_pdf_dir, exist_ok=True)
        
        # 获取域名和日期
        url = urlparse(self.config['rootURL'])
        domain = url.hostname.replace('.', '_') if url.hostname else 'unknown'
        current_date = datetime.now().strftime('%Y%m%d')
        
        merged_files = []
        
        try:
            if directory_name:
                # 合并指定目录
                directory_path = os.path.join(self.pdf_dir, directory_name)
                if os.path.isdir(directory_path):
                    output_path = os.path.join(
                        self.final_pdf_dir, 
                        f"{directory_name}_{current_date}.pdf"
                    )
                    
                    if self.merge_pdfs_stream(directory_path, output_path):
                        merged_files.append(output_path)
                else:
                    self.logger.warning(f"指定目录不存在: {directory_path}")
            else:
                # 首先合并根目录
                root_output_path = os.path.join(
                    self.final_pdf_dir, 
                    f"{domain}_{current_date}.pdf"
                )
                
                if self.merge_pdfs_stream(self.pdf_dir, root_output_path):
                    merged_files.append(root_output_path)
                
                # 然后合并所有子目录
                for item in os.listdir(self.pdf_dir):
                    item_path = os.path.join(self.pdf_dir, item)
                    
                    # 跳过非目录和特殊目录
                    if not os.path.isdir(item_path) or item in ['finalPdf', 'metadata', '.temp']:
                        continue
                    
                    output_path = os.path.join(
                        self.final_pdf_dir, 
                        f"{item}_{current_date}.pdf"
                    )
                    
                    if self.merge_pdfs_stream(item_path, output_path):
                        merged_files.append(output_path)
            
            return merged_files
            
        except Exception as e:
            error_msg = f"目录合并失败: {e}"
            self.logger.error(error_msg)
            raise FileProcessingError(error_msg)

    def get_statistics(self) -> Dict[str, Any]:
        """
        获取合并统计信息
        
        Returns:
            统计信息字典
        """
        elapsed_time = 0
        if self.stats['start_time']:
            elapsed_time = time.time() - self.stats['start_time']
        
        return {
            'files_processed': self.stats['files_processed'],
            'total_pages': self.stats['total_pages'],
            'elapsed_time': elapsed_time,
            'memory_peak_mb': self.stats['memory_peak'],
            'errors_count': len(self.stats['errors']),
            'errors': self.stats['errors'][-10],  # 最近10个错误
            'avg_pages_per_file': (
                self.stats['total_pages'] / self.stats['files_processed'] 
                if self.stats['files_processed'] > 0 else 0
            ),
            'processing_speed': (
                self.stats['files_processed'] / elapsed_time 
                if elapsed_time > 0 else 0
            )
        }

    def run(self) -> Dict[str, Any]:
        """
        运行PDF合并任务
        
        Returns:
            执行结果和统计信息
        """
        self.stats['start_time'] = time.time()
        self.logger.info("开始PDF合并任务")
        
        try:
            # 执行合并
            merged_files = self.merge_directory()
            
            # 获取统计信息
            stats = self.get_statistics()
            
            result = {
                'success': True,
                'merged_files': merged_files,
                'statistics': stats
            }
            
            self.logger.info(f"PDF合并任务完成: 处理了 {stats['files_processed']} 个文件, "
                           f"共 {stats['total_pages']} 页, "
                           f"用时 {stats['elapsed_time']:.1f} 秒")
            
            return result
            
        except Exception as e:
            error_msg = f"PDF合并任务失败: {e}"
            self.logger.error(error_msg)
            
            return {
                'success': False,
                'error': error_msg,
                'statistics': self.get_statistics()
            }

def main():
    """主函数，支持命令行执行"""
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(description='PDF合并工具')
    parser.add_argument('--config', default='config.json', help='配置文件路径')
    parser.add_argument('--directory', help='指定要合并的目录名')
    parser.add_argument('--verbose', '-v', action='store_true', help='详细输出')
    
    args = parser.parse_args()
    
    # 设置日志级别
    if args.verbose:
        logging.basicConfig(level=logging.DEBUG)
    else:
        logging.basicConfig(level=logging.INFO)
    
    try:
        # 创建PDF合并器
        merger = PDFMerger(config_path=args.config)
        
        # 执行合并
        if args.directory:
            merged_files = merger.merge_directory(args.directory)
        else:
            result = merger.run()
            merged_files = result.get('merged_files', [])
        
        # 输出结果
        print(f"\n✅ 合并完成! 生成了 {len(merged_files)} 个PDF文件:")
        for file_path in merged_files:
            print(f"  📄 {file_path}")
        
        # 输出统计信息
        stats = merger.get_statistics()
        print(f"\n📊 统计信息:")
        print(f"  - 处理文件数: {stats['files_processed']}")
        print(f"  - 总页数: {stats['total_pages']}")
        print(f"  - 用时: {stats['elapsed_time']:.1f} 秒")
        print(f"  - 内存峰值: {stats['memory_peak_mb']:.1f} MB")
        
        if stats['errors_count'] > 0:
            print(f"  ⚠️  错误数: {stats['errors_count']}")
        
        return 0
        
    except Exception as e:
        print(f"❌ 执行失败: {e}", file=sys.stderr)
        return 1

if __name__ == '__main__':
    sys.exit(main())