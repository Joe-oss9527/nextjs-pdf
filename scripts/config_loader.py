import os
import json

def load_config():
    # 获取脚本所在目录的父目录（项目根目录）
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    config_path = os.path.join(base_dir, 'config.json')
    
    with open(config_path, 'r') as config_file:
        config = json.load(config_file)
    
    # 将相对路径转换为绝对路径
    config['pdfDir'] = os.path.abspath(os.path.join(base_dir, config['pdfDir']))
    
    return config

config = load_config()