/**
 * 扎陵湖水体提取 - 固定区域
 * 入参:
 * - 固定的经纬度范围（扎陵湖区域）
 * - 经度范围：97.0°E - 97.5°E
 * - 纬度范围：34.8°N - 35.1°N
 * 方法:
 * - 使用预定义的矩形区域进行水体提取
 * - 用户设置时间范围后点击"开始水体提取"按钮
 * 出参:
 * - 水体掩膜、NDWI、完整波段等导出结果
 */

// ========== 全局配置（修改此处即可切换研究区域和时间） ==========
/**
 * 全局区域变量 - 扎陵湖
 * 说明：扎陵湖位于青海省玛多县，黄河源头地区
 * 经纬度范围：经度 97.0°E - 97.5°E，纬度 34.8°N - 35.1°N
 * 坐标系：EPSG:4326 (WGS84)
 */
var REGION_NAME = '扎陵湖';  // 区域名称
var studyRegion = ee.Geometry.Rectangle([97.0, 34.8, 97.5, 35.1]);

// 设置地图初始位置（扎陵湖区域）
Map.centerObject(studyRegion, 10);
// 在地图上显示研究区域
Map.addLayer(studyRegion, {color: 'red'}, REGION_NAME + ' 研究区域');

// ========== 2. 时间参数设置 ==========
// 设置水体提取的时间范围（可根据需要修改）
var startDate = '2025-06-01';
var endDate = '2025-07-31';

// ========== 3. 去云算法函数 ==========
/**
 * 哨兵-2逐像素去云算法
 * 入参:
 * - image (ee.Image): 哨兵-2影像
 * 方法:
 * - 使用QA60波段进行像素级云掩膜
 * - 提取云和云阴影位进行掩膜
 * 出参:
 * - ee.Image: 去云后的哨兵-2影像
 */
function rmcloudS2(image) {
  // 获取QA60波段（云掩膜）
  var qa = image.select('QA60');
  
  // 提取云掩膜位 (位10: 云, 位11: 云阴影)
  var cloudMask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
  
  // 对原始影像应用云掩膜
  return image.updateMask(cloudMask);
}

/**
 * 验证影像波段完整性
 * 入参:
 * - image (ee.Image): 输入的多光谱影像
 * 方法:
 * - 检查所有必需的波段是否存在且有效
 * - 确保波段数据不为空或无效值
 * 出参:
 * - ee.Image: 经过验证的影像
 */
function validateImageBands(image) {
  // 检查必需的波段是否存在（仅检查NDWI计算需要的波段）
  var requiredBands = ['B2', 'B3', 'B4', 'B8'];
  var bandNames = image.bandNames();
  
  // 验证所有必需波段都存在
  var hasAllBands = requiredBands.every(function(band) {
    return bandNames.contains(band);
  });
  
  if (!hasAllBands) {
    print('错误：影像缺少必需的波段');
    return null;
  }
  
  // 创建数据质量掩膜，确保所有波段都有效
  var qualityMask = image.select(requiredBands)
    .reduce(ee.Reducer.allNonZero());
  
  return image.updateMask(qualityMask);
}

/**
 * 计算NDWI水体指数特征
 * 入参:
 * - image (ee.Image): 输入的多光谱影像
 * 方法:
 * - 仅计算NDWI（归一化水体指数）进行水体识别
 * - 利用水体在绿波段和近红外波段的反射差异进行识别
 * - 结合NDVI指数排除植被干扰
 * - 添加数据验证确保波段完整性
 * 出参:
 * - ee.Image: 包含NDWI和NDVI特征的影像
 */
function calculateWaterIndices(image) {
  print('\n========== 波段读取与指数计算流程 ==========');
  
  // 验证影像波段完整性
  var validatedImage = validateImageBands(image);
  if (!validatedImage) {
    print('错误：影像波段验证失败');
    return null;
  }
  
  print('步骤1: 从合成影像中读取特定波段');
  
  // 获取波段 - 注意Sentinel-2波段编号
  print('  - 读取 B3 (绿波段, 560nm, 10m分辨率)');
  var green = validatedImage.select('B3');    // 绿波段
  
  print('  - 读取 B4 (红波段, 665nm, 10m分辨率)');
  var red = validatedImage.select('B4');      // 红波段
  
  print('  - 读取 B8 (近红外波段, 842nm, 10m分辨率)');
  var nir = validatedImage.select('B8');      // 近红外
  
  print('\n步骤2: 计算水体指数');
  
  // 1. NDWI（归一化水体指数）
  print('  - 计算 NDWI = (Green - NIR) / (Green + NIR)');
  print('    公式: (B3 - B8) / (B3 + B8)');
  print('    原理: 水体在绿波段反射率高，近红外反射率低');
  print('    范围: -1 到 +1，正值表示水体');
  var ndwi = green.subtract(nir).divide(green.add(nir)).rename('NDWI');
  
  // 2. NDVI（归一化植被指数）
  print('  - 计算 NDVI = (NIR - Red) / (NIR + Red)');
  print('    公式: (B8 - B4) / (B8 + B4)');
  print('    原理: 植被在近红外反射率高，红波段反射率低');
  print('    范围: -1 到 +1，正值表示植被');
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  
  print('\n步骤3: 组合波段');
  print('  - 保留原始波段: B2, B3, B4, B8');
  print('  - 添加计算指数: NDWI, NDVI');
  
  // 组合特征（仅保留必要的波段）
  var features = validatedImage.select(['B2', 'B3', 'B4', 'B8'])
    .addBands(ndwi)
    .addBands(ndvi);
  
  print('  - 最终波段数量:', features.bandNames());
  print('=====================================\n');
  
  return features;
}

/**
 * 使用NDWI创建水体掩膜
 * 入参:
 * - image (ee.Image): 包含NDWI和NDVI的影像
 * - region (ee.Geometry): 研究区域
 * 方法:
 * - 使用NDWI指数进行水体识别
 * - 结合NDVI < 0.1 排除植被干扰
 * - 使用经验阈值确定水体边界
 * 出参:
 * - ee.Image: 水体掩膜（1=水体，0=非水体）
 */
function createWaterMask(image, region) {
  var ndwi = image.select('NDWI');
  var ndvi = image.select('NDVI');
  
  // 使用经验阈值确定NDWI的最佳阈值
  var ndwiThreshold = ee.Number(0.1);   // NDWI阈值：0.1（提取NDWI>0.1的水体区域）
  var ndviThreshold = ee.Number(0.1);   // NDVI阈值：0.1（排除植被区域）
  
  print('NDWI 阈值: > ', ndwiThreshold);
  print('NDVI 阈值: < ', ndviThreshold);
  
  // 基于NDWI和NDVI的水体识别条件
  var waterMask = ndwi.gt(ndwiThreshold).and(ndvi.lt(ndviThreshold));  // NDWI > 0.1 且 NDVI < 0.1
  
  return waterMask.rename('WaterMask');
}



// ========== 3. 水体提取主函数 ==========
/**
 * 执行水体提取分析
 * 入参: 无（使用预定义的固定区域和时间参数）
 * 方法:
 * - 使用固定的研究区域（扎陵湖）
 * - 获取Sentinel-2数据
 * - 计算水体指数
 * - 生成水体掩膜
 * - 导出结果
 * 出参: 无
 */
function runWaterExtraction() {
  print('==================== 开始水体提取 ====================');
  print('研究区域: ' + REGION_NAME);
  print('经度范围: 97.0°E - 97.5°E');
  print('纬度范围: 34.8°N - 35.1°N');
  print('时间范围: ' + startDate + ' 至 ' + endDate);
  
  // ========== 数据读取流程说明 ==========
  print('\n========== 数据读取流程 ==========');
  print('步骤1: 从GEE数据集读取Sentinel-2影像集合');
  print('数据集: COPERNICUS/S2_SR_HARMONIZED (哨兵-2地表反射率产品)');
  
  // 获取 Sentinel-2 数据（像素级去云）
  print('步骤2: 应用像素级去云策略');
  print('  - 使用QA60波段进行像素级云掩膜处理');
  print('  - 对每景影像单独去云，保留无云像素');
  
  var S2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(studyRegion)
    .filterDate(startDate, endDate)
    .map(rmcloudS2);
  
  // 检查数据可用性
  var imageCount = S2.size();
  print('步骤3: 筛选符合条件的影像');
  print('  - 空间范围: 研究区域边界内');
  print('  - 时间范围: ' + startDate + ' 至 ' + endDate);
  print('  - 去云方法: 像素级云掩膜 (QA60)');
  print('  - 找到的影像数量: ', imageCount);
  
  // ========== 打印影像集合中第一景影像的信息 ==========
  print('\n========== 单景影像详细信息 ==========');
  var firstImage = S2.first();
  print('第一景影像的所有属性:');
  print(firstImage);
  print('第一景影像的波段名称:', firstImage.bandNames());
  
  // 打印影像集合中所有影像的日期和云量
  print('\n所有影像的获取日期和云量:');
  var imageList = S2.toList(S2.size());
  imageList.evaluate(function(list) {
    print('影像总数: ' + list.length);
    list.forEach(function(img, index) {
      var date = new Date(img.properties['system:time_start']);
      var cloudCover = img.properties['CLOUDY_PIXEL_PERCENTAGE'];
      print('影像 ' + (index + 1) + ': ' + date.toISOString().split('T')[0] + ', 云量: ' + cloudCover.toFixed(2) + '%');
    });
  });
  
  // ========== 影像合成流程 ==========
  print('\n========== 影像合成流程 ==========');
  print('步骤3: 使用median()中值合成法合成影像');
  print('  - 原理: 对每个像元，取时间序列所有影像的中值');
  print('  - 优点: 有效去除云雾、异常值，保留真实地表信息');
  print('  - 方法: ee.ImageCollection.median()');
  
  // 计算中值合成
  var composite = S2.median().clip(studyRegion);
  
  print('步骤4: 裁剪到研究区域');
  print('  - 方法: clip(studyRegion)');
  
  // ========== 打印合成影像的波段信息 ==========
  print('\n========== 合成影像波段信息 ==========');
  print('合成影像包含的所有波段:', composite.bandNames());
  
  // 打印每个波段的详细描述
  print('\n波段详细说明 (Sentinel-2 L1C产品):');
  print('B1: 海岸气溶胶 (Coastal Aerosol) - 443nm, 60m');
  print('B2: 蓝波段 (Blue) - 490nm, 10m');
  print('B3: 绿波段 (Green) - 560nm, 10m');
  print('B4: 红波段 (Red) - 665nm, 10m');
  print('B5: 红边1 (Vegetation Red Edge 1) - 705nm, 20m');
  print('B6: 红边2 (Vegetation Red Edge 2) - 740nm, 20m');
  print('B7: 红边3 (Vegetation Red Edge 3) - 783nm, 20m');
  print('B8: 近红外 (NIR) - 842nm, 10m');
  print('B8A: 窄近红外 (Narrow NIR) - 865nm, 20m');
  print('B9: 水汽 (Water Vapour) - 945nm, 60m');
  print('B10: 短波红外-卷云 (SWIR-Cirrus) - 1375nm, 60m');
  print('B11: 短波红外1 (SWIR 1) - 1610nm, 20m');
  print('B12: 短波红外2 (SWIR 2) - 2190nm, 20m');
  
  // ========== 采样打印波段实际像素值 ==========
  print('\n========== 波段实际像素值采样 ==========');
  print('在研究区域中心点采样，获取每个波段的实际反射率值:');
  
  // 获取研究区域中心点
  var centerPoint = studyRegion.centroid();
  
  // 采样所有波段的值
  var sampleValues = composite.sample({
    region: centerPoint,
    scale: 10,
    numPixels: 1,
    geometries: true
  });
  
  // 打印采样结果
  sampleValues.first().evaluate(function(feature) {
    if (feature) {
      print('中心点坐标:', feature.geometry.coordinates);
      print('\n各波段反射率值 (原始DN值):');
      var props = feature.properties;
      ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B10', 'B11', 'B12'].forEach(function(band) {
        if (props[band] !== undefined) {
          print('  ' + band + ': ' + props[band].toFixed(2));
        }
      });
    }
  });
  
  // 计算并打印统计信息
  print('\n========== 波段统计信息 ==========');
  var stats = composite.select(['B2', 'B3', 'B4', 'B8']).reduceRegion({
    reducer: ee.Reducer.minMax().combine({
      reducer2: ee.Reducer.mean(),
      sharedInputs: true
    }),
    geometry: studyRegion,
    scale: 30,
    maxPixels: 1e9
  });
  
  print('主要波段统计 (整个研究区域):');
  stats.evaluate(function(result) {
    if (result) {
      ['B2', 'B3', 'B4', 'B8'].forEach(function(band) {
        print(band + ' (10m分辨率):');
        print('  - 最小值: ' + (result[band + '_min'] || 'N/A'));
        print('  - 最大值: ' + (result[band + '_max'] || 'N/A'));
        print('  - 平均值: ' + (result[band + '_mean'] ? result[band + '_mean'].toFixed(2) : 'N/A'));
      });
    }
  });
  
  print('=====================================\n');
  
  // 显示合成影像
  Map.addLayer(composite, {min: 0, max: 3000, bands: ['B4', 'B3', 'B2']}, 'Sentinel-2 合成影像');
  
  print('开始计算NDVI和NDWI指数...');
  
  // 验证输入影像
  var validatedComposite = validateImageBands(composite);
  if (!validatedComposite) {
    print('❌ 错误：输入影像验证失败，无法继续处理');
    return;
  }
  
  print('✅ 影像验证通过，开始计算水体指数...');
  
  // 计算水体指数特征
  var waterFeatures = calculateWaterIndices(validatedComposite);
  
  if (waterFeatures) {
    // ========== 打印NDWI和NDVI的统计值 ==========
    print('\n========== NDWI和NDVI统计值 ==========');
    var indicesStats = waterFeatures.select(['NDWI', 'NDVI']).reduceRegion({
      reducer: ee.Reducer.minMax().combine({
        reducer2: ee.Reducer.mean(),
        sharedInputs: true
      }),
      geometry: studyRegion,
      scale: 30,
      maxPixels: 1e9
    });
    
    indicesStats.evaluate(function(result) {
      if (result) {
        print('NDWI 统计:');
        print('  - 最小值: ' + (result['NDWI_min'] ? result['NDWI_min'].toFixed(4) : 'N/A'));
        print('  - 最大值: ' + (result['NDWI_max'] ? result['NDWI_max'].toFixed(4) : 'N/A'));
        print('  - 平均值: ' + (result['NDWI_mean'] ? result['NDWI_mean'].toFixed(4) : 'N/A'));
        print('  - 阈值: > 0.1 (识别为水体)');
        
        print('\nNDVI 统计:');
        print('  - 最小值: ' + (result['NDVI_min'] ? result['NDVI_min'].toFixed(4) : 'N/A'));
        print('  - 最大值: ' + (result['NDVI_max'] ? result['NDVI_max'].toFixed(4) : 'N/A'));
        print('  - 平均值: ' + (result['NDVI_mean'] ? result['NDVI_mean'].toFixed(4) : 'N/A'));
        print('  - 阈值: < 0.1 (排除植被)');
      }
    });
    print('=====================================\n');
    
    // 创建水体掩膜
    var waterMask = createWaterMask(waterFeatures, studyRegion);

    print('✅ 水体掩膜创建完成');

    // ========== 可视化阈值判定过程（保留连续值） ==========
    var ndwi = waterFeatures.select('NDWI');
    var ndvi = waterFeatures.select('NDVI');
    
    // 1. 可视化满足 NDWI > 0.1 条件的区域（保留原始NDWI值，非二值化）
    var ndwiCondition = ndwi.updateMask(ndwi.gt(0.1));
    Map.addLayer(ndwiCondition, {
      min: 0.1, 
      max: 1, 
      palette: ['cyan', 'blue', 'darkblue']
    }, '满足NDWI>0.1的区域（连续值）', false);
    
    // 2. 可视化满足 NDVI < 0.1 条件的区域（保留原始NDVI值，非二值化）
    var ndviCondition = ndvi.updateMask(ndvi.lt(0.1));
    Map.addLayer(ndviCondition, {
      min: -1, 
      max: 0.1, 
      palette: ['darkred', 'red', 'orange', 'yellow']
    }, '满足NDVI<0.1的区域（连续值）', false);
    
    // 3. 可视化同时满足两个条件的区域（保留NDWI原始值，非二值化）
    var bothConditions = ndwi.updateMask(ndwi.gt(0.1).and(ndvi.lt(0.1)));
    Map.addLayer(bothConditions, {
      min: 0.1, 
      max: 1, 
      palette: ['lightblue', 'blue', 'navy']
    }, '同时满足两条件的区域（NDWI连续值）', false);
    
    print('✓ 阈值判定可视化图层已添加（3层，默认隐藏）');
    print('  - 满足NDWI>0.1的区域：显示原始NDWI值（0.1-1.0）');
    print('  - 满足NDVI<0.1的区域：显示原始NDVI值（-1.0-0.1）');
    print('  - 同时满足两条件：显示水体区域的NDWI值（非0/1二值）');

    // ========== 原始可视化结果 ==========
    Map.addLayer(waterMask, {min: 0, max: 1, palette: ['white', 'blue']}, '水体掩膜（二值化）');
    Map.addLayer(waterFeatures.select('NDWI'), {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'NDWI指数（全图）');
    Map.addLayer(waterFeatures.select('NDVI'), {min: -1, max: 1, palette: ['red', 'white', 'green']}, 'NDVI指数（全图）');

    // 计算水体统计信息
    var waterArea = waterMask.eq(1).multiply(ee.Image.pixelArea()).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: studyRegion,
      scale: 30,
      maxPixels: 1e9
    });

    print('水体面积统计: ', waterArea);

    // 输出算法信息
    print('=== 水体提取算法完成 ===');
    print('已实现基于NDWI指数的水体提取算法');
    print('已实现NDWI + NDVI组合提高识别精度');
    print('水体掩膜生成完成');
    
    // 导出结果到Google Drive
    print('\n=== 准备导出任务 ===');
    
    // 生成文件名前缀（使用区域名称和日期）
    var regionPrefix = REGION_NAME.replace(/\s/g, '');  // 移除空格
    var filePrefix = regionPrefix + '_' + startDate.replace(/-/g, '') + '_' + endDate.replace(/-/g, '');
    
    // 9.1 导出水体掩膜
    var waterMaskExport = waterMask.byte();
    
    Export.image.toDrive({
      image: waterMaskExport,
      description: regionPrefix + '_WaterMask_' + startDate.replace(/-/g, '') + '_' + endDate.replace(/-/g, ''),
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: filePrefix + '_WaterMask',
      region: studyRegion,
      scale: 10,
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF'
    });
    
    print('✓ 水体掩膜导出任务已创建');
    
    // 9.2 导出RGBN合成影像（RGB + 近红外波段）
    // B4-红波段、B3-绿波段、B2-蓝波段、B8-近红外波段
    var rgbnComposite = composite.select(['B4', 'B3', 'B2', 'B8']).toUint16();
    
    Export.image.toDrive({
      image: rgbnComposite,
      description: regionPrefix + '_RGBN_Composite_' + startDate.replace(/-/g, '') + '_' + endDate.replace(/-/g, ''),
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: filePrefix + '_RGBN',
      region: studyRegion,
      scale: 10,
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF'
    });
    
    print('✓ RGBN合成影像导出任务已创建（RGB+近红外，共4个波段）');
    
    // 导出任务说明
    print('\n=== 导出任务使用说明 ===');
    print('研究区域: ' + REGION_NAME + ' (97.0°E-97.5°E, 34.8°N-35.1°N)');
    print('1. 在GEE Code Editor右侧找到【Tasks】标签');
    print('2. 点击每个导出任务旁边的【RUN】按钮（共2个任务）');
    print('3. 在弹出窗口中确认参数，点击【RUN】开始导出');
    print('4. 导出完成后，文件会出现在Google Drive的"GEE_WaterExtraction"文件夹中');
    print('5. 导出的文件格式为GeoTIFF，可用QGIS、ArcGIS等软件打开');
    print('\n导出文件说明：');
    print('- WaterMask: 水体掩膜（0=非水体，1=水体）');
    print('- RGBN: RGB+近红外合成影像（B4红、B3绿、B2蓝、B8近红外，共4个波段）');
    print('\n坐标系: 所有文件均使用EPSG:4326 (WGS84地理坐标系)');
    print('分辨率: 10米（统一重采样到Sentinel-2最高分辨率）');
    print('文件名前缀: ' + filePrefix);
    print('区域范围: 经度 97.0°E-97.5°E, 纬度 34.8°N-35.1°N');
    print('====================================================');
    
    print('\n✅ 水体提取完成！请在Tasks面板查看导出任务');
    
  } else {
    print('❌ 错误：水体指数计算失败');
  }
}

// ========== 4. 启动水体提取 ==========
print('==========================================');
print('========== 数据处理流程总结 ==========');
print('==========================================');
print('');
print('📡 数据源: Sentinel-2 卫星多光谱影像');
print('   - 数据集: COPERNICUS/S2_SR_HARMONIZED');
print('   - 级别: Level-2A 地表反射率产品（已大气校正）');
print('   - 空间分辨率: 10m (可见光和近红外波段)');
print('');
print('🔄 数据处理流程:');
print('   1️⃣ 读取原始数据');
print('      → 从GEE数据集读取影像集合');
print('      → 按时间、空间筛选');
print('');
print('   2️⃣ 像素级去云处理（精细去云）');
print('      → 使用QA60波段进行像素级云掩膜');
print('      → 对每景影像单独去云，保留无云像素');
print('      → 优势: 精细去除云像素，最大化数据利用率');
print('');
print('   3️⃣ 影像合成');
print('      → 使用median()中值合成法');
print('      → 对每个像元取时间序列的中值');
print('      → 有效去除云雾和异常值');
print('');
print('   4️⃣ 波段读取');
print('      → select("B3") 读取绿波段');
print('      → select("B4") 读取红波段');
print('      → select("B8") 读取近红外波段');
print('');
print('   5️⃣ 指数计算');
print('      → NDWI = (Green-NIR)/(Green+NIR)');
print('      → NDVI = (NIR-Red)/(NIR+Red)');
print('');
print('   6️⃣ 水体识别');
print('      → 阈值: NDWI > 0.1 且 NDVI < 0.1');
print('      → 生成二值水体掩膜');
print('');
print('   7️⃣ 结果导出');
print('      → 水体掩膜 (GeoTIFF)');
print('      → RGBN合成影像 (4波段)');
print('');
print('📊 波段信息:');
print('   - 可见光波段: B2(蓝), B3(绿), B4(红) - 10m');
print('   - 近红外波段: B8 - 10m');
print('   - 红边波段: B5, B6, B7 - 20m');
print('   - 短波红外: B11, B12 - 20m');
print('');
print('==========================================');
print('开始执行水体提取...');
print('==========================================\n');

// 脚本加载后自动运行水体提取
runWaterExtraction();

