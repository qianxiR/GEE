#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CSV转栅格影像启动器（PNG + RGB + BOA三文件输出）

入参: 无（使用预设配置）

方法:
- 自动配置输入输出路径
- 将CSV数据转换为可视化PNG图像
- 将CSV数据转换为RGB栅格影像（uint8）
- 将CSV数据转换为BOA反射率影像（uint16）

出参: 
- PNG可视化图像（RGB 3波段）
- RGB栅格影像（RGBN 4波段，uint8）
- BOA反射率影像（RGBN 4波段，uint16）
"""

import os
import sys
from step4_csv_to_tiff_converter import csv_to_geotiff, csv_to_png

# ==================== 全局配置参数 ====================
# 路径配置
INPUT_DIR_NAME = "栅格与表互相转换/处理结果"           # 输入目录名
INPUT_CSV_NAME = "step2_output_with_indices.csv"      # 输入CSV文件名（来自Step2）
OUTPUT_DIR_NAME = "栅格与表互相转换/处理结果"          # 输出目录名
OUTPUT_RGB_NAME = "step4_RGB.tif"                     # RGB栅格文件名（uint8, 0-255）
OUTPUT_REFLECTANCE_NAME = "step4_BOA.tif"             # BOA反射率栅格文件名（uint16, 0-10000）
OUTPUT_PNG_NAME = "step4_RGB.png"                     # PNG可视化图像文件名（uint8, 0-255）

# 处理参数
BANDS = 'rgbn'                                     # 波段：RGBN（4波段）
CRS = 'EPSG:4326'                                  # 坐标系
CLIP_MIN = 0.005                                   # 裁剪参数下限
CLIP_MAX = 0.3                                     # 裁剪参数上限
GAMMA = 2.2                                        # Gamma校正系数

# 模式配置
RESTORE_REFLECTANCE_RGB = False                    # RGB文件不恢复反射率（保持0-255）
RESTORE_REFLECTANCE_REFLECTANCE = True             # 反射率文件恢复反射率（转为0-10000）

# 出参说明
# 生成三个文件：
# 1. step4_RGB.png - PNG可视化图像（RGB 3波段，uint8, 0-255）
# 2. step4_RGB.tif - RGB栅格影像（RGBN 4波段，uint8, 0-255）
# 3. step4_BOA.tif - BOA反射率影像（RGBN 4波段，uint16, 0-10000，Bottom of Atmosphere）
# ====================================================

def main():
    """
    主函数 - 使用预设配置运行转换
    
    入参: 无
    
    方法:
    - 配置输入输出路径
    - 设置反向转换参数
    - 执行CSV到GeoTIFF转换
    
    出参: 无
    """
    
    print("="*60)
    print("CSV → 栅格影像转换器（生成PNG + RGB + BOA三文件）")
    print("="*60)
    
    # 配置路径（相对于脚本所在目录）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_dir = os.path.dirname(script_dir)
    
    # 输入文件路径
    input_csv = os.path.join(workspace_dir, INPUT_DIR_NAME, INPUT_CSV_NAME)
    
    # 输出文件路径（三个文件）
    output_png = os.path.join(workspace_dir, OUTPUT_DIR_NAME, OUTPUT_PNG_NAME)
    output_rgb = os.path.join(workspace_dir, OUTPUT_DIR_NAME, OUTPUT_RGB_NAME)
    output_reflectance = os.path.join(workspace_dir, OUTPUT_DIR_NAME, OUTPUT_REFLECTANCE_NAME)
    
    # 检查输入文件是否存在
    if not os.path.exists(input_csv):
        print(f"❌ 错误: 输入文件不存在: {input_csv}")
        print(f"\n请先运行 step2_launcher_ndwi_ndvi.py 生成带指数的CSV文件")
        return
    
    # 创建输出目录
    output_dir = os.path.dirname(output_rgb)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"✓ 创建输出目录: {output_dir}")
    
    # 显示配置信息
    print(f"\n【配置信息】")
    print(f"输入CSV: {input_csv}")
    print(f"输出文件1（PNG可视化）: {output_png}")
    print(f"输出文件2（RGB栅格）: {output_rgb}")
    print(f"输出文件3（BOA反射率）: {output_reflectance}")
    print(f"\n【处理参数】")
    print(f"波段: {BANDS.upper()}（{'RGBN' if BANDS == 'rgbn' else 'RGB'}）")
    print(f"坐标系: {CRS}")
    print(f"裁剪参数: {CLIP_MIN} - {CLIP_MAX}")
    print(f"Gamma: γ = {GAMMA}")
    print("="*60)
    print()
    
    try:
        # ========== 第1步：生成PNG可视化图像（RGB 3波段） ==========
        print("\n" + "="*60)
        print("【步骤1/3】生成PNG可视化图像（RGB 3波段，0-255）")
        print("="*60)
        csv_to_png(
            input_csv=input_csv,
            output_png=output_png,
            clip_min=CLIP_MIN,
            clip_max=CLIP_MAX,
            gamma=GAMMA
        )
        
        # ========== 第2步：生成RGB栅格影像（RGBN 4波段，uint8） ==========
        print("\n" + "="*60)
        print("【步骤2/3】生成RGB栅格影像（RGBN 4波段，0-255，uint8格式）")
        print("="*60)
        csv_to_geotiff(
            input_csv=input_csv,
            output_tiff=output_rgb,
            bands=BANDS,
            crs=CRS,
            restore_reflectance=RESTORE_REFLECTANCE_RGB,
            clip_min=CLIP_MIN,
            clip_max=CLIP_MAX,
            gamma=GAMMA
        )
        
        # ========== 第3步：生成BOA反射率影像（RGBN 4波段，uint16） ==========
        print("\n" + "="*60)
        print("【步骤3/3】生成BOA反射率影像（RGBN 4波段，0-10000，uint16格式）")
        print("="*60)
        csv_to_geotiff(
            input_csv=input_csv,
            output_tiff=output_reflectance,
            bands=BANDS,
            crs=CRS,
            restore_reflectance=RESTORE_REFLECTANCE_REFLECTANCE,
            clip_min=CLIP_MIN,
            clip_max=CLIP_MAX,
            gamma=GAMMA
        )
        
        print("\n" + "="*60)
        print("✅ 所有转换完成！")
        print("="*60)
        print(f"\n【输出文件】")
        print(f"1. PNG可视化图像: {output_png}")
        print(f"   - 波段数: 3 (RGB)")
        print(f"   - 数据类型: uint8")
        print(f"   - 数值范围: 0-255")
        print(f"   - 用途: 网页展示、报告插图、快速预览")
        print(f"\n2. RGB栅格影像: {output_rgb}")
        print(f"   - 波段数: 4 (RGBN)")
        print(f"   - 数据类型: uint8")
        print(f"   - 数值范围: 0-255")
        print(f"   - 用途: QGIS/ArcGIS可视化、地图叠加")
        print(f"\n3. BOA反射率影像: {output_reflectance}")
        print(f"   - 波段数: 4 (RGBN)")
        print(f"   - 数据类型: uint16")
        print(f"   - 数值范围: 0-10000（对应反射率0.0-1.0）")
        print(f"   - 用途: 科学分析、水体提取、NDWI/NDVI计算")
        print(f"\n栅格文件（TIF）可在QGIS或ArcGIS中打开查看")
        
    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

