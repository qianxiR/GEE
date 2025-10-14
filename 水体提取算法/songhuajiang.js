/**
 * 定义研究区域 - 松花江流域（缩小版）
 * 入参:
 * - 无（使用固定的经纬度范围）
 * 方法:
 * - 使用 ee.Geometry.Rectangle 根据经纬度范围创建矩形研究区域
 * - 基于松花江流域中心点，范围缩小为原来的一半（线性尺度）
 * - 当前范围：北纬44.184°至49.150°，东经123.029°至129.355°
 * - 区域面积约为原始范围的1/4
 * 出参:
 * - songhuajiang_region (ee.Geometry.Rectangle): 松花江流域矩形区域（缩小版）
 */
// 1. 定义研究区域 - 松花江流域经纬度范围（缩小版）
// 原始范围：经度 119.867°-132.517°E，纬度 41.7°-51.633°N
// 中心点：经度 126.192°E，纬度 46.667°N
// 缩小策略：保持中心点不变，经纬度跨度各缩小一半
// 新范围（十进制度）：
// 纬度：44.184°N - 49.150°N（跨度约4.97°）
// 经度：123.029°E - 129.355°E（跨度约6.33°）
// Rectangle 格式：[最小经度, 最小纬度, 最大经度, 最大纬度]
var songhuajiang_region = ee.Geometry.Rectangle([123.029, 44.184, 129.355, 49.150]);

// 在地图上显示研究区域边界
// fillColor: 透明填充，color: 黄色边界线
Map.addLayer(songhuajiang_region, {color: 'ffff00'}, '松花江流域研究区域');

// 将地图视图定位到研究区域中心，缩放级别7（适合大区域）
Map.centerObject(songhuajiang_region, 7);

// 设置裁剪区域变量，用于后续数据处理
var new_clip_region = songhuajiang_region;

// 2. 获取 Sentinel-2 数据
var startDate_2024 = '2025-06-01';
var endDate_2024 = '2025-07-31';

// 获取 Sentinel-2 数据，只筛选云量少的影像
var S2_2024 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(new_clip_region)
  .filterDate(startDate_2024, endDate_2024)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

// 3. 计算影像中值合成，保留原始数据
// 使用 median() 对时间序列影像取中值，减少云影响
// clip() 将影像裁剪到松花江流域研究区域边界
var composite_2024 = S2_2024.median().clip(songhuajiang_region);

// 4. 可视化合成影像
Map.addLayer(composite_2024, {min: 0, max: 3000, bands: ['B4', 'B3', 'B2']}, 'Sentinel-2 Composite 2024');

/**
 * 简化的阈值确定函数
 * 入参:
 * - histogram (ee.Dictionary): 影像直方图数据（实际不使用）
 * 方法:
 * - 使用经验阈值，避免复杂的OTSU计算
 * - 对于水体指数，使用经过验证的固定阈值
 * 出参:
 * - ee.Number: 水体指数阈值
 */
function otsu(histogram) {
  // 使用经验阈值，避免复杂的OTSU计算
  // 对于MNDWI和NDWI，0.2是一个经过验证的有效阈值
  return ee.Number(0.2);
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
  // 检查必需的波段是否存在（包含所有水体指数计算需要的波段）
  // B2(蓝)、B3(绿)、B4(红)、B8(近红外)、B11(短波红外1)、B12(短波红外2)
  var requiredBands = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12'];
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
 * 计算多种水体指数特征
 * 入参:
 * - image (ee.Image): 输入的多光谱影像
 * 方法:
 * - 计算NDWI（归一化水体指数）：(GREEN-NIR)/(GREEN+NIR) - 排除植被
 * - 计算MNDWI（改进归一化水体指数）：(GREEN-SWIR)/(GREEN+SWIR) - 排除建筑物
 * - 计算AWEIsh（自动水体提取指数）：BLUE+2.5×GREEN-1.5×(NIR+SWIR1)-0.25×SWIR2 - 排除阴影
 * - 计算WI2015（水体指数2015）：1.7204+171×GREEN+3×RED-70×NIR-45×SWIR1-71×SWIR2 - 提高精度
 * - 计算NDVI（归一化植被指数）：(NIR-RED)/(NIR+RED) - 辅助判断
 * 出参:
 * - ee.Image: 包含所有水体指数和NDVI特征的影像
 */
function calculateWaterIndices(image) {
  // 验证影像波段完整性
  var validatedImage = validateImageBands(image);
  if (!validatedImage) {
    print('错误：影像波段验证失败');
    return null;
  }
  
  // 获取波段 - Sentinel-2波段编号
  var blue = validatedImage.select('B2');     // 蓝波段
  var green = validatedImage.select('B3');    // 绿波段
  var red = validatedImage.select('B4');      // 红波段
  var nir = validatedImage.select('B8');      // 近红外
  var swir1 = validatedImage.select('B11');   // 短波红外1
  var swir2 = validatedImage.select('B12');   // 短波红外2
  
  // 1. NDWI（归一化水体指数）
  // 公式：(GREEN-NIR)/(GREEN+NIR)
  // 作用：利用水体在近红外波段强吸收特性，排除植被干扰
  var ndwi = green.subtract(nir).divide(green.add(nir)).rename('NDWI');
  
  // 2. MNDWI（改进归一化水体指数）
  // 公式：(GREEN-SWIR)/(GREEN+SWIR)
  // 作用：使用短波红外替代近红外，能更好地排除建筑物和土壤干扰
  var mndwi = green.subtract(swir1).divide(green.add(swir1)).rename('MNDWI');
  
  // 3. AWEIsh（自动水体提取指数 - 含阴影）
  // 公式：BLUE+2.5×GREEN-1.5×(NIR+SWIR1)-0.25×SWIR2
  // 作用：专门设计用于排除阴影干扰，适用于城市和山区
  var aweish = blue.add(green.multiply(2.5))
    .subtract(nir.add(swir1).multiply(1.5))
    .subtract(swir2.multiply(0.25))
    .rename('AWEIsh');
  
  // 4. WI2015（水体指数2015）
  // 公式：1.7204+171×GREEN+3×RED-70×NIR-45×SWIR1-71×SWIR2
  // 作用：基于线性判别分析，提供更高的分类精度
  // 注意：需要对原始反射率进行归一化处理（除以10000）
  var wi2015 = green.multiply(171).add(red.multiply(3))
    .subtract(nir.multiply(70))
    .subtract(swir1.multiply(45))
    .subtract(swir2.multiply(71))
    .add(ee.Image.constant(1.7204))
    .divide(10000)  // 归一化到合理范围
    .rename('WI2015');
  
  // 5. NDVI（归一化植被指数）
  // 公式：(NIR-RED)/(NIR+RED)
  // 作用：辅助判断，排除植被像元
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  
  // 组合所有特征波段和指数
  var features = validatedImage.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .addBands(ndwi)
    .addBands(mndwi)
    .addBands(aweish)
    .addBands(wi2015)
    .addBands(ndvi);
  
  return features;
}

/**
 * 使用多指数组合创建水体掩膜
 * 入参:
 * - image (ee.Image): 包含NDWI、MNDWI、AWEIsh、WI2015和NDVI的影像
 * - region (ee.Geometry): 研究区域
 * 方法:
 * - 使用NDWI、MNDWI、AWEIsh、WI2015多指数组合判断
 * - NDWI > 0.2 排除植被
 * - MNDWI > 0.1 排除建筑物和土壤
 * - AWEIsh > 0 排除阴影
 * - NDVI < 0.1 进一步排除植被
 * - 多指数组合策略：(NDWI>0.2 或 MNDWI>0.1) 且 AWEIsh>0 且 NDVI<0.1
 * 出参:
 * - ee.Image: 水体掩膜（1=水体，0=非水体）
 */
function createWaterMask(image, region) {
  var ndwi = image.select('NDWI');
  var mndwi = image.select('MNDWI');
  var aweish = image.select('AWEIsh');
  var wi2015 = image.select('WI2015');
  var ndvi = image.select('NDVI');
  
  // 设置各指数的经验阈值
  var ndwiThreshold = ee.Number(0.2);    // NDWI阈值（排除植被）
  var mndwiThreshold = ee.Number(0.1);   // MNDWI阈值（排除建筑物）
  var aweishThreshold = ee.Number(0);    // AWEIsh阈值（排除阴影）
  var wi2015Threshold = ee.Number(0.2);  // WI2015阈值（综合判断）
  var ndviThreshold = ee.Number(0.1);    // NDVI阈值（排除植被）
  
  print('=== 水体指数阈值设置 ===');
  print('NDWI 阈值: ', ndwiThreshold);
  print('MNDWI 阈值: ', mndwiThreshold);
  print('AWEIsh 阈值: ', aweishThreshold);
  print('WI2015 阈值: ', wi2015Threshold);
  print('NDVI 阈值: ', ndviThreshold);
  
  // 多指数组合判断策略
  // 条件1：NDWI或MNDWI满足阈值（至少有一个水体指数认为是水体）
  var waterCondition1 = ndwi.gt(ndwiThreshold).or(mndwi.gt(mndwiThreshold));
  
  // 条件2：AWEIsh大于0（排除阴影）
  var waterCondition2 = aweish.gt(aweishThreshold);
  
  // 条件3：WI2015大于阈值（高精度判断）
  var waterCondition3 = wi2015.gt(wi2015Threshold);
  
  // 条件4：NDVI小于阈值（排除植被）
  var waterCondition4 = ndvi.lt(ndviThreshold);
  
  // 最终水体掩膜：综合所有条件
  // 策略：(NDWI或MNDWI) 且 AWEIsh 且 WI2015 且 非植被
  var waterMask = waterCondition1
    .and(waterCondition2)
    .and(waterCondition3)
    .and(waterCondition4);
  
  print('水体识别策略：(NDWI>0.2 或 MNDWI>0.1) 且 AWEIsh>0 且 WI2015>0.2 且 NDVI<0.1');
  
  return waterMask.rename('WaterMask');
}



// 5. 计算NDVI和NDWI指数
print('开始计算NDVI和NDWI指数...');

// 验证输入影像
var validatedComposite = validateImageBands(composite_2024);
if (!validatedComposite) {
  print('错误：输入影像验证失败，无法继续处理');
} else {
  print('影像验证通过，开始计算水体指数...');
  
  // 计算水体指数特征
  var waterFeatures = calculateWaterIndices(validatedComposite);
  
  if (waterFeatures) {
    // 创建水体掩膜
    var waterMask = createWaterMask(waterFeatures, new_clip_region);

    print('水体掩膜创建完成');

    // 6. 可视化结果
    Map.addLayer(waterMask, {min: 0, max: 1, palette: ['white', 'blue']}, '水体掩膜（多指数组合）');
    Map.addLayer(waterFeatures.select('NDWI'), {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'NDWI指数');
    Map.addLayer(waterFeatures.select('MNDWI'), {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'MNDWI指数');
    Map.addLayer(waterFeatures.select('AWEIsh'), {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'AWEIsh指数');
    Map.addLayer(waterFeatures.select('WI2015'), {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'WI2015指数');
    Map.addLayer(waterFeatures.select('NDVI'), {min: -1, max: 1, palette: ['red', 'white', 'green']}, 'NDVI指数');

    // 7. 计算水体统计信息
    var waterArea = waterMask.eq(1).multiply(ee.Image.pixelArea()).reduceRegion({
      reducer: ee.Reducer.sum(),
      geometry: new_clip_region,
      scale: 30,
      maxPixels: 1e9
    });

    print('水体面积统计: ', waterArea);

    // 8. 输出算法信息
    print('=== 水体提取算法完成 ===');
    print('已实现多指数组合水体提取算法：');
    print('  - NDWI：排除植被干扰');
    print('  - MNDWI：排除建筑物和土壤干扰');
    print('  - AWEIsh：排除阴影干扰');
    print('  - WI2015：提高分类精度');
    print('  - NDVI：辅助排除植被');
    print('水体掩膜生成完成（多指数投票机制）');
    
    /**
     * 导出结果到Google Drive
     * 方法:
     * - 使用 Export.image.toDrive() 将影像导出到Google Drive
     * - 导出三个关键结果：水体掩膜、NDWI指数、合成影像
     * - 导出参数说明：
     *   · scale: 30m（Sentinel-2的原始分辨率）
     *   · maxPixels: 1e13（允许导出大范围影像）
     *   · crs: 'EPSG:4326'（WGS84地理坐标系）
     *   · fileFormat: 'GeoTIFF'（通用地理影像格式）
     * 注意:
     * - 导出任务不会立即执行，需要在GEE界面的Tasks标签中点击Run启动
     * - 导出的文件会保存到Google Drive的指定文件夹中
     */
    // 9. 导出结果到Google Drive
    print('\n=== 准备导出任务 ===');
    
    // 9.1 导出水体掩膜（最重要的结果）
    // 将布尔值转换为整数（0和1），方便后续分析
    var waterMaskExport = waterMask.byte();
    
    Export.image.toDrive({
      image: waterMaskExport,
      description: 'WaterMask_' + startDate_2024 + '_' + endDate_2024,  // 任务名称
      folder: 'GEE_WaterExtraction',                 // Google Drive文件夹名
      fileNamePrefix: 'Songhuajiang_WaterMask_' + startDate_2024 + '_' + endDate_2024,  // 文件名
      region: new_clip_region,                       // 导出区域
      scale: 10,                                     // 分辨率10米（统一到最高分辨率）
      maxPixels: 1e13,                               // 最大像素数
      crs: 'EPSG:4326',                              // 坐标系
      fileFormat: 'GeoTIFF'                          // 文件格式
    });
    
    print('✓ 水体掩膜导出任务已创建');
    
    // 9.2 导出NDWI指数影像（用于验证和进一步分析）
    var ndwiExport = waterFeatures.select('NDWI').toFloat();
    
    Export.image.toDrive({
      image: ndwiExport,
      description: 'NDWI_Index_' + startDate_2024 + '_' + endDate_2024,
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: 'Songhuajiang_NDWI_' + startDate_2024 + '_' + endDate_2024,
      region: new_clip_region,
      scale: 10,  // 分辨率10米（统一到最高分辨率）
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF'
    });
    
    print('✓ NDWI指数导出任务已创建');
    
    // 9.3 导出完整光谱波段的原始合成影像（仅光谱波段B1-B12）
    /**
     * 导出完整的Sentinel-2光谱波段
     * 仅包含光谱波段：B1, B2, B3, B4, B5, B6, B7, B8, B8A, B9, B11, B12
     * 不包含辅助波段（AOT, WVP, SCL, TCI等）
     * 分辨率：10米（统一重采样到最高分辨率）
     */
    var spectralBands = composite_2024.select(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12']);
    
    Export.image.toDrive({
      image: spectralBands,
      description: 'AllBands_' + startDate_2024 + '_' + endDate_2024,
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: 'Songhuajiang_AllBands_' + startDate_2024 + '_' + endDate_2024,
      region: new_clip_region,
      scale: 10,  // 使用10米分辨率，与Sentinel-2最高分辨率一致
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF'
    });
    
    print('✓ 完整光谱波段合成影像导出任务已创建（B1-B12，共12个波段）');
    
    // 9.4 导出RGB真彩色合成影像（作为快速查看的参考底图）
    var rgbComposite = composite_2024.select(['B4', 'B3', 'B2']).toUint16();
    
    Export.image.toDrive({
      image: rgbComposite,
      description: 'RGB_Composite_' + startDate_2024 + '_' + endDate_2024,
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: 'Songhuajiang_RGB_' + startDate_2024 + '_' + endDate_2024,
      region: new_clip_region,
      scale: 10,
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF'
    });
    
    print('✓ RGB合成影像导出任务已创建');
    
    // 9.5 导出NDVI指数影像（用于植被分析和验证排除效果）
    var ndviExport = waterFeatures.select('NDVI').toFloat();
    
    Export.image.toDrive({
      image: ndviExport,
      description: 'NDVI_Index_' + startDate_2024 + '_' + endDate_2024,
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: 'Songhuajiang_NDVI_' + startDate_2024 + '_' + endDate_2024,
      region: new_clip_region,
      scale: 10,
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF'
    });
    
    print('✓ NDVI指数导出任务已创建');
    
    // 9.6 导出MNDWI指数影像
    var mndwiExport = waterFeatures.select('MNDWI').toFloat();
    
    Export.image.toDrive({
      image: mndwiExport,
      description: 'MNDWI_Index_' + startDate_2024 + '_' + endDate_2024,
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: 'Songhuajiang_MNDWI_' + startDate_2024 + '_' + endDate_2024,
      region: new_clip_region,
      scale: 10,
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF'
    });
    
    print('✓ MNDWI指数导出任务已创建');
    
    // 9.7 导出AWEIsh指数影像
    var aweishExport = waterFeatures.select('AWEIsh').toFloat();
    
    Export.image.toDrive({
      image: aweishExport,
      description: 'AWEIsh_Index_' + startDate_2024 + '_' + endDate_2024,
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: 'Songhuajiang_AWEIsh_' + startDate_2024 + '_' + endDate_2024,
      region: new_clip_region,
      scale: 10,
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF'
    });
    
    print('✓ AWEIsh指数导出任务已创建');
    
    // 9.8 导出WI2015指数影像
    var wi2015Export = waterFeatures.select('WI2015').toFloat();
    
    Export.image.toDrive({
      image: wi2015Export,
      description: 'WI2015_Index_' + startDate_2024 + '_' + endDate_2024,
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: 'Songhuajiang_WI2015_' + startDate_2024 + '_' + endDate_2024,
      region: new_clip_region,
      scale: 10,
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF'
    });
    
    print('✓ WI2015指数导出任务已创建');
    
    // 导出任务说明
    print('\n=== 导出任务使用说明 ===');
    print('1. 在GEE Code Editor右侧找到【Tasks】标签');
    print('2. 点击每个导出任务旁边的【RUN】按钮（共8个任务）');
    print('3. 在弹出窗口中确认参数，点击【RUN】开始导出');
    print('4. 导出完成后，文件会出现在Google Drive的"GEE_WaterExtraction"文件夹中');
    print('5. 导出的文件格式为GeoTIFF，可用QGIS、ArcGIS等软件打开');
    print('\n导出文件说明：');
    print('- WaterMask: 水体掩膜（0=非水体，1=水体）- 多指数组合结果');
    print('- NDWI: 归一化水体指数（-1到1，排除植被）');
    print('- MNDWI: 改进归一化水体指数（-1到1，排除建筑物）');
    print('- AWEIsh: 自动水体提取指数（值越高越可能是水体，排除阴影）');
    print('- WI2015: 水体指数2015（高精度分类）');
    print('- NDVI: 归一化植被指数（-1到1，辅助排除植被）');
    print('- AllBands: 完整光谱波段合成影像（B1-B12共12个波段）');
    print('- RGB: 原始卫星影像真彩色合成（用于快速查看和对比参考）');
    print('\n坐标系: 所有文件均使用EPSG:4326 (WGS84地理坐标系)');
    print('分辨率: 10米（统一重采样到Sentinel-2最高分辨率）');
    print('\n多指数组合策略: (NDWI>0.2 或 MNDWI>0.1) 且 AWEIsh>0 且 WI2015>0.2 且 NDVI<0.1');
    print('松花江流域研究区域的所有结果将导出完成！');
    
  } else {
    print('错误：水体指数计算失败');
  }
}

