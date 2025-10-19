# 栅格与表互相转换工具包

本工具包提供了完整的遥感影像数据处理流程，支持GeoTIFF与CSV格式之间的相互转换，以及各种遥感指数计算和可视化功能。

## 文件说明

### 第0步：预处理工具

#### `step0_resize_tiff_to_500x500.py`
- **入参**: GeoTIFF影像文件路径
- **作用**: 将输入的GeoTIFF影像重采样为500×500像素大小，用于后续统一处理
- **出参**: 重采样后的GeoTIFF文件

### 第1步：栅格转表格

#### `step1_launcher_tiff_to_csv.py`
- **入参**: 无（使用预设配置）
- **作用**: 启动器，自动配置输入输出路径，调用tiff_to_csv_extractor.py进行处理
- **出参**: 三个文件（CSV表格数据、原始影像切片、RGB转换影像）

#### `step1_tiff_to_csv_extractor.py`
- **入参**: 
  - `input_path` (str): 输入GeoTIFF文件路径
  - `mask_path` (str): 掩膜文件路径（二值掩膜：1=水体，0=非水体）
  - `output_path` (str): 输出CSV文件路径
  - `band_order` (list): 波段顺序，默认为['B4','B3','B2','B8']（红绿蓝近红外）
- **作用**: 
  - 读取GeoTIFF文件的4个波段数据
  - 提取每个像素的经纬度坐标
  - 应用水体掩膜
  - 将RGB和近红外数据与坐标信息组合
  - 进行反射率裁剪和Gamma校正
- **出参**: CSV文件包含列：longitude, latitude, red, green, blue, nir, gray, water_mask

### 第2步：指数计算

#### `step2_launcher_ndwi_ndvi.py`
- **入参**: 无（使用预设配置）
- **作用**: 启动器，自动配置输入输出路径，调用ndwi_ndvi_calculator.py进行NDWI和NDVI计算
- **出参**: CSV文件（包含原始数据+NDWI+NDVI）

#### `step2_ndwi_ndvi_calculator.py`
- **入参**: 
  - `input_csv` (str): 输入CSV文件路径（包含longitude, latitude, red, green, blue, nir列）
  - `output_csv` (str): 输出CSV文件路径
- **作用**: 
  - 读取CSV文件中的RGB和NIR波段数据
  - 计算NDWI (归一化差异水体指数): (Green - NIR) / (Green + NIR)
  - 计算NDVI (归一化差异植被指数): (NIR - Red) / (NIR + Red)
  - 将指数值拉伸到0-255范围用于可视化
  - 计算灰度通道（ITU-R BT.601标准）
- **出参**: CSV文件包含列：longitude, latitude, red, green, blue, nir, gray, ndwi, ndvi, ndwi_255, ndvi_255, water_mask

### 第3步：热力图可视化

#### `step3_launcher_visualize.py`
- **入参**: 无（使用预设配置）
- **作用**: 启动器，自动配置输入输出路径，调用visualize_mask_gray.py生成热力图
- **出参**: PNG图像文件（灰度通道和水体掩膜的热力图）

#### `step3_visualize_mask_gray.py`
- **入参**: 
  - `input_csv` (str): 输入CSV文件路径（包含gray和water_mask列）
  - `output_image` (str): 输出图像文件路径
  - `figsize` (tuple): 图像尺寸（可选）
  - `dpi` (int): 图像分辨率（可选）
  - `cmap_gray` (str): 灰度色图（可选）
  - `cmap_mask` (str): 掩膜色图（可选）
- **作用**: 
  - 读取CSV文件中的灰度和掩膜数据
  - 根据经纬度重建空间结构
  - 使用matplotlib绘制并排的两个热力图
  - 左图：灰度通道热力图（彩虹色）
  - 右图：水体掩膜热力图（黑白二值）
- **出参**: PNG图像文件（包含两个子图的热力图可视化）

### 第4步：表格转栅格

#### `step4_launcher_csv_to_tiff.py`
- **入参**: 无（使用预设配置）
- **作用**: 启动器，将CSV数据转换为三种不同格式的输出文件
- **出参**: 
  - PNG可视化图像（RGB 3波段，uint8，0-255）
  - RGB栅格影像（RGBN 4波段，uint8，0-255）
  - BOA反射率影像（RGBN 4波段，uint16，0-10000）

#### `step4_csv_to_tiff_converter.py`
- **入参**: 
  - `input_csv` (str): 输入CSV文件路径（包含longitude, latitude, red, green, blue, nir列）
  - `output_file` (str): 输出文件路径（.tif/.tiff 或 .png）
  - `format` (str): 输出格式，'tiff' 或 'png'（可选）
  - `bands` (str): 输出波段选择，'rgb' 或 'rgbn'（可选）
  - `restore_reflectance` (bool): 是否将0-255转回反射率值（可选）
- **作用**: 
  - 读取CSV文件中的坐标和波段数据
  - 根据经纬度重建影像的空间结构
  - 创建地理变换矩阵，保留坐标系信息
  - 支持反射率值与RGB值之间的相互转换
  - 生成不同数据类型的栅格文件
- **出参**: 
  - GeoTIFF文件（3波段RGB或4波段RGBN，支持uint8和uint16数据类型）
  - PNG图片（3波段RGB，uint8）

### 主控制脚本

#### `run_all_steps.py`
- **入参**: 无（使用预设配置）
- **作用**: 按顺序执行所有处理步骤的主控制脚本
- **出参**: 执行完整处理流程后的所有中间和最终结果文件

## 处理流程

1. **Step 0**: 预处理 - 将原始影像重采样为标准尺寸
2. **Step 1**: 栅格→CSV - 提取像素值和坐标信息，应用水体掩膜
3. **Step 2**: 指数计算 - 计算NDWI、NDVI等遥感指数
4. **Step 3**: 可视化 - 生成热力图可视化结果
5. **Step 4**: CSV→栅格 - 将处理结果转换回栅格格式

## 数据格式说明

### CSV文件列说明
- `longitude`: 经度坐标
- `latitude`: 纬度坐标  
- `red`: 红波段值（0-255）
- `green`: 绿波段值（0-255）
- `blue`: 蓝波段值（0-255）
- `nir`: 近红外波段值（0-255）
- `gray`: 灰度值（0-255）
- `ndwi`: NDWI指数值（-1.0到1.0）
- `ndvi`: NDVI指数值（-1.0到1.0）
- `ndwi_255`: NDWI拉伸值（0-255）
- `ndvi_255`: NDVI拉伸值（0-255）
- `water_mask`: 水体掩膜（0=非水体，1=水体）

### 输出文件类型
- **CSV文件**: 表格数据，包含像素级的坐标和光谱信息
- **GeoTIFF文件**: 地理栅格数据，保留坐标系信息
- **PNG文件**: 可视化图像，用于快速预览和展示

## 使用说明

1. 将原始GeoTIFF影像和掩膜文件放入`处理结果`目录
2. 按步骤顺序运行各个launcher脚本，或直接运行`run_all_steps.py`
3. 查看`处理结果`目录中生成的各类输出文件
4. 使用QGIS或ArcGIS等软件查看栅格输出结果

## 技术特点

- 支持多波段遥感数据处理
- 标准化的反射率处理流程
- 自动化的坐标系转换
- 灵活的数据格式转换
- 丰富的可视化功能
- 模块化设计，易于扩展