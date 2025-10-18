#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
遥感影像处理完整流程启动器（Step1-4全自动）

入参: 无（使用预设配置）

方法:
- 顺序执行Step1到Step4的完整处理流程
- Step1: TIFF → CSV（波段提取）
- Step2: 计算NDWI和NDVI指数
- Step3: 生成热力图可视化
- Step4: CSV → 栅格影像（PNG + RGB + BOA）

出参: 
- step1_output.csv（波段数据）
- step2_output_with_indices.csv（含指数）
- step3_heatmap_visualization.png（热力图）
- step4_RGB.png（PNG可视化）
- step4_RGB.tif（RGB栅格）
- step4_BOA.tif（BOA反射率）
"""

import os
import sys
import time

# 导入各步骤的核心处理函数
from step1_tiff_to_csv_extractor import extract_bands_to_csv_with_mask
from step2_ndwi_ndvi_calculator import compute_indices
from step3_visualize_mask_gray import csv_to_heatmap
from step4_csv_to_tiff_converter import csv_to_geotiff, csv_to_png

# ==================== 全局配置参数 ====================

# 输入输出目录配置
INPUT_OUTPUT_DIR = "栅格与表互相转换/处理结果"         # 统一的输入输出目录

# Step1: TIFF→CSV 配置
INPUT_IMAGE_FILE = "image_cliped_resized_500x500.tif"  # 输入影像文件
INPUT_MASK_FILE = "yanmo_cliped_resized_500x500.tif"   # 输入掩膜文件
STEP1_OUTPUT_CSV = "step1_output.csv"                  # Step1输出CSV

# Step2: NDWI/NDVI 配置
STEP2_OUTPUT_CSV = "step2_output_with_indices.csv"     # Step2输出CSV（含指数）

# Step3: 可视化 配置
STEP3_OUTPUT_PNG = "step3_heatmap_visualization.png"   # Step3输出热力图

# Step4: CSV→栅格 配置
STEP4_OUTPUT_PNG = "step4_RGB.png"                     # Step4输出PNG可视化
STEP4_OUTPUT_RGB = "step4_RGB.tif"                     # Step4输出RGB栅格
STEP4_OUTPUT_BOA = "step4_BOA.tif"                     # Step4输出BOA反射率

# 通用处理参数（所有步骤共享）
BAND_ORDER = ['B4', 'B3', 'B2', 'B8']                  # 波段顺序：红、绿、蓝、近红外
CLIP_MIN = 0.005                                       # 反射率裁剪下限
CLIP_MAX = 0.3                                         # 反射率裁剪上限
GAMMA = 2.2                                            # Gamma校正系数
CONVERT_RGB = True                                     # 是否转换为RGB格式
SAVE_CLIPPED_TIFF = True                              # 是否保存裁剪后的中间TIFF
STRETCH_255 = True                                     # 是否进行255范围拉伸

# 可视化参数
VIS_FIGURE_WIDTH = 16                                  # 可视化图像宽度（英寸）
VIS_FIGURE_HEIGHT = 7                                  # 可视化图像高度（英寸）
VIS_DPI = 150                                          # 可视化分辨率
VIS_CMAP_GRAY = 'rainbow'                              # 灰度色图
VIS_CMAP_MASK = 'binary'                               # 掩膜色图

# 栅格转换参数
TIFF_BANDS = 'rgbn'                                    # 栅格波段配置（RGBN）
TIFF_CRS = 'EPSG:4326'                                 # 坐标系
RESTORE_REFLECTANCE_RGB = False                        # RGB文件不恢复反射率
RESTORE_REFLECTANCE_BOA = True                         # BOA文件恢复反射率

# ====================================================


def print_header(step_num, step_name):
    """
    打印步骤标题
    
    入参:
    - step_num (int): 步骤编号
    - step_name (str): 步骤名称
    
    方法:
    - 格式化打印步骤标题和分隔线
    
    出参: 无
    """
    print("\n" + "="*70)
    print(f"【步骤 {step_num}/4】{step_name}")
    print("="*70)


def print_success(message):
    """
    打印成功消息
    
    入参:
    - message (str): 成功消息内容
    
    方法:
    - 格式化打印成功标记和消息
    
    出参: 无
    """
    print(f"✅ {message}")


def print_error(message):
    """
    打印错误消息
    
    入参:
    - message (str): 错误消息内容
    
    方法:
    - 格式化打印错误标记和消息
    
    出参: 无
    """
    print(f"❌ {message}")


def get_full_path(relative_path):
    """
    获取完整路径
    
    入参:
    - relative_path (str): 相对路径（相对于工作区）
    
    方法:
    - 基于脚本位置计算工作区根目录
    - 拼接相对路径得到完整路径
    
    出参:
    - full_path (str): 完整的绝对路径
    """
    # 获取脚本所在目录（栅格与表互相转换/）
    script_dir = os.path.dirname(os.path.abspath(__file__))
    # 获取工作区根目录（gee/）
    workspace_dir = os.path.dirname(script_dir)
    # 返回完整路径
    return os.path.join(workspace_dir, relative_path)


def step1_tiff_to_csv():
    """
    Step1: 将TIFF影像转换为CSV表格
    
    入参: 无（使用全局配置）
    
    方法:
    - 读取TIFF影像和掩膜文件
    - 提取RGB和NIR波段数据
    - 应用裁剪、Gamma校正等预处理
    - 保存为CSV格式
    
    出参: 
    - step1_output.csv: 包含经纬度、RGBN波段值的CSV文件
    - step1_output_clipped.tif: 裁剪后的原始影像
    - step1_output_rgb_converted.tif: RGB转换后的影像
    """
    print_header(1, "TIFF影像 → CSV表格")
    
    # 构建文件路径
    input_image = get_full_path(f"{INPUT_OUTPUT_DIR}/{INPUT_IMAGE_FILE}")
    input_mask = get_full_path(f"{INPUT_OUTPUT_DIR}/{INPUT_MASK_FILE}")
    output_csv = get_full_path(f"{INPUT_OUTPUT_DIR}/{STEP1_OUTPUT_CSV}")
    
    # 检查输入文件
    if not os.path.exists(input_image):
        print_error(f"输入影像文件不存在: {input_image}")
        return False
    if not os.path.exists(input_mask):
        print_error(f"输入掩膜文件不存在: {input_mask}")
        return False
    
    print(f"输入影像: {INPUT_IMAGE_FILE}")
    print(f"输入掩膜: {INPUT_MASK_FILE}")
    print(f"输出CSV: {STEP1_OUTPUT_CSV}")
    print(f"波段顺序: {', '.join(BAND_ORDER)}")
    
    # 执行转换
    start_time = time.time()
    extract_bands_to_csv_with_mask(
        input_path=input_image,
        mask_path=input_mask,
        output_path=output_csv,
        band_order=BAND_ORDER,
        convert_rgb=CONVERT_RGB,
        clip_min=CLIP_MIN,
        clip_max=CLIP_MAX,
        gamma=GAMMA,
        save_clipped_tiff=SAVE_CLIPPED_TIFF,
        stretch_255=STRETCH_255
    )
    elapsed_time = time.time() - start_time
    
    print_success(f"Step1完成！耗时: {elapsed_time:.2f}秒")
    return True


def step2_compute_indices():
    """
    Step2: 计算NDWI和NDVI指数
    
    入参: 无（使用全局配置）
    
    方法:
    - 读取Step1输出的CSV文件
    - 基于Green和NIR波段计算NDWI（水体指数）
    - 基于Red和NIR波段计算NDVI（植被指数）
    - 保存增强后的CSV文件
    
    出参:
    - step2_output_with_indices.csv: 包含原始数据+NDWI+NDVI的CSV文件
    """
    print_header(2, "计算NDWI和NDVI指数")
    
    # 构建文件路径
    input_csv = get_full_path(f"{INPUT_OUTPUT_DIR}/{STEP1_OUTPUT_CSV}")
    output_csv = get_full_path(f"{INPUT_OUTPUT_DIR}/{STEP2_OUTPUT_CSV}")
    
    # 检查输入文件
    if not os.path.exists(input_csv):
        print_error(f"输入CSV文件不存在: {input_csv}")
        print("请先运行Step1生成CSV文件")
        return False
    
    print(f"输入CSV: {STEP1_OUTPUT_CSV}")
    print(f"输出CSV: {STEP2_OUTPUT_CSV}")
    
    # 执行计算
    start_time = time.time()
    compute_indices(
        input_csv=input_csv,
        output_csv=output_csv,
        display_stats=True
    )
    elapsed_time = time.time() - start_time
    
    print_success(f"Step2完成！耗时: {elapsed_time:.2f}秒")
    return True


def step3_visualize():
    """
    Step3: 生成热力图可视化
    
    入参: 无（使用全局配置）
    
    方法:
    - 读取Step2输出的CSV文件
    - 生成灰度通道热力图（彩虹色）
    - 生成水体掩膜热力图（黑白）
    - 保存为PNG图像
    
    出参:
    - step3_heatmap_visualization.png: 包含灰度和掩膜的热力图
    """
    print_header(3, "生成热力图可视化")
    
    # 构建文件路径
    input_csv = get_full_path(f"{INPUT_OUTPUT_DIR}/{STEP2_OUTPUT_CSV}")
    output_png = get_full_path(f"{INPUT_OUTPUT_DIR}/{STEP3_OUTPUT_PNG}")
    
    # 检查输入文件
    if not os.path.exists(input_csv):
        print_error(f"输入CSV文件不存在: {input_csv}")
        print("请先运行Step2生成含指数的CSV文件")
        return False
    
    print(f"输入CSV: {STEP2_OUTPUT_CSV}")
    print(f"输出图像: {STEP3_OUTPUT_PNG}")
    print(f"分辨率: {VIS_FIGURE_WIDTH}×{VIS_FIGURE_HEIGHT}英寸 @ {VIS_DPI}DPI")
    
    # 执行可视化
    start_time = time.time()
    csv_to_heatmap(
        input_csv=input_csv,
        output_image=output_png,
        figsize=(VIS_FIGURE_WIDTH, VIS_FIGURE_HEIGHT),
        dpi=VIS_DPI,
        cmap_gray=VIS_CMAP_GRAY,
        cmap_mask=VIS_CMAP_MASK
    )
    elapsed_time = time.time() - start_time
    
    print_success(f"Step3完成！耗时: {elapsed_time:.2f}秒")
    return True


def step4_csv_to_raster():
    """
    Step4: 将CSV转换回栅格影像
    
    入参: 无（使用全局配置）
    
    方法:
    - 读取Step2输出的CSV文件
    - 生成PNG可视化图像（RGB 3波段，uint8）
    - 生成RGB栅格影像（RGBN 4波段，uint8）
    - 生成BOA反射率影像（RGBN 4波段，uint16）
    
    出参:
    - step4_RGB.png: PNG可视化图像
    - step4_RGB.tif: RGB栅格影像（0-255）
    - step4_BOA.tif: BOA反射率影像（0-10000）
    """
    print_header(4, "CSV → 栅格影像（PNG + RGB + BOA）")
    
    # 构建文件路径
    input_csv = get_full_path(f"{INPUT_OUTPUT_DIR}/{STEP2_OUTPUT_CSV}")
    output_png = get_full_path(f"{INPUT_OUTPUT_DIR}/{STEP4_OUTPUT_PNG}")
    output_rgb = get_full_path(f"{INPUT_OUTPUT_DIR}/{STEP4_OUTPUT_RGB}")
    output_boa = get_full_path(f"{INPUT_OUTPUT_DIR}/{STEP4_OUTPUT_BOA}")
    
    # 检查输入文件
    if not os.path.exists(input_csv):
        print_error(f"输入CSV文件不存在: {input_csv}")
        print("请先运行Step2生成含指数的CSV文件")
        return False
    
    print(f"输入CSV: {STEP2_OUTPUT_CSV}")
    print(f"输出文件1: {STEP4_OUTPUT_PNG} (PNG可视化)")
    print(f"输出文件2: {STEP4_OUTPUT_RGB} (RGB栅格)")
    print(f"输出文件3: {STEP4_OUTPUT_BOA} (BOA反射率)")
    
    # 执行转换（分3个子步骤）
    start_time = time.time()
    
    # 子步骤1: 生成PNG可视化
    print("\n  → 生成PNG可视化图像...")
    csv_to_png(
        input_csv=input_csv,
        output_png=output_png,
        clip_min=CLIP_MIN,
        clip_max=CLIP_MAX,
        gamma=GAMMA
    )
    
    # 子步骤2: 生成RGB栅格（uint8）
    print("  → 生成RGB栅格影像（0-255）...")
    csv_to_geotiff(
        input_csv=input_csv,
        output_tiff=output_rgb,
        bands=TIFF_BANDS,
        crs=TIFF_CRS,
        restore_reflectance=RESTORE_REFLECTANCE_RGB,
        clip_min=CLIP_MIN,
        clip_max=CLIP_MAX,
        gamma=GAMMA
    )
    
    # 子步骤3: 生成BOA反射率（uint16）
    print("  → 生成BOA反射率影像（0-10000）...")
    csv_to_geotiff(
        input_csv=input_csv,
        output_tiff=output_boa,
        bands=TIFF_BANDS,
        crs=TIFF_CRS,
        restore_reflectance=RESTORE_REFLECTANCE_BOA,
        clip_min=CLIP_MIN,
        clip_max=CLIP_MAX,
        gamma=GAMMA
    )
    
    elapsed_time = time.time() - start_time
    print_success(f"Step4完成！耗时: {elapsed_time:.2f}秒")
    return True


def main():
    """
    主函数 - 执行完整的4步处理流程
    
    入参: 无
    
    方法:
    - 打印欢迎信息和配置概览
    - 顺序执行Step1到Step4
    - 显示最终处理报告
    
    出参: 无
    """
    # 打印欢迎信息
    print("="*70)
    print("遥感影像处理完整流程启动器".center(70))
    print("="*70)
    print("\n【流程概览】")
    print("Step1: TIFF影像 → CSV表格（波段提取）")
    print("Step2: 计算NDWI和NDVI指数")
    print("Step3: 生成热力图可视化")
    print("Step4: CSV → 栅格影像（PNG + RGB + BOA）")
    print("\n【配置参数】")
    print(f"工作目录: {INPUT_OUTPUT_DIR}")
    print(f"波段顺序: {', '.join(BAND_ORDER)}")
    print(f"反射率范围: {CLIP_MIN} - {CLIP_MAX}")
    print(f"Gamma校正: γ = {GAMMA}")
    print(f"坐标系: {TIFF_CRS}")
    
    # 记录总开始时间
    total_start_time = time.time()
    
    # 执行各个步骤
    success_count = 0
    
    # Step1: TIFF → CSV
    if step1_tiff_to_csv():
        success_count += 1
    else:
        print_error("Step1执行失败，流程中止")
        return
    
    # Step2: 计算指数
    if step2_compute_indices():
        success_count += 1
    else:
        print_error("Step2执行失败，流程中止")
        return
    
    # Step3: 可视化
    if step3_visualize():
        success_count += 1
    else:
        print_error("Step3执行失败，流程中止")
        return
    
    # Step4: CSV → 栅格
    if step4_csv_to_raster():
        success_count += 1
    else:
        print_error("Step4执行失败，流程中止")
        return
    
    # 计算总耗时
    total_elapsed_time = time.time() - total_start_time
    
    # 打印最终报告
    print("\n" + "="*70)
    print("处理完成报告".center(70))
    print("="*70)
    print(f"\n✅ 成功完成 {success_count}/4 个步骤")
    print(f"⏱️  总耗时: {total_elapsed_time:.2f}秒")
    
    print("\n【生成的文件】")
    output_dir = get_full_path(INPUT_OUTPUT_DIR)
    print(f"\n📁 输出目录: {output_dir}")
    print(f"\n1️⃣  {STEP1_OUTPUT_CSV}")
    print(f"   └─ 波段数据（RGBN + 经纬度）")
    print(f"\n2️⃣  {STEP2_OUTPUT_CSV}")
    print(f"   └─ 波段数据 + NDWI + NDVI + 掩膜")
    print(f"\n3️⃣  {STEP3_OUTPUT_PNG}")
    print(f"   └─ 灰度热力图 + 水体掩膜热力图")
    print(f"\n4️⃣  {STEP4_OUTPUT_PNG}")
    print(f"   └─ PNG可视化图像（RGB 3波段，0-255）")
    print(f"\n   {STEP4_OUTPUT_RGB}")
    print(f"   └─ RGB栅格影像（RGBN 4波段，uint8，0-255）")
    print(f"\n   {STEP4_OUTPUT_BOA}")
    print(f"   └─ BOA反射率影像（RGBN 4波段，uint16，0-10000）")
    
    print("\n【后续操作建议】")
    print("• 在QGIS/ArcGIS中打开TIF栅格文件进行空间分析")
    print("• 使用Python/Pandas分析CSV数据文件")
    print("• 根据NDWI阈值提取水体（NDWI > 0）")
    print("• 根据NDVI阈值分类植被覆盖度")
    
    print("\n" + "="*70)
    print("🎉 所有处理完成！".center(70))
    print("="*70)


if __name__ == "__main__":
    main()


