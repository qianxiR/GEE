#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GeoTIFF转CSV启动器

入参: 无（使用预设配置）

方法:
- 自动配置输入输出路径
- 使用标准遥感影像处理参数
- 调用tiff_to_csv_extractor.py进行处理

出参: 三个文件（CSV、原始影像、RGB转换影像）
"""

import os
import sys
from step1_tiff_to_csv_extractor import extract_bands_to_csv_with_mask, CLIPPED_SUFFIX, RGB_CONVERTED_SUFFIX

# ==================== 全局配置参数 ====================
# 路径配置
INPUT_DIR_NAME = "栅格与表互相转换/原始数据"          # 输入目录名
INPUT_FILE_NAME = "image_cliped_resized_500x500.tif"               # 输入文件名
MASK_FILE_NAME = "yanmo_cliped_resized_500x500.tif"                # 掩膜文件名（二值掩膜：1=水体，0=非水体）
OUTPUT_DIR_NAME = "栅格与表互相转换/处理结果"        # 输出目录名
OUTPUT_CSV_NAME = "step1_output.csv"               # 输出CSV文件名（Step1前缀）

# 处理参数
BAND_ORDER = ['B4', 'B3', 'B2', 'B8']              # 波段顺序：B4(红), B3(绿), B2(蓝), B8(近红外)
CONVERT_RGB = True                                 # 是否转换为RGB 0-255范围
CLIP_MIN = 0.005                                   # 反射率裁剪下限
CLIP_MAX = 0.3                                     # 反射率裁剪上限
GAMMA = 2.2                                        # Gamma校正系数
SAVE_CLIPPED_TIFF = True                          # 是否保存裁剪后的TIF文件
STRETCH_255 = True                                 # 是否在转换后进行255范围拉伸（增强对比度）

# 提取区域配置
EXTRACT_SIZE = 500                                 # 提取区域大小：500x500像素

# 出参说明
# 生成三个文件：
# 1. output.csv - CSV表格数据
# 2. output_clipped_500x500.tif - 原始影像切片
# 3. output_rgb_converted_500x500.tif - RGB转换影像
# ====================================================

def main():
    """
    主函数 - 使用预设配置运行转换
    
    入参: 无
    
    方法:
    - 配置输入输出路径
    - 设置标准遥感处理参数
    - 执行数据提取
    
    出参: 无
    """
    
    print("="*60)
    print("GeoTIFF → CSV 转换器 (标准遥感流程)")
    print("="*60)
    
    # 配置路径（相对于脚本所在目录）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_dir = os.path.dirname(script_dir)
    
    # 输入文件路径
    input_tiff = os.path.join(workspace_dir, INPUT_DIR_NAME, INPUT_FILE_NAME)
    mask_tiff = os.path.join(workspace_dir, INPUT_DIR_NAME, MASK_FILE_NAME)
    
    # 输出文件路径
    output_csv = os.path.join(workspace_dir, OUTPUT_DIR_NAME, OUTPUT_CSV_NAME)
    
    # 检查输入文件是否存在
    if not os.path.exists(input_tiff):
        print(f"❌ 错误: 输入影像文件不存在: {input_tiff}")
        print(f"\n请将GeoTIFF文件放置在: {os.path.dirname(input_tiff)}")
        return
    
    if not os.path.exists(mask_tiff):
        print(f"❌ 错误: 输入掩膜文件不存在: {mask_tiff}")
        print(f"\n请将掩膜文件放置在: {os.path.dirname(mask_tiff)}")
        return
    
    # 创建输出目录
    output_dir = os.path.dirname(output_csv)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"✓ 创建输出目录: {output_dir}")
    
    # 显示配置信息
    print(f"\n【配置信息】")
    print(f"输入影像文件: {input_tiff}")
    print(f"输入掩膜文件: {mask_tiff}")
    print(f"输出CSV: {output_csv}")
    print(f"\n【处理参数】")
    print(f"波段顺序: {', '.join([f'{b}' for b in BAND_ORDER])}")
    print(f"提取区域: {EXTRACT_SIZE}×{EXTRACT_SIZE}像素（中心区域）")
    print(f"反射率裁剪: {CLIP_MIN} - {CLIP_MAX}")
    print(f"Gamma校正: γ = {GAMMA}")
    print(f"255拉伸: {'启用' if STRETCH_255 else '禁用'}（增强对比度）")
    print(f"\n【输出文件】")
    print(f"1. {OUTPUT_CSV_NAME} - CSV表格数据")
    print(f"2. {OUTPUT_CSV_NAME.replace('.csv', CLIPPED_SUFFIX if SAVE_CLIPPED_TIFF else '')} - 原始影像切片")
    print(f"3. {OUTPUT_CSV_NAME.replace('.csv', RGB_CONVERTED_SUFFIX if SAVE_CLIPPED_TIFF and CONVERT_RGB else '')} - RGB转换影像")
    print("="*60)
    print()
    
    try:
        # 执行转换（带掩膜支持）
        extract_bands_to_csv_with_mask(
            input_path=input_tiff,
            mask_path=mask_tiff,
            output_path=output_csv,
            band_order=BAND_ORDER,
            convert_rgb=CONVERT_RGB,
            clip_min=CLIP_MIN,
            clip_max=CLIP_MAX,
            gamma=GAMMA,
            save_clipped_tiff=SAVE_CLIPPED_TIFF,
            stretch_255=STRETCH_255
        )
        
        print("\n" + "="*60)
        print("✅ 转换完成！")
        print("="*60)
        print(f"\n输出文件位置: {output_dir}")
        print("\n可以使用以下命令查看CSV文件:")
        print(f"  pandas.read_csv('{output_csv}')")
        
    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

