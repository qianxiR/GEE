#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
热力图可视化启动器

入参: 无（使用预设配置）

方法:
- 自动配置输入输出路径
- 调用visualize_mask_gray.py进行可视化
- 生成灰度通道和水体掩膜的热力图

出参: PNG图像文件
"""

import os
import sys
from step3_visualize_mask_gray import csv_to_heatmap

# ==================== 全局配置参数 ====================
# 路径配置
INPUT_DIR_NAME = "栅格与表互相转换/处理结果"                        # 输入目录名
INPUT_FILE_NAME = "step2_output_with_indices.csv"                  # 输入CSV文件名（来自Step2）
OUTPUT_DIR_NAME = "栅格与表互相转换/处理结果"             # 输出目录名
OUTPUT_FILE_NAME = "step3_heatmap_visualization.png"               # 输出图像文件名（Step3前缀）

# 可视化参数
FIGURE_WIDTH = 16                                                  # 图像宽度（英寸）
FIGURE_HEIGHT = 7                                                  # 图像高度（英寸）
IMAGE_DPI = 150                                                    # 图像分辨率

# 色图配置
CMAP_GRAY = 'rainbow'                                              # 灰度色图（彩虹色）
CMAP_MASK = 'binary'                                               # 掩膜色图（黑白）

# 出参说明
# 生成文件: heatmap_visualization.png
# 包含: 灰度通道热力图 + 水体掩膜热力图（并排显示）
# ====================================================


def main():
    """
    主函数 - 使用预设配置运行热力图可视化
    
    入参: 无
    
    方法:
    - 配置输入输出路径
    - 执行热力图生成
    - 显示结果信息
    
    出参: 无
    """
    
    print("="*60)
    print("Gray Channel & Water Mask Heatmap Visualization")
    print("="*60)
    
    # 配置路径（相对于脚本所在目录）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    workspace_dir = os.path.dirname(script_dir)
    
    # 输入文件路径
    input_csv = os.path.join(workspace_dir, INPUT_DIR_NAME, INPUT_FILE_NAME)
    
    # 输出文件路径
    output_image = os.path.join(workspace_dir, OUTPUT_DIR_NAME, OUTPUT_FILE_NAME)
    
    # 检查输入文件是否存在
    if not os.path.exists(input_csv):
        print(f"❌ 错误: 输入文件不存在: {input_csv}")
        print(f"\n请先运行 launcher_ndwi_ndvi.py 生成包含指数的CSV文件")
        print(f"或将CSV文件放置在: {os.path.dirname(input_csv)}")
        return
    
    # 创建输出目录
    output_dir = os.path.dirname(output_image)
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"✓ 创建输出目录: {output_dir}")
    
    # 显示配置信息
    print(f"\n【Configuration】")
    print(f"Input CSV: {input_csv}")
    print(f"Output Image: {output_image}")
    print(f"\n【Visualization Parameters】")
    print(f"Figure Size: {FIGURE_WIDTH} × {FIGURE_HEIGHT} inches")
    print(f"DPI: {IMAGE_DPI}")
    print(f"Gray Colormap: {CMAP_GRAY} (Rainbow)")
    print(f"Mask Colormap: {CMAP_MASK} (Binary)")
    print(f"\n【Generated Content】")
    print(f"1. Gray Channel Heatmap (RGB merged, Rainbow color)")
    print(f"2. Water Mask Heatmap (0=Black/Non-Water, 1=White/Water)")
    print("="*60)
    print()
    
    try:
        # 执行可视化
        csv_to_heatmap(
            input_csv=input_csv,
            output_image=output_image,
            figsize=(FIGURE_WIDTH, FIGURE_HEIGHT),
            dpi=IMAGE_DPI,
            cmap_gray=CMAP_GRAY,
            cmap_mask=CMAP_MASK
        )
        
        print("\n" + "="*60)
        print("✅ Visualization Complete!")
        print("="*60)
        print(f"\nOutput File: {output_image}")
        print("\nHow to View:")
        print("  1. Double-click to open PNG image")
        print("  2. Load in QGIS/ArcGIS")
        print("  3. Use Python:")
        print(f"     from PIL import Image")
        print(f"     img = Image.open('{output_image}')")
        print(f"     img.show()")
        
        print("\n【Image Description】")
        print("Left Panel: Gray Channel Heatmap")
        print("  - Color: Rainbow colormap (Blue→Green→Yellow→Red)")
        print("  - Range: 0-255")
        print("  - Purpose: Single-band visualization with vibrant colors")
        print("\nRight Panel: Water Mask Heatmap")
        print("  - Color: Binary (Black-White)")
        print("  - Black: Non-water area (value=0)")
        print("  - White: Water area (value=1)")
        print("  - Algorithm: Threshold segmentation based on lene.js")
        
    except Exception as e:
        print(f"\n❌ 错误: {str(e)}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    main()

