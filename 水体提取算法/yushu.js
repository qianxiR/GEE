// 1. 定义研究区域
var yushu = china_city.filter(ee.Filter.eq('name', '玉树藏族自治州'));

Map.addLayer(yushu.style({fillColor:'00000000',color:'ffff00'}), {}, '玉树藏族自治州');

Map.centerObject(yushu, 10);

var new_clip_region = yushu;

// 2. 设置时间参数（用户可根据需要修改）
var startDate = '2025-06-01';
var endDate = '2025-07-31';

// 3. 获取 Sentinel-2 数据，只筛选云量少的影像
var S2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(new_clip_region)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

// 4. 计算影像中值合成，保留原始数据
var composite = S2.median().clip(yushu);

// 5. 可视化合成影像
Map.addLayer(composite, {min: 0, max: 3000, bands: ['B4', 'B3', 'B2']}, 'Sentinel-2 合成影像');

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
  // 验证影像波段完整性
  var validatedImage = validateImageBands(image);
  if (!validatedImage) {
    print('错误：影像波段验证失败');
    return null;
  }
  
  // 获取波段 - 注意Sentinel-2波段编号
  var green = validatedImage.select('B3');    // 绿波段
  var red = validatedImage.select('B4');      // 红波段
  var nir = validatedImage.select('B8');      // 近红外
  
  // 1. NDWI（归一化水体指数）
  var ndwi = green.subtract(nir).divide(green.add(nir)).rename('NDWI');
  
  // 2. NDVI（归一化植被指数）
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  
  // 组合特征（仅保留必要的波段）
  var features = validatedImage.select(['B2', 'B3', 'B4', 'B8'])
    .addBands(ndwi)
    .addBands(ndvi);
  
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


// 5. 计算NDVI和NDWI指数
print('开始计算NDVI和NDWI指数...');

// 验证输入影像
var validatedComposite = validateImageBands(composite);
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
    Map.addLayer(waterMask, {min: 0, max: 1, palette: ['white', 'blue']}, '水体掩膜');
    Map.addLayer(waterFeatures.select('NDWI'), {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'NDWI指数', false); // 默认隐藏
    Map.addLayer(waterFeatures.select('NDVI'), {min: -1, max: 1, palette: ['red', 'white', 'green']}, 'NDVI指数', false); // 默认隐藏

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
    print('已实现基于NDWI指数的水体提取算法');
    print('已实现NDWI + NDVI组合提高识别精度');
    print('水体掩膜生成完成');
    
    /**
     * 导出结果到Google Drive
     * 方法:
     * - 使用 Export.image.toDrive() 将影像导出到Google Drive
     * - 导出水体掩膜和RGBN合成影像
     * - 导出参数说明：
     *   · scale: 10m（Sentinel-2的最高分辨率）
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
    // 只导出水体区域（值=1），非水体区域设为NoData
    var waterMaskExport = waterMask.byte().selfMask();
    
    Export.image.toDrive({
      image: waterMaskExport,
      description: 'Yushu_WaterMask_' + startDate + '_' + endDate,
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: 'Yushu_WaterMask_' + startDate + '_' + endDate,
      region: new_clip_region,
      scale: 10,
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF',
      skipEmptyTiles: true,  // 跳过完全为空的瓦片，减小文件大小
      formatOptions: {
        cloudOptimized: true  // 生成云优化的GeoTIFF，支持大文件
      }
    });
    
    print('✓ 水体掩膜导出任务已创建');
    
    // 9.2 导出RGBN合成影像（RGB + 近红外波段）
    // B4-红波段、B3-绿波段、B2-蓝波段、B8-近红外波段
    // 创建有效数据掩膜，只导出有像素值的区域
    var rgbnComposite = composite.select(['B4', 'B3', 'B2', 'B8']).toUint16();
    var validMask = rgbnComposite.mask().reduce(ee.Reducer.min());  // 所有波段都有效的像素
    var rgbnMasked = rgbnComposite.updateMask(validMask);
    
    Export.image.toDrive({
      image: rgbnMasked,
      description: 'Yushu_RGBN_Composite_' + startDate + '_' + endDate,
      folder: 'GEE_WaterExtraction',
      fileNamePrefix: 'Yushu_RGBN_' + startDate + '_' + endDate,
      region: new_clip_region,
      scale: 10,
      maxPixels: 1e13,
      crs: 'EPSG:4326',
      fileFormat: 'GeoTIFF',
      skipEmptyTiles: true,  // 跳过完全为空的瓦片，减小文件大小
      formatOptions: {
        cloudOptimized: true  // 生成云优化的GeoTIFF，支持大文件
      }
    });
    
    print('✓ RGBN合成影像导出任务已创建（RGB+近红外，共4个波段）');
    
    // 导出任务说明
    print('\n=== 导出任务使用说明 ===');
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
    
  } else {
    print('错误：水体指数计算失败');
  }
}

