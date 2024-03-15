import os
import fitz  # PyMuPDF
from datetime import datetime
from urllib.parse import urlparse

# 导入配置
from config import rootURL, pdfDir

def ensure_directory_exists(directory):
    if not os.path.exists(directory):
        os.makedirs(directory)

def merge_pdfs_in_directory(directory_path, output_file_name):
    files = [f for f in os.listdir(directory_path) if f.endswith('.pdf')]
    files.sort(key=lambda x: int(x.split('-')[0]))

    if not files:
        return  # 如果没有PDF文件，则跳过

    merged_pdf = fitz.open()
    for file in files:
        file_path = os.path.join(directory_path, file)
        pdf = fitz.open(file_path)
        merged_pdf.insert_pdf(pdf)
        # 添加书签
        merged_pdf.add_outline(title=file, pagenum=len(merged_pdf) - pdf.page_count)
        pdf.close()

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
