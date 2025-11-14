#!/usr/bin/env python3
"""
自动修复 README 目录链接脚本
根据 GitHub 的锚点生成规则，自动生成正确的目录链接
"""

import re
import sys
from pathlib import Path

def generate_github_anchor(text):
    """
    生成 GitHub 风格的锚点链接
    
    GitHub 的锚点生成规则：
    1. 移除所有标点符号和特殊字符（emoji、括号、-- 等）
    2. 转换为小写
    3. 空格替换为连字符
    4. 多个连字符合并为一个
    5. 移除首尾连字符
    """
    # 移除所有标点符号和特殊字符（保留中文、英文、数字、空格）
    text = re.sub(r'[^\w\s\u4e00-\u9fff]', '', text)
    # 转换为小写（中文不变）
    text = text.lower()
    # 空格替换为连字符
    text = re.sub(r'\s+', '-', text)
    # 多个连字符合并为一个
    text = re.sub(r'-+', '-', text)
    # 移除首尾连字符
    text = text.strip('-')
    return text

def extract_headings(content):
    """提取所有标题及其锚点"""
    headings = {}
    lines = content.split('\n')
    
    for i, line in enumerate(lines, 1):
        if line.strip().startswith('#'):
            heading_text = line.strip().lstrip('#').strip()
            if heading_text:
                anchor = generate_github_anchor(heading_text)
                headings[anchor] = (heading_text, i)
    
    return headings

def fix_toc_links(content, headings):
    """修复目录中的所有链接"""
    # 找到目录部分
    toc_start = content.find('## 📑 目录')
    if toc_start == -1:
        toc_start = content.find('## 📑 Table of Contents')
    
    if toc_start == -1:
        return content, []
    
    toc_end = content.find('</details>', toc_start)
    if toc_end == -1:
        toc_end = content.find('---', toc_start + 100)
    
    if toc_end == -1:
        return content, []
    
    toc_section = content[toc_start:toc_end + len('</details>')]
    
    # 修复所有链接
    def fix_link(match):
        link_text = match.group(1)
        current_anchor = match.group(2)
        
        # 生成正确的锚点
        correct_anchor = generate_github_anchor(link_text)
        
        # 验证锚点是否存在
        if correct_anchor in headings:
            return f'[{link_text}](#{correct_anchor})'
        else:
            # 尝试在标题中搜索匹配的文本
            for anchor, (text, _) in headings.items():
                # 移除所有特殊字符后比较
                clean_text = re.sub(r'[^\w\s\u4e00-\u9fff]', '', text.lower())
                clean_link = re.sub(r'[^\w\s\u4e00-\u9fff]', '', link_text.lower())
                if clean_text == clean_link or text == link_text:
                    return f'[{link_text}](#{anchor})'
            # 如果找不到，保持原样但记录警告
            return f'[{link_text}](#{current_anchor})'
    
    fixed_toc = re.sub(r'\[([^\]]+)\]\(#([^)]+)\)', fix_link, toc_section)
    
    # 替换目录部分
    new_content = content[:toc_start] + fixed_toc + content[toc_end + len('</details>'):]
    
    # 验证所有链接
    links = re.findall(r'\[([^\]]+)\]\(#([^)]+)\)', fixed_toc)
    missing = []
    for link_text, anchor in links:
        if anchor not in headings:
            missing.append((link_text, anchor))
    
    return new_content, missing

def main():
    """主函数"""
    readme_files = ['README.md', 'README_EN.md']
    
    for readme_file in readme_files:
        readme_path = Path(readme_file)
        if not readme_path.exists():
            print(f"⚠️  文件不存在: {readme_file}")
            continue
        
        print(f"\n处理文件: {readme_file}")
        print("=" * 60)
        
        # 读取文件
        with open(readme_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        # 提取标题
        headings = extract_headings(content)
        print(f"✓ 找到 {len(headings)} 个标题")
        
        # 修复目录链接
        new_content, missing = fix_toc_links(content, headings)
        
        # 写回文件
        if new_content != content:
            with open(readme_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print("✓ 已更新文件")
        else:
            print("✓ 文件无需更新")
        
        # 报告缺失的链接
        if missing:
            print(f"\n⚠️  发现 {len(missing)} 个未找到对应标题的链接:")
            for link_text, anchor in missing[:10]:
                print(f"  - [{link_text}](#{anchor})")
        else:
            # 统计链接数量
            links = re.findall(r'\[([^\]]+)\]\(#([^)]+)\)', 
                             new_content[new_content.find('## 📑'):new_content.find('</details>', new_content.find('## 📑'))])
            print(f"✓ 所有 {len(links)} 个目录链接都正确！")

if __name__ == '__main__':
    main()


