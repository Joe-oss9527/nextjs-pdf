#!/usr/bin/env python3
"""
Python配置管理器
用于验证和管理PDF合并相关配置
"""

import os
import json
import logging
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse

class ConfigValidationError(Exception):
    """配置验证异常"""
    pass

class ConfigManager:
    """
    配置管理器类
    
    特性：
    - 配置文件加载和验证
    - 默认值设置
    - 配置项类型检查
    - 路径规范化
    - 环境变量支持
    """
    
    # 默认配置
    DEFAULT_CONFIG = {
        'pdfDir': 'pdfs',
        'concurrency': 5,
        'screenshotDelay': 500,
        'maxRetries': 3,
        'retryDelay': 1000,
        'pageTimeout': 30000,
        'imageTimeout': 10000,
        'logLevel': 'info',
        'metadata': {
            'enabled': True,
            'directory': 'metadata'
        },
        'output': {
            'finalPdfDirectory': 'finalPdf',
            'tempDirectory': '.temp'
        },
        'pdf': {
            'quality': 'high',
            'compression': True,
            'bookmarks': True,
            'maxMemoryMB': 500
        }
    }
    
    # 必需的配置项
    REQUIRED_KEYS = ['rootURL', 'pdfDir']
    
    # 配置项类型映射
    TYPE_MAPPING = {
        'rootURL': str,
        'pdfDir': str,
        'concurrency': int,
        'screenshotDelay': int,
        'maxRetries': int,
        'retryDelay': int,
        'pageTimeout': int,
        'imageTimeout': int,
        'logLevel': str,
        'navLinksSelector': str,
        'contentSelector': str,
        'ignoreURLs': list,
        'allowedDomains': list
    }
    
    def __init__(self, config_path: str = 'config.json', logger: Optional[logging.Logger] = None):
        """
        初始化配置管理器
        
        Args:
            config_path: 配置文件路径
            logger: 可选的日志记录器
        """
        self.config_path = config_path
        self.logger = logger or self._setup_logger()
        self._config = None
        self._validated = False
        
    def _setup_logger(self) -> logging.Logger:
        """设置默认日志记录器"""
        logger = logging.getLogger('ConfigManager')
        if not logger.handlers:
            handler = logging.StreamHandler()
            formatter = logging.Formatter(
                '%(asctime)s - %(name)s - %(levelname)s - %(message)s'
            )
            handler.setFormatter(formatter)
            logger.addHandler(handler)
            logger.setLevel(logging.INFO)
        return logger
    
    def load(self) -> Dict[str, Any]:
        """
        加载配置文件
        
        Returns:
            配置字典
            
        Raises:
            ConfigValidationError: 配置加载或验证失败
        """
        try:
            # 检查文件是否存在
            if not os.path.exists(self.config_path):
                raise ConfigValidationError(f"配置文件不存在: {self.config_path}")
            
            # 读取配置文件
            with open(self.config_path, 'r', encoding='utf-8') as f:
                raw_config = json.load(f)
            
            # 合并默认配置
            self._config = self._merge_with_defaults(raw_config)
            
            # 验证配置
            self._validate_config()
            
            # 处理环境变量
            self._process_environment_variables()
            
            # 规范化路径
            self._normalize_paths()
            
            self._validated = True
            self.logger.info(f"配置加载成功: {self.config_path}")
            
            return self._config
            
        except json.JSONDecodeError as e:
            raise ConfigValidationError(f"配置文件JSON格式错误: {e}")
        except Exception as e:
            raise ConfigValidationError(f"配置加载失败: {e}")
    
    def _merge_with_defaults(self, user_config: Dict[str, Any]) -> Dict[str, Any]:
        """
        合并用户配置和默认配置
        
        Args:
            user_config: 用户配置
            
        Returns:
            合并后的配置
        """
        def deep_merge(default: Dict, user: Dict) -> Dict:
            """深度合并字典"""
            result = default.copy()
            for key, value in user.items():
                if key in result and isinstance(result[key], dict) and isinstance(value, dict):
                    result[key] = deep_merge(result[key], value)
                else:
                    result[key] = value
            return result
        
        return deep_merge(self.DEFAULT_CONFIG, user_config)
    
    def _validate_config(self) -> None:
        """
        验证配置项
        
        Raises:
            ConfigValidationError: 配置验证失败
        """
        if not self._config:
            raise ConfigValidationError("配置未加载")
        
        # 检查必需的配置项
        for key in self.REQUIRED_KEYS:
            if key not in self._config or not self._config[key]:
                raise ConfigValidationError(f"缺少必需的配置项: {key}")
        
        # 类型检查
        for key, expected_type in self.TYPE_MAPPING.items():
            if key in self._config:
                value = self._config[key]
                if not isinstance(value, expected_type):
                    raise ConfigValidationError(
                        f"配置项 {key} 类型错误: 期望 {expected_type.__name__}, "
                        f"实际 {type(value).__name__}"
                    )
        
        # 验证URL格式
        self._validate_url(self._config['rootURL'])
        
        # 验证数字范围
        self._validate_numeric_ranges()
        
        # 验证选择器
        self._validate_selectors()
        
        # 验证域名
        self._validate_domains()
    
    def _validate_url(self, url: str) -> None:
        """
        验证URL格式
        
        Args:
            url: 要验证的URL
            
        Raises:
            ConfigValidationError: URL格式错误
        """
        try:
            parsed = urlparse(url)
            if not parsed.scheme or not parsed.netloc:
                raise ConfigValidationError(f"URL格式无效: {url}")
            
            if parsed.scheme not in ['http', 'https']:
                raise ConfigValidationError(f"不支持的URL协议: {parsed.scheme}")
                
        except Exception as e:
            raise ConfigValidationError(f"URL验证失败: {e}")
    
    def _validate_numeric_ranges(self) -> None:
        """验证数字配置项的范围"""
        ranges = {
            'concurrency': (1, 20),
            'screenshotDelay': (0, 10000),
            'maxRetries': (0, 10),
            'retryDelay': (100, 30000),
            'pageTimeout': (5000, 120000),
            'imageTimeout': (1000, 60000)
        }
        
        for key, (min_val, max_val) in ranges.items():
            if key in self._config:
                value = self._config[key]
                if not min_val <= value <= max_val:
                    raise ConfigValidationError(
                        f"配置项 {key} 值超出范围: {value} (应在 {min_val}-{max_val} 之间)"
                    )
    
    def _validate_selectors(self) -> None:
        """验证CSS选择器"""
        selectors = ['navLinksSelector', 'contentSelector']
        
        for key in selectors:
            if key in self._config:
                selector = self._config[key]
                if not selector or not isinstance(selector, str):
                    raise ConfigValidationError(f"无效的选择器: {key}")
    
    def _validate_domains(self) -> None:
        """验证域名配置"""
        if 'allowedDomains' in self._config:
            domains = self._config['allowedDomains']
            if not isinstance(domains, list):
                raise ConfigValidationError("allowedDomains 必须是数组")
            
            for domain in domains:
                if not isinstance(domain, str) or not domain.strip():
                    raise ConfigValidationError(f"无效的域名: {domain}")
    
    def _process_environment_variables(self) -> None:
        """处理环境变量替换"""
        env_mappings = {
            'PDF_DIR': 'pdfDir',
            'ROOT_URL': 'rootURL',
            'CONCURRENCY': 'concurrency',
            'LOG_LEVEL': 'logLevel'
        }
        
        for env_var, config_key in env_mappings.items():
            env_value = os.getenv(env_var)
            if env_value:
                # 类型转换
                if config_key in ['concurrency']:
                    try:
                        env_value = int(env_value)
                    except ValueError:
                        self.logger.warning(f"环境变量 {env_var} 不是有效数字，忽略")
                        continue
                
                self._config[config_key] = env_value
                self.logger.info(f"使用环境变量 {env_var} 设置 {config_key}")
    
    def _normalize_paths(self) -> None:
        """规范化路径配置"""
        # 确保路径使用正确的分隔符
        path_keys = ['pdfDir']
        
        for key in path_keys:
            if key in self._config:
                path = self._config[key]
                self._config[key] = os.path.normpath(path)
        
        # 处理嵌套路径配置
        if 'metadata' in self._config and 'directory' in self._config['metadata']:
            self._config['metadata']['directory'] = os.path.normpath(
                self._config['metadata']['directory']
            )
        
        if 'output' in self._config:
            for key in ['finalPdfDirectory', 'tempDirectory']:
                if key in self._config['output']:
                    self._config['output'][key] = os.path.normpath(
                        self._config['output'][key]
                    )
    
    def get(self, key: str = None, default: Any = None) -> Any:
        """
        获取配置项
        
        Args:
            key: 配置键（支持点号分隔的嵌套键，如 'metadata.directory'）
            default: 默认值
            
        Returns:
            配置值
        """
        if not self._validated:
            self.load()
        
        if key is None:
            return self._config
        
        # 支持嵌套键访问
        keys = key.split('.')
        value = self._config
        
        try:
            for k in keys:
                value = value[k]
            return value
        except (KeyError, TypeError):
            return default
    
    def get_pdf_config(self) -> Dict[str, Any]:
        """
        获取PDF相关配置
        
        Returns:
            PDF配置字典
        """
        return {
            'pdf_dir': self.get('pdfDir'),
            'final_pdf_dir': os.path.join(
                self.get('pdfDir'), 
                self.get('output.finalPdfDirectory', 'finalPdf')
            ),
            'metadata_dir': os.path.join(
                self.get('pdfDir'), 
                self.get('metadata.directory', 'metadata')
            ),
            'temp_dir': os.path.join(
                self.get('pdfDir'), 
                self.get('output.tempDirectory', '.temp')
            ),
            'max_memory_mb': self.get('pdf.maxMemoryMB', 500),
            'compression': self.get('pdf.compression', True),
            'bookmarks': self.get('pdf.bookmarks', True),
            'quality': self.get('pdf.quality', 'high')
        }
    
    def validate_paths(self) -> List[str]:
        """
        验证路径是否存在，返回需要创建的路径列表
        
        Returns:
            需要创建的路径列表
        """
        pdf_config = self.get_pdf_config()
        paths_to_check = [
            pdf_config['pdf_dir'],
            pdf_config['final_pdf_dir'],
            pdf_config['metadata_dir'],
            pdf_config['temp_dir']
        ]
        
        missing_paths = []
        for path in paths_to_check:
            if not os.path.exists(path):
                missing_paths.append(path)
        
        return missing_paths
    
    def create_missing_directories(self) -> None:
        """创建缺失的目录"""
        missing_paths = self.validate_paths()
        
        for path in missing_paths:
            try:
                os.makedirs(path, exist_ok=True)
                self.logger.info(f"创建目录: {path}")
            except Exception as e:
                self.logger.error(f"创建目录失败 {path}: {e}")
                raise ConfigValidationError(f"创建目录失败: {path}")
    
    def to_dict(self) -> Dict[str, Any]:
        """
        获取完整配置字典
        
        Returns:
            配置字典副本
        """
        if not self._validated:
            self.load()
        
        return self._config.copy()
    
    def save(self, output_path: Optional[str] = None) -> None:
        """
        保存配置到文件
        
        Args:
            output_path: 输出路径（默认覆盖原文件）
        """
        if not self._validated:
            raise ConfigValidationError("配置未验证，无法保存")
        
        output_path = output_path or self.config_path
        
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(self._config, f, indent=2, ensure_ascii=False)
            
            self.logger.info(f"配置已保存到: {output_path}")
            
        except Exception as e:
            raise ConfigValidationError(f"保存配置失败: {e}")

def create_config_manager(config_path: str = 'config.json') -> ConfigManager:
    """
    创建配置管理器实例的工厂函数
    
    Args:
        config_path: 配置文件路径
        
    Returns:
        配置管理器实例
    """
    manager = ConfigManager(config_path)
    manager.load()  # 立即加载和验证
    return manager

# 测试和验证函数
def validate_config_file(config_path: str = 'config.json') -> Dict[str, Any]:
    """
    验证配置文件的独立函数
    
    Args:
        config_path: 配置文件路径
        
    Returns:
        验证结果字典
    """
    try:
        manager = ConfigManager(config_path)
        config = manager.load()
        
        return {
            'valid': True,
            'config': config,
            'missing_paths': manager.validate_paths(),
            'message': '配置验证成功'
        }
        
    except Exception as e:
        return {
            'valid': False,
            'error': str(e),
            'message': '配置验证失败'
        }

if __name__ == '__main__':
    # 命令行测试
    import sys
    
    config_path = sys.argv[1] if len(sys.argv) > 1 else 'config.json'
    result = validate_config_file(config_path)
    
    if result['valid']:
        print(f"✅ {result['message']}")
        if result['missing_paths']:
            print(f"📁 需要创建的目录: {', '.join(result['missing_paths'])}")
    else:
        print(f"❌ {result['message']}: {result['error']}")
        sys.exit(1)