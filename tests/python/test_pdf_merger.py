#!/usr/bin/env python3
"""
PDF合并功能测试套件
"""

import unittest
import os
import json
import tempfile
import shutil
import fitz  # PyMuPDF
from unittest.mock import Mock, patch, MagicMock
import sys

# 添加src路径以便导入模块
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'src', 'python'))

from pdf_merger import PDFMerger, PDFMergerError, ConfigurationError, FileProcessingError
from config_manager import ConfigManager, ConfigValidationError

class TestPDFMerger(unittest.TestCase):
    """PDF合并器测试类"""
    
    def setUp(self):
        """测试设置"""
        # 创建临时目录
        self.temp_dir = tempfile.mkdtemp()
        self.pdf_dir = os.path.join(self.temp_dir, 'pdfs')
        self.metadata_dir = os.path.join(self.pdf_dir, 'metadata')
        self.final_pdf_dir = os.path.join(self.pdf_dir, 'finalPdf')
        
        # 创建目录结构
        os.makedirs(self.pdf_dir, exist_ok=True)
        os.makedirs(self.metadata_dir, exist_ok=True)
        os.makedirs(self.final_pdf_dir, exist_ok=True)
        
        # 创建测试配置
        self.config = {
            'rootURL': 'https://test.example.com/docs',
            'pdfDir': self.pdf_dir,
            'concurrency': 2,
            'metadata': {
                'enabled': True,
                'directory': 'metadata'
            },
            'output': {
                'finalPdfDirectory': 'finalPdf',
                'tempDirectory': '.temp'
            }
        }
        
        # 保存配置文件
        self.config_path = os.path.join(self.temp_dir, 'test_config.json')
        with open(self.config_path, 'w', encoding='utf-8') as f:
            json.dump(self.config, f, indent=2)
        
        # 创建测试文章标题
        self.article_titles = {
            '1': '第一章：介绍',
            '2': '第二章：基础概念',
            '3': '第三章：高级功能'
        }
        
        # 保存文章标题
        titles_path = os.path.join(self.metadata_dir, 'articleTitles.json')
        with open(titles_path, 'w', encoding='utf-8') as f:
            json.dump(self.article_titles, f, indent=2, ensure_ascii=False)
        
        # 创建测试PDF文件
        self._create_test_pdfs()
    
    def tearDown(self):
        """测试清理"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def _create_test_pdfs(self):
        """创建测试用的PDF文件"""
        pdf_files = [
            '1-introduction.pdf',
            '2-basic-concepts.pdf',
            '3-advanced-features.pdf'
        ]
        
        for filename in pdf_files:
            pdf_path = os.path.join(self.pdf_dir, filename)
            # 创建简单的PDF文件
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((100, 100), f"Content of {filename}")
            doc.save(pdf_path)
            doc.close()
        
        # 创建子目录的PDF文件
        subdir_path = os.path.join(self.pdf_dir, 'advanced')
        os.makedirs(subdir_path, exist_ok=True)
        
        for i, filename in enumerate(['1-advanced-topic.pdf', '2-expert-guide.pdf'], 1):
            pdf_path = os.path.join(subdir_path, filename)
            doc = fitz.open()
            page = doc.new_page()
            page.insert_text((100, 100), f"Advanced content {i}")
            doc.save(pdf_path)
            doc.close()
    
    def test_pdf_merger_initialization(self):
        """测试PDF合并器初始化"""
        merger = PDFMerger(self.config_path)
        
        self.assertIsNotNone(merger.config)
        self.assertEqual(merger.pdf_dir, self.pdf_dir)
        self.assertIsInstance(merger.article_titles, dict)
        self.assertEqual(len(merger.article_titles), 3)
    
    def test_invalid_config_path(self):
        """测试无效配置路径"""
        with self.assertRaises(ConfigurationError):
            PDFMerger('nonexistent_config.json')
    
    def test_load_article_titles(self):
        """测试文章标题加载"""
        merger = PDFMerger(self.config_path)
        
        self.assertEqual(merger.article_titles['1'], '第一章：介绍')
        self.assertEqual(merger.article_titles['2'], '第二章：基础概念')
        self.assertEqual(merger.article_titles['3'], '第三章：高级功能')
    
    def test_get_pdf_files(self):
        """测试获取PDF文件列表"""
        merger = PDFMerger(self.config_path)
        files = merger._get_pdf_files(self.pdf_dir)
        
        self.assertEqual(len(files), 3)
        self.assertEqual(files[0], '1-introduction.pdf')
        self.assertEqual(files[1], '2-basic-concepts.pdf')
        self.assertEqual(files[2], '3-advanced-features.pdf')
    
    def test_get_pdf_files_empty_directory(self):
        """测试空目录的PDF文件获取"""
        empty_dir = os.path.join(self.temp_dir, 'empty')
        os.makedirs(empty_dir, exist_ok=True)
        
        merger = PDFMerger(self.config_path)
        files = merger._get_pdf_files(empty_dir)
        
        self.assertEqual(len(files), 0)
    
    def test_create_bookmark_title(self):
        """测试书签标题创建"""
        merger = PDFMerger(self.config_path)
        
        # 测试有文章标题的情况
        title1 = merger._create_bookmark_title('1-introduction.pdf', merger.article_titles)
        self.assertEqual(title1, '第一章：介绍')
        
        # 测试没有文章标题的情况
        title2 = merger._create_bookmark_title('99-unknown.pdf', merger.article_titles)
        self.assertEqual(title2, 'unknown')
        
        # 测试无效格式的文件名
        title3 = merger._create_bookmark_title('invalid-filename.pdf', merger.article_titles)
        self.assertEqual(title3, 'invalid-filename')
    
    @patch('psutil.Process')
    def test_monitor_memory(self, mock_process):
        """测试内存监控"""
        # 模拟内存信息
        mock_memory_info = Mock()
        mock_memory_info.rss = 100 * 1024 * 1024  # 100MB
        mock_process.return_value.memory_info.return_value = mock_memory_info
        
        merger = PDFMerger(self.config_path)
        merger._monitor_memory()
        
        self.assertGreater(merger.stats['memory_peak'], 0)
    
    def test_merge_pdfs_stream_success(self):
        """测试PDF流式合并成功案例"""
        merger = PDFMerger(self.config_path)
        output_path = os.path.join(self.final_pdf_dir, 'merged_test.pdf')
        
        # 进度回调测试
        progress_calls = []
        def progress_callback(current, total):
            progress_calls.append((current, total))
        
        result = merger.merge_pdfs_stream(
            self.pdf_dir, 
            output_path, 
            progress_callback=progress_callback
        )
        
        # 验证结果
        self.assertTrue(result)
        self.assertTrue(os.path.exists(output_path))
        
        # 验证进度回调
        self.assertEqual(len(progress_calls), 3)
        self.assertEqual(progress_calls[-1], (3, 3))
        
        # 验证统计信息
        self.assertEqual(merger.stats['files_processed'], 3)
        self.assertGreater(merger.stats['total_pages'], 0)
        
        # 验证合并后的PDF
        merged_pdf = fitz.open(output_path)
        self.assertGreater(merged_pdf.page_count, 0)
        
        # 验证目录结构
        toc = merged_pdf.get_toc()
        self.assertEqual(len(toc), 3)
        self.assertEqual(toc[0][1], '第一章：介绍')  # 第一个书签应该是文章标题
        
        merged_pdf.close()
    
    def test_merge_pdfs_stream_empty_directory(self):
        """测试空目录的PDF合并"""
        empty_dir = os.path.join(self.temp_dir, 'empty')
        os.makedirs(empty_dir, exist_ok=True)
        
        merger = PDFMerger(self.config_path)
        output_path = os.path.join(self.final_pdf_dir, 'empty_merge.pdf')
        
        result = merger.merge_pdfs_stream(empty_dir, output_path)
        
        self.assertFalse(result)
        self.assertFalse(os.path.exists(output_path))
    
    def test_merge_pdfs_stream_invalid_pdf(self):
        """测试包含无效PDF文件的合并"""
        # 创建一个无效的PDF文件
        invalid_pdf_path = os.path.join(self.pdf_dir, '4-invalid.pdf')
        with open(invalid_pdf_path, 'w') as f:
            f.write('This is not a valid PDF file')
        
        merger = PDFMerger(self.config_path)
        output_path = os.path.join(self.final_pdf_dir, 'with_invalid.pdf')
        
        # 应该跳过无效文件，继续处理其他文件
        result = merger.merge_pdfs_stream(self.pdf_dir, output_path)
        
        self.assertTrue(result)  # 应该成功，尽管有无效文件
        self.assertGreater(len(merger.stats['errors']), 0)  # 应该记录错误
    
    def test_merge_directory_all(self):
        """测试合并所有目录"""
        merger = PDFMerger(self.config_path)
        merged_files = merger.merge_directory()
        
        # 应该生成根目录和子目录的合并文件
        self.assertGreater(len(merged_files), 0)
        
        # 验证文件存在
        for file_path in merged_files:
            self.assertTrue(os.path.exists(file_path))
            
            # 验证文件名格式
            filename = os.path.basename(file_path)
            self.assertTrue(filename.endswith('.pdf'))
            self.assertIn('_', filename)  # 应该包含日期
    
    def test_merge_directory_specific(self):
        """测试合并指定目录"""
        merger = PDFMerger(self.config_path)
        merged_files = merger.merge_directory('advanced')
        
        self.assertEqual(len(merged_files), 1)
        
        # 验证文件内容
        merged_file = merged_files[0]
        self.assertTrue(os.path.exists(merged_file))
        
        # 验证PDF内容
        pdf = fitz.open(merged_file)
        self.assertGreater(pdf.page_count, 0)
        pdf.close()
    
    def test_merge_directory_nonexistent(self):
        """测试合并不存在的目录"""
        merger = PDFMerger(self.config_path)
        merged_files = merger.merge_directory('nonexistent')
        
        self.assertEqual(len(merged_files), 0)
    
    def test_get_statistics(self):
        """测试统计信息获取"""
        merger = PDFMerger(self.config_path)
        merger.stats['start_time'] = merger.stats.get('start_time') or 1000.0
        merger.stats['files_processed'] = 5
        merger.stats['total_pages'] = 50
        merger.stats['memory_peak'] = 200.5
        merger.stats['errors'] = ['Error 1', 'Error 2']
        
        stats = merger.get_statistics()
        
        self.assertEqual(stats['files_processed'], 5)
        self.assertEqual(stats['total_pages'], 50)
        self.assertEqual(stats['memory_peak_mb'], 200.5)
        self.assertEqual(stats['errors_count'], 2)
        self.assertEqual(stats['avg_pages_per_file'], 10.0)
        self.assertGreater(stats['elapsed_time'], 0)
        self.assertGreater(stats['processing_speed'], 0)
    
    def test_run_success(self):
        """测试完整运行流程成功案例"""
        merger = PDFMerger(self.config_path)
        result = merger.run()
        
        self.assertTrue(result['success'])
        self.assertIn('merged_files', result)
        self.assertIn('statistics', result)
        self.assertGreater(len(result['merged_files']), 0)
        
        # 验证统计信息
        stats = result['statistics']
        self.assertGreater(stats['files_processed'], 0)
        self.assertGreater(stats['total_pages'], 0)
    
    def test_run_with_missing_pdf_dir(self):
        """测试PDF目录不存在的情况"""
        # 修改配置指向不存在的目录
        bad_config = self.config.copy()
        bad_config['pdfDir'] = '/nonexistent/directory'
        
        bad_config_path = os.path.join(self.temp_dir, 'bad_config.json')
        with open(bad_config_path, 'w') as f:
            json.dump(bad_config, f)
        
        merger = PDFMerger(bad_config_path)
        result = merger.run()
        
        self.assertFalse(result['success'])
        self.assertIn('error', result)

class TestConfigManager(unittest.TestCase):
    """配置管理器测试类"""
    
    def setUp(self):
        """测试设置"""
        self.temp_dir = tempfile.mkdtemp()
        self.valid_config = {
            'rootURL': 'https://test.example.com/docs',
            'pdfDir': 'pdfs',
            'concurrency': 3,
            'navLinksSelector': 'nav a',
            'contentSelector': 'article',
            'ignoreURLs': ['ignore1', 'ignore2'],
            'allowedDomains': ['test.example.com']
        }
        
        self.config_path = os.path.join(self.temp_dir, 'test_config.json')
        with open(self.config_path, 'w') as f:
            json.dump(self.valid_config, f, indent=2)
    
    def tearDown(self):
        """测试清理"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def test_config_manager_load_success(self):
        """测试配置管理器成功加载"""
        manager = ConfigManager(self.config_path)
        config = manager.load()
        
        self.assertIsInstance(config, dict)
        self.assertEqual(config['rootURL'], self.valid_config['rootURL'])
        self.assertEqual(config['pdfDir'], self.valid_config['pdfDir'])
    
    def test_config_manager_missing_file(self):
        """测试配置文件不存在"""
        manager = ConfigManager('nonexistent.json')
        
        with self.assertRaises(ConfigValidationError):
            manager.load()
    
    def test_config_manager_invalid_json(self):
        """测试无效JSON格式"""
        invalid_json_path = os.path.join(self.temp_dir, 'invalid.json')
        with open(invalid_json_path, 'w') as f:
            f.write('{ invalid json }')
        
        manager = ConfigManager(invalid_json_path)
        
        with self.assertRaises(ConfigValidationError):
            manager.load()
    
    def test_config_manager_missing_required_key(self):
        """测试缺少必需配置项"""
        incomplete_config = {'pdfDir': 'pdfs'}  # 缺少rootURL
        
        incomplete_config_path = os.path.join(self.temp_dir, 'incomplete.json')
        with open(incomplete_config_path, 'w') as f:
            json.dump(incomplete_config, f)
        
        manager = ConfigManager(incomplete_config_path)
        
        with self.assertRaises(ConfigValidationError):
            manager.load()
    
    def test_config_manager_type_validation(self):
        """测试类型验证"""
        invalid_type_config = self.valid_config.copy()
        invalid_type_config['concurrency'] = 'not_a_number'
        
        invalid_type_path = os.path.join(self.temp_dir, 'invalid_type.json')
        with open(invalid_type_path, 'w') as f:
            json.dump(invalid_type_config, f)
        
        manager = ConfigManager(invalid_type_path)
        
        with self.assertRaises(ConfigValidationError):
            manager.load()
    
    def test_config_manager_get_method(self):
        """测试配置获取方法"""
        manager = ConfigManager(self.config_path)
        manager.load()
        
        # 测试简单键访问
        self.assertEqual(manager.get('rootURL'), self.valid_config['rootURL'])
        self.assertEqual(manager.get('concurrency'), self.valid_config['concurrency'])
        
        # 测试默认值
        self.assertEqual(manager.get('nonexistent', 'default'), 'default')
        
        # 测试嵌套键访问（如果有的话）
        self.assertIsNotNone(manager.get('metadata.enabled'))
    
    def test_config_manager_environment_variables(self):
        """测试环境变量处理"""
        with patch.dict(os.environ, {'PDF_DIR': 'env_pdfs', 'CONCURRENCY': '10'}):
            manager = ConfigManager(self.config_path)
            config = manager.load()
            
            self.assertEqual(config['pdfDir'], 'env_pdfs')
            self.assertEqual(config['concurrency'], 10)
    
    def test_config_manager_pdf_config(self):
        """测试PDF配置获取"""
        manager = ConfigManager(self.config_path)
        manager.load()
        
        pdf_config = manager.get_pdf_config()
        
        self.assertIn('pdf_dir', pdf_config)
        self.assertIn('final_pdf_dir', pdf_config)
        self.assertIn('metadata_dir', pdf_config)
        self.assertIn('max_memory_mb', pdf_config)

class IntegrationTest(unittest.TestCase):
    """集成测试类"""
    
    def setUp(self):
        """集成测试设置"""
        self.temp_dir = tempfile.mkdtemp()
        self.pdf_dir = os.path.join(self.temp_dir, 'pdfs')
        os.makedirs(self.pdf_dir, exist_ok=True)
        
        # 创建完整的配置
        self.config = {
            'rootURL': 'https://integration.test.com/docs',
            'pdfDir': self.pdf_dir,
            'concurrency': 2,
            'metadata': {
                'enabled': True,
                'directory': 'metadata'
            },
            'output': {
                'finalPdfDirectory': 'finalPdf'
            }
        }
        
        self.config_path = os.path.join(self.temp_dir, 'integration_config.json')
        with open(self.config_path, 'w') as f:
            json.dump(self.config, f, indent=2)
        
        # 创建测试数据
        self._create_integration_test_data()
    
    def tearDown(self):
        """集成测试清理"""
        shutil.rmtree(self.temp_dir, ignore_errors=True)
    
    def _create_integration_test_data(self):
        """创建集成测试数据"""
        # 创建元数据目录和文件
        metadata_dir = os.path.join(self.pdf_dir, 'metadata')
        os.makedirs(metadata_dir, exist_ok=True)
        
        article_titles = {
            '1': 'Integration Test Chapter 1',
            '2': 'Integration Test Chapter 2'
        }
        
        with open(os.path.join(metadata_dir, 'articleTitles.json'), 'w') as f:
            json.dump(article_titles, f, ensure_ascii=False, indent=2)
        
        # 创建测试PDF文件
        for i in range(1, 3):
            pdf_path = os.path.join(self.pdf_dir, f'{i}-chapter-{i}.pdf')
            doc = fitz.open()
            
            # 添加多页内容
            for page_num in range(3):
                page = doc.new_page()
                page.insert_text(
                    (100, 100 + page_num * 50), 
                    f"Chapter {i}, Page {page_num + 1} content"
                )
            
            doc.save(pdf_path)
            doc.close()
    
    def test_end_to_end_pdf_merging(self):
        """端到端PDF合并测试"""
        # 初始化配置管理器
        config_manager = ConfigManager(self.config_path)
        config_manager.load()
        config_manager.create_missing_directories()
        
        # 初始化PDF合并器
        merger = PDFMerger(self.config_path)
        
        # 执行完整合并流程
        result = merger.run()
        
        # 验证结果
        self.assertTrue(result['success'])
        self.assertGreater(len(result['merged_files']), 0)
        
        # 验证统计信息
        stats = result['statistics']
        self.assertEqual(stats['files_processed'], 2)
        self.assertEqual(stats['total_pages'], 6)  # 2个文件，每个3页
        
        # 验证生成的PDF文件
        for merged_file in result['merged_files']:
            self.assertTrue(os.path.exists(merged_file))
            
            # 检查PDF内容
            pdf = fitz.open(merged_file)
            self.assertGreater(pdf.page_count, 0)
            
            # 检查目录结构
            toc = pdf.get_toc()
            self.assertGreater(len(toc), 0)
            
            pdf.close()

def run_tests():
    """运行所有测试"""
    # 创建测试套件
    test_suite = unittest.TestSuite()
    
    # 添加测试类
    test_classes = [TestPDFMerger, TestConfigManager, IntegrationTest]
    
    for test_class in test_classes:
        tests = unittest.TestLoader().loadTestsFromTestCase(test_class)
        test_suite.addTests(tests)
    
    # 运行测试
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(test_suite)
    
    return result.wasSuccessful()

if __name__ == '__main__':
    success = run_tests()
    sys.exit(0 if success else 1)