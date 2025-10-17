#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
NDWI和NDVI计算启动器

入参: 无（使用预设配置）

方法:
- 自动配置输入输出路径
- 调用ndwi_ndvi_calculator.py进行计算
- 显示计算结果和统计信息

出参: CSV文件（包含原始数据+NDWI+NDVI）
"""

import os
import sys
from step2_ndwi_ndvi_calculator import compute_indices

# ==================== 全局配置参数 ====================
# 路径配置
INPUT_DIR_NAME = "栅格与表互相转换/处理结果"                        # 输入目录名
INPUT_FILE_NAME = "step1_output.csv"              # 输入CSV文件名（来自Step1）
OUTPUT_DIR_NAME = "栅格与表互相转换/处理结果"                       # 输出目录名
OUTPUT_FILE_NAME = "step2_output_with_indices.csv"  # 输出CSV文件名（Step2前缀）

# 处理参数
DISPLAY_STATS = True                              # 是否显示统计信息

# 出参说明
# 生成文件: output_with_indices.csv
# 包含列: longitude, latitude, red, green, blue, nir, gray, ndwi, ndvi, ndwi_255, ndvi_255, water_mask（最后一列）
# ====================================================


def main():
    """
    主函数 - 使用预设配置运行NDWI/NDVI计算
    
    入参: 无
    
    方法:
    - 配置输入输出路径
    - 执行指数计算
    - 显示结果统计
    
    出参: 无
    """
    
    print("="*60)
    print("NDWI & NDVI 指数计算器")
    print("="*60)
    
    # 配置路径（相对于脚本所在目录）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_dir = os.path.dirname(script_dir)
    
    # 输入文件路径
    input_csv = os.path.join(workspace_dir, INPUT_DIR_NAME, INPUT_FILE_NAME)
    
    # 输出文件路径
    output_csv = os.path.join(workspace_dir, OUTPUT_DIR_NAME, OUTPUT_FILE_NAME)
    
    # 检查输入文件是否存在
    if not os.path.exists(input_csv):
        print(f"❌ 错误: 输入文件不存在: {input_csv}")
        print(f"\n请先运行 launcher_tiff_to_csv.py 生成CSV文件")
        print(f"或将CSV文件放置在: {os.path.dirname(input_csv)}")
        return
    
    # 创建输出目录
    output_dir = os.path.dirname(output_csv)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"✓ 创建输出目录: {output_dir}")
    
    # 显示配置信息
    print(f"\n【配置信息】")
    print(f"输入CSV: {input_csv}")
    print(f"输出CSV: {output_csv}")
    print(f"\n【计算指数】")
    print(f"1. NDWI (归一化差异水体指数)")
    print(f"   公式: (Green - NIR) / (Green + NIR)")
    print(f"   用途: 识别水体，正值表示水体")
    print(f"\n2. NDVI (归一化差异植被指数)")
    print(f"   公式: (NIR - Red) / (NIR + Red)")
    print(f"   用途: 识别植被，正值表示植被")
    print("="*60)
    print()
    
    try:
        # 执行计算
        compute_indices(
            input_csv=input_csv,
            output_csv=output_csv,
            display_stats=DISPLAY_STATS
        )
        
        print("\n" + "="*60)
        print("✅ 计算完成！")
        print("="*60)
        print(f"\n输出文件: {output_csv}")
        print("\n可以使用以下命令查看结果:")
        print(f"  import pandas as pd")
        print(f"  df = pd.read_csv('{output_csv}')")
        print(f"  print(df[['ndwi', 'ndvi']].describe())")
        
        print("\n【后续操作建议】")
        print("1. 使用QGIS或ArcGIS加载输出CSV文件可视化")
        print("2. 根据NDWI阈值提取水体（通常NDWI > 0）")
        print("3. 根据NDVI阈值分类植被覆盖度")
        print("4. 可使用launcher_csv_to_tiff.py将结果转回栅格格式")
        
    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

