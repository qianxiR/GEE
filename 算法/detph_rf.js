// 1. 定义研究区域
var yushu = china_city.filter(ee.Filter.eq('name', '玉树藏族自治州'));

Map.addLayer(yushu.style({fillColor:'00000000',color:'ffff00'}), {}, '玉树藏族自治州');

Map.centerObject(yushu, 10);

var new_clip_region = yushu;

// 2. 获取 Sentinel-2 数据
var startDate_2024 = '2025-06-01';
var endDate_2024 = '2025-07-31';

// 获取 Sentinel-2 数据，只筛选云量少的影像
var S2_2024 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(new_clip_region)
  .filterDate(startDate_2024, endDate_2024)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

// 3. 计算影像中值合成，保留原始数据
var composite_2024 = S2_2024.median().clip(yushu);

// 4. 可视化合成影像
Map.addLayer(composite_2024, {min: 0, max: 3000, bands: ['B4', 'B3', 'B2']}, 'Sentinel-2 Composite 2024');

/**
 * OTSU算法实现自适应阈值确定
 * 入参:
 * - histogram (ee.Dictionary): 影像直方图数据
 * 方法:
 * - 使用最大类间方差法自动确定最佳分割阈值
 * - 无需人工设定阈值，根据图像自身特性确定
 * 出参:
 * - ee.Number: 最佳分割阈值
 */
function otsu(histogram) {
  var counts = ee.Array(ee.Dictionary(histogram).get('histogram'));
  var means = ee.Array(ee.Dictionary(histogram).get('bucketMeans'));
  var size = means.length().get([0]);
  var total = counts.reduce(ee.Reducer.sum(), [0]).get([0]);
  var sum = means.multiply(counts).reduce(ee.Reducer.sum(), [0]).get([0]);
  var mean = sum.divide(total);
  
  var indices = ee.List.sequence(1, size);
  
  var bss = indices.map(function(i) {
    // 计算前景和背景的均值与数量
    var aCounts = counts.slice(0, 0, i);
    var aCount = aCounts.reduce(ee.Reducer.sum(), [0]).get([0]);
    var aMeans = means.slice(0, 0, i);
    var aMean = aMeans.multiply(aCounts)
        .reduce(ee.Reducer.sum(), [0]).get([0])
        .divide(aCount);
    var bCount = total.subtract(aCount);
    var bMean = sum.subtract(aCount.multiply(aMean)).divide(bCount);
    // 计算类间方差
    return aCount.multiply(aMean.subtract(mean).pow(2))
            .add(bCount.multiply(bMean.subtract(mean).pow(2)));
  });
  
  // 找到最大类间方差对应的索引
  var maxBss = bss.reduce(ee.Reducer.max());
  var maxIndex = bss.indexOf(maxBss);
  return means.get([maxIndex]);
}

/**
 * 计算五种水体指数特征
 * 入参:
 * - image (ee.Image): 输入的多光谱影像
 * 方法:
 * - 计算五种常用的水体指数：NDWI、MNDWI、AWEI_nsh、AWEI_sh、WI_2015
 * - 利用水体在不同光谱波段的反射差异进行识别
 * - 结合NDVI指数排除植被干扰
 * 出参:
 * - ee.Image: 包含五种水体指数和NDVI特征的影像
 */
function calculateWaterIndices(image) {
  // 获取波段 - 注意Sentinel-2波段编号
  var blue = image.select('B2');     // 蓝波段
  var green = image.select('B3');    // 绿波段
  var red = image.select('B4');      // 红波段
  var nir = image.select('B8');      // 近红外
  var swir1 = image.select('B11');   // 短波红外1
  var swir2 = image.select('B12');   // 短波红外2
  
  // 1. NDWI（归一化水体指数）
  var ndwi = green.subtract(nir).divide(green.add(nir)).rename('NDWI');
  
  // 2. MNDWI（修改后的归一化水体指数）
  var mndwi = green.subtract(swir1).divide(green.add(swir1)).rename('MNDWI');
  
  // 3. AWEI_nsh（无阴影水体指数）
  var awein = green.subtract(swir1).multiply(4)
    .subtract(nir.multiply(0.25).add(swir2.multiply(2.75))).rename('AWEI_nsh');
  
  // 4. AWEI_sh（阴影水体指数）
  var aweish = blue.add(green.multiply(2.5))
    .subtract(nir.add(swir1).multiply(1.5))
    .subtract(swir2.multiply(0.25)).rename('AWEI_sh');
  
  // 5. WI_2015（2015版水体指数）
  var wi2015 = green.multiply(171)
    .add(red.multiply(3))
    .subtract(nir.multiply(70))
    .subtract(swir1.multiply(45))
    .subtract(swir2.multiply(71))
    .add(1.7204).rename('WI_2015');
  
  // 6. NDVI（归一化植被指数）
  var ndvi = nir.subtract(red).divide(nir.add(red)).rename('NDVI');
  
  // 组合所有特征
  var features = image.select(['B2', 'B3', 'B4', 'B8', 'B11', 'B12'])
    .addBands(ndwi)
    .addBands(mndwi)
    .addBands(awein)
    .addBands(aweish)
    .addBands(wi2015)
    .addBands(ndvi);
  
  return features;
}

/**
 * 使用OTSU算法创建自适应水体掩膜
 * 入参:
 * - image (ee.Image): 包含五种水体指数和NDVI的影像
 * - region (ee.Geometry): 研究区域
 * 方法:
 * - 使用OTSU算法自动确定MNDWI的最佳分割阈值
 * - 结合NDVI < 0.1 排除植被干扰
 * - 多指数融合提高水体识别精度
 * 出参:
 * - ee.Image: 水体掩膜（1=水体，0=非水体）
 */
function createWaterMask(image, region) {
  var mndwi = image.select('MNDWI');
  var ndvi = image.select('NDVI');
  var ndwi = image.select('NDWI');
  var awein = image.select('AWEI_nsh');
  var aweish = image.select('AWEI_sh');
  var wi2015 = image.select('WI_2015');
  
  // 使用OTSU算法确定MNDWI的最佳阈值
  var mndwiHistogram = mndwi.reduceRegion({
    reducer: ee.Reducer.histogram(255, 0.01, 1),
    geometry: region,
    scale: 30,
    maxPixels: 1e9
  });
  
  var mndwiThreshold = otsu(mndwiHistogram);
  print('MNDWI OTSU阈值: ', mndwiThreshold);
  
  // 使用OTSU算法确定NDWI的最佳阈值
  var ndwiHistogram = ndwi.reduceRegion({
    reducer: ee.Reducer.histogram(255, 0.01, 1),
    geometry: region,
    scale: 30,
    maxPixels: 1e9
  });
  
  var ndwiThreshold = otsu(ndwiHistogram);
  print('NDWI OTSU阈值: ', ndwiThreshold);
  
  // 多指数融合的水体识别条件
  var waterMask1 = mndwi.gt(mndwiThreshold).and(ndvi.lt(0.1));  // MNDWI + NDVI
  var waterMask2 = ndwi.gt(ndwiThreshold).and(ndvi.lt(0.1));    // NDWI + NDVI
  var waterMask3 = awein.gt(0).and(ndvi.lt(0.1));               // AWEI_nsh + NDVI
  var waterMask4 = aweish.gt(0).and(ndvi.lt(0.1));              // AWEI_sh + NDVI
  var waterMask5 = wi2015.gt(0).and(ndvi.lt(0.1));              // WI_2015 + NDVI
  
  // 融合多种水体指数结果（至少2个指数同时识别为水体）
  var waterMask = waterMask1.add(waterMask2).add(waterMask3)
    .add(waterMask4).add(waterMask5).gte(2);
  
  return waterMask.rename('WaterMask');
}

/**
 * 随机森林水体分类（基于OTSU阈值优化）
 * 入参:
 * - image (ee.Image): 包含特征的多光谱影像
 * - region (ee.Geometry): 研究区域
 * - numTrees (number): 随机森林树的数量，默认50
 * 方法:
 * - 使用OTSU算法确定的水体指数阈值生成训练样本
 * - 结合多种水体指数特征进行随机森林分类
 * - 提高水体识别的准确性和稳定性
 * 出参:
 * - ee.Image: 分类结果影像（0=非水体，1=水体）
 */
function randomForestWaterClassification(image, region, numTrees) {
  numTrees = numTrees || 50;
  
  // 计算水体指数特征
  var features = calculateWaterIndices(image);
  
  // 定义特征名称（包含所有水体指数）
  var featureNames = ['B2', 'B3', 'B4', 'B8', 'B11', 'B12', 
                     'NDWI', 'MNDWI', 'AWEI_nsh', 'AWEI_sh', 'WI_2015', 'NDVI'];
  
  // 使用OTSU算法确定阈值
  var mndwi = features.select('MNDWI');
  var ndwi = features.select('NDWI');
  var ndvi = features.select('NDVI');
  
  // 计算MNDWI的OTSU阈值
  var mndwiHistogram = mndwi.reduceRegion({
    reducer: ee.Reducer.histogram(255, 0.01, 1),
    geometry: region,
    scale: 30,
    maxPixels: 1e9
  });
  var mndwiThreshold = otsu(mndwiHistogram);
  
  // 计算NDWI的OTSU阈值
  var ndwiHistogram = ndwi.reduceRegion({
    reducer: ee.Reducer.histogram(255, 0.01, 1),
    geometry: region,
    scale: 30,
    maxPixels: 1e9
  });
  var ndwiThreshold = otsu(ndwiHistogram);
  
  print('MNDWI OTSU阈值: ', mndwiThreshold);
  print('NDWI OTSU阈值: ', ndwiThreshold);
  
  // 基于OTSU阈值创建训练样本
  var waterSamples = mndwi.gt(mndwiThreshold)
    .and(ndvi.lt(0.1));  // 水体样本：MNDWI > OTSU阈值 且 NDVI < 0.1
  
  var nonWaterSamples = mndwi.lt(mndwiThreshold.multiply(0.5))
    .and(ndvi.gt(0.2));  // 非水体样本：MNDWI < 0.5*OTSU阈值 且 NDVI > 0.2
  
  // 创建训练样本集合
  var waterPoints = waterSamples.updateMask(waterSamples).sample({
    region: region,
    scale: 30,
    numPixels: 1500,  // 增加样本数量
    seed: 42
  });
  
  var nonWaterPoints = nonWaterSamples.updateMask(nonWaterSamples).sample({
    region: region,
    scale: 30,
    numPixels: 1500,  // 增加样本数量
    seed: 42
  });
  
  // 添加类别标签
  var waterClass = waterPoints.map(function(feature) {
    return feature.set('class', 1);
  });
  
  var nonWaterClass = nonWaterPoints.map(function(feature) {
    return feature.set('class', 0);
  });
  
  // 合并训练样本
  var trainingData = waterClass.merge(nonWaterClass);
  
  print('训练样本数量: ' + trainingData.size().getInfo());
  
  // 训练随机森林分类器
  var classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: numTrees,
    variablesPerSplit: 6,  // 增加特征选择数量
    minLeafPopulation: 1,
    bagFraction: 0.6,      // 增加袋装比例
    maxNodes: null,
    seed: 42
  }).train({
    features: trainingData,
    classProperty: 'class',
    inputProperties: featureNames
  });
  
  // 应用分类器
  var classified = features.classify(classifier);
  
  return classified;
}

/**
 * 后处理优化水体分类结果
 * 入参:
 * - classified (ee.Image): 分类结果影像
 * - region (ee.Geometry): 研究区域
 * 方法:
 * - 使用形态学操作优化分类结果
 * - 去除噪声，填充小孔洞
 * 出参:
 * - ee.Image: 优化后的水体分类结果
 */
function postProcessWaterClassification(classified, region) {
  // 形态学开运算：去除小噪声
  var opened = classified.focal_min({radius: 2, units: 'pixels'})
    .focal_max({radius: 2, units: 'pixels'});
  
  // 形态学闭运算：填充小孔洞
  var closed = opened.focal_max({radius: 3, units: 'pixels'})
    .focal_min({radius: 3, units: 'pixels'});
  
  // 去除过小的连通区域
  var connected = closed.connectedPixelCount(8);
  var minSize = 50; // 最小连通区域大小
  var filtered = closed.updateMask(connected.gte(minSize));
  
  return filtered.clip(region);
}

/**
 * 生成网格分区函数
 * 入参:
 * - region (ee.Geometry): 研究区域几何对象
 * - gridSize (number): 网格大小（度），默认0.5度
 * 方法:
 * - 将研究区域划分为规则的矩形网格
 * - 过滤掉与研究区域不相交的网格
 * 出参:
 * - ee.FeatureCollection: 包含所有有效网格的要素集合
 */
function createGridPartitions(region, gridSize) {
  gridSize = gridSize || 1.0; // 增大网格尺寸，减少分区数量
  
  // 获取研究区域的边界框
  var bounds = region.bounds();
  
  // 计算网格数量 - 使用GEE正确语法
  var minLon = bounds.getInfo().coordinates[0][0][0];
  var maxLon = bounds.getInfo().coordinates[0][2][0];
  var minLat = bounds.getInfo().coordinates[0][0][1];
  var maxLat = bounds.getInfo().coordinates[0][2][1];
  
  var lonSteps = Math.ceil((maxLon - minLon) / gridSize);
  var latSteps = Math.ceil((maxLat - minLat) / gridSize);
  
  // 限制最大分区数量，避免内存溢出
  var maxPartitions = 20;
  if (lonSteps * latSteps > maxPartitions) {
    var scaleFactor = Math.sqrt(maxPartitions / (lonSteps * latSteps));
    lonSteps = Math.max(1, Math.floor(lonSteps * scaleFactor));
    latSteps = Math.max(1, Math.floor(latSteps * scaleFactor));
    print('分区数量过多，已调整为: ' + lonSteps + ' x ' + latSteps + ' = ' + (lonSteps * latSteps) + ' 个分区');
  } else {
    print('网格分区信息: ' + lonSteps + ' x ' + latSteps + ' = ' + (lonSteps * latSteps) + ' 个分区');
  }
  
  // 生成网格
  var grids = [];
  for (var i = 0; i < lonSteps; i++) {
    for (var j = 0; j < latSteps; j++) {
      var x1 = minLon + i * gridSize;
      var y1 = minLat + j * gridSize;
      var x2 = x1 + gridSize;
      var y2 = y1 + gridSize;
      
      var grid = ee.Geometry.Rectangle([x1, y1, x2, y2]);
      
      // 检查网格是否与研究区域相交
      var intersection = grid.intersection(region, 1);
      var hasIntersection = intersection.coordinates().size().gt(0);
      
      if (hasIntersection) {
        grids.push(ee.Feature(grid, {
          gridId: i * latSteps + j,
          row: i,
          col: j
        }));
      }
    }
  }
  
  return ee.FeatureCollection(grids);
}

/**
 * 分区导出数据函数
 * 入参:
 * - image (ee.Image): 要导出的影像
 * - region (ee.Geometry): 研究区域
 * - baseDescription (string): 基础描述名称
 * - gridSize (number): 网格大小，默认0.5度
 * 方法:
 * - 将大区域分割成小网格进行逐个导出
 * - 避免内存溢出和处理超时问题
 * 出参:
 * - 无返回值，直接提交导出任务到GEE任务队列
 */
function exportDataByPartitions(image, region, baseDescription, gridSize) {
  gridSize = gridSize || 0.5;
  
  // 生成网格分区
  var partitions = createGridPartitions(region, gridSize);
  
  // 获取分区数量
  var partitionCount = partitions.size();
  print('开始分区导出，共 ' + partitionCount.getInfo() + ' 个分区');
  
  // 遍历每个分区进行导出 - 使用GEE正确语法
  var partitionList = partitions.getInfo().features;
  
  partitionList.forEach(function(partition, index) {
    var gridGeometry = ee.Geometry(partition.geometry);
    var gridId = partition.properties.gridId;
    var row = partition.properties.row;
    var col = partition.properties.col;
    
    // 裁剪影像到当前网格
    var clippedImage = image.clip(gridGeometry);
    
    // 导出参数 - 使用兼容的字符串填充方法
    var paddedGridId = ('000' + gridId).slice(-3); // 将gridId填充为3位数字
    
    var exportParams = {
      image: clippedImage,
      description: baseDescription + '_partition_' + paddedGridId + '_r' + row + 'c' + col,
      folder: "GEE_Exports_Partitions",
      scale: 10,
      region: gridGeometry,
      fileFormat: "GeoTIFF",
      formatOptions: {
        cloudOptimized: true
      },
      maxPixels: 1e9 // 降低每个分区的最大像素数
    };
    
    // 提交导出任务
    Export.image.toDrive(exportParams);
    
    print('已提交分区 ' + (index + 1) + '/' + partitionList.length + ' 的导出任务');
  });
}

// 5. 执行随机森林水体分类
print('开始随机森林水体分类...');

// 进行水体分类
var waterClassification = randomForestWaterClassification(composite_2024, new_clip_region, 50);

// 后处理优化结果
var optimizedWater = postProcessWaterClassification(waterClassification, new_clip_region);

// 6. 应用OTSU水体掩膜优化分类结果
print('应用OTSU水体掩膜优化分类结果...');

// 计算水体指数特征
var waterFeatures = calculateWaterIndices(composite_2024);

// 创建OTSU水体掩膜
var waterMask = createWaterMask(waterFeatures, new_clip_region);

// 应用水体掩膜到分类结果（保留水体区域）
var finalWaterClassification = optimizedWater.updateMask(waterMask); // 保留水体区域

print('OTSU水体掩膜应用完成，已保留水体区域');

// 7. 可视化分类结果
Map.addLayer(waterClassification, {min: 0, max: 1, palette: ['white', 'blue']}, '随机森林水体分类');
Map.addLayer(optimizedWater, {min: 0, max: 1, palette: ['white', 'blue']}, '后处理优化水体分类');
Map.addLayer(waterMask, {min: 0, max: 1, palette: ['white', 'cyan']}, 'OTSU水体掩膜');
Map.addLayer(finalWaterClassification, {min: 0, max: 1, palette: ['white', 'blue']}, '最终水体分类（OTSU优化）');

// 可视化各种水体指数
Map.addLayer(waterFeatures.select('NDWI'), {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'NDWI指数');
Map.addLayer(waterFeatures.select('MNDWI'), {min: -1, max: 1, palette: ['red', 'white', 'blue']}, 'MNDWI指数');
Map.addLayer(waterFeatures.select('AWEI_nsh'), {min: -10, max: 10, palette: ['red', 'white', 'blue']}, 'AWEI_nsh指数');
Map.addLayer(waterFeatures.select('AWEI_sh'), {min: -10, max: 10, palette: ['red', 'white', 'blue']}, 'AWEI_sh指数');
Map.addLayer(waterFeatures.select('WI_2015'), {min: -200, max: 200, palette: ['red', 'white', 'blue']}, 'WI_2015指数');

// 8. 计算水体统计信息
var waterArea = optimizedWater.eq(1).multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: new_clip_region,
  scale: 30,
  maxPixels: 1e9
});

var finalWaterArea = finalWaterClassification.eq(1).multiply(ee.Image.pixelArea()).reduceRegion({
  reducer: ee.Reducer.sum(),
  geometry: new_clip_region,
  scale: 30,
  maxPixels: 1e9
});

print('优化后水体面积统计: ', waterArea);
print('最终水体分类面积统计（OTSU优化）: ', finalWaterArea);

// 9. 输出OTSU阈值信息
print('=== 水体提取算法优化完成 ===');
print('已实现五种水体指数：NDWI、MNDWI、AWEI_nsh、AWEI_sh、WI_2015');
print('已集成OTSU算法进行自适应阈值确定');
print('已实现多指数融合提高识别精度');
print('已修正掩膜应用逻辑，正确保留水体区域');

