import os
import fitz  # PyMuPDF
from datetime import datetime
from urllib.parse import urlparse

# 导入配置
from config import rootURL, pdfDir

def ensure_directory_exists(directory):
    if not os.path.exists(directory):
        os.makedirs(directory)

def clean_filename(filename):
    # 去除文件扩展名
    name_without_extension = os.path.splitext(filename)[0]
    
    # 分割字符串以去除前缀
    parts = name_without_extension.split('-')
    
    # 去除前缀（第一个元素），并重新组合剩余部分
    cleaned_name = '-'.join(parts[1:])

    return cleaned_name

def merge_pdfs_in_directory(directory_path, output_file_name):
    files = [f for f in os.listdir(directory_path) if f.endswith('.pdf')]
    files.sort(key=lambda x: int(x.split('-')[0]))

    if not files:
        return  # 如果没有PDF文件，则跳过

    merged_pdf = fitz.open()
    toc = []  # 初始化目录列表
    for file in files:
        file_path = os.path.join(directory_path, file)
        pdf = fitz.open(file_path)
        merged_pdf.insert_pdf(pdf)
        # 添加书签
        # 将文件名称用作书签标题, 其中文件名有可能是类似"1-xxx.pdf"的格式，需要把数字前缀及"-"去掉，如去掉"1-"
        bookmark_title = clean_filename(file)
        start_page = len(merged_pdf) - pdf.page_count
        toc.append([1, bookmark_title, start_page + 1])
        pdf.close()

    # 设置合并后PDF的目录
    merged_pdf.set_toc(toc)
    merged_pdf.save(output_file_name)
    merged_pdf.close()
    print(f'Merged PDF saved as: {output_file_name}')

def merge_pdfs_for_root_and_subdirectories():
    url = urlparse(rootURL)
    domain = url.hostname.replace('.', '_')
    current_date = datetime.now().strftime('%Y%m%d')
    final_pdf_directory = "finalPdf"
    ensure_directory_exists(os.path.join(pdfDir, final_pdf_directory))

    # 合并根目录下的PDF文件
    root_output_file_name = os.path.join(pdfDir, final_pdf_directory, f"{domain}_{current_date}.pdf")
    merge_pdfs_in_directory(pdfDir, root_output_file_name)

    # 遍历并合并所有子目录下的PDF文件
    directories = [d for d in os.listdir(pdfDir) if os.path.isdir(os.path.join(pdfDir, d)) and d != final_pdf_directory]

    for directory in directories:
        directory_path = os.path.join(pdfDir, directory)
        output_file_name = os.path.join(pdfDir, final_pdf_directory, f"{directory}_{current_date}.pdf")
        merge_pdfs_in_directory(directory_path, output_file_name)

if __name__ == '__main__':
    merge_pdfs_for_root_and_subdirectories()
