// 1. 定义研究区域 - 读取baimahai资产变量

Map.addLayer(baimahai.style({fillColor:'00000000',color:'ffff00'}), {}, 'baimahai');

Map.centerObject(baimahai, 10);

var new_clip_region = baimahai;

// 2. 获取 Sentinel-2 数据
var startDate_2024 = '2025-06-01';
var endDate_2024 = '2025-07-31';

// 获取 Sentinel-2 数据，只筛选云量少的影像
var S2_2024 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(new_clip_region)
  .filterDate(startDate_2024, endDate_2024)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

// 3. 检查数据可用性
print('Sentinel-2影像数量:', S2_2024.size());

// 计算影像中值合成，保留原始数据
var composite_2024 = S2_2024.median().clip(baimahai);

// 4. 检查影像数据范围和统计信息
print('影像波段信息:', composite_2024.bandNames());
print('影像投影信息:', composite_2024.projection());

// 计算影像统计信息
var stats = composite_2024.select(['B4', 'B3', 'B2']).reduceRegion({
  reducer: ee.Reducer.minMax().combine({
    reducer2: ee.Reducer.mean(),
    sharedInputs: true
  }),
  geometry: baimahai,
  scale: 30,
  maxPixels: 1e9
});

print('影像统计信息:', stats);

// 5. 可视化合成影像 - 使用更合适的参数
Map.addLayer(composite_2024, {
  min: 0, 
  max: 3000, 
  bands: ['B4', 'B3', 'B2'],
  gamma: 1.4
}, 'Sentinel-2 Composite 2024');

// 添加备选可视化方案
Map.addLayer(composite_2024, {
  min: 0, 
  max: 4000, 
  bands: ['B8', 'B4', 'B3'],  // 近红外、红、绿
  gamma: 1.2
}, 'Sentinel-2 NIR-R-G');

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
  gridSize = gridSize || 0.5; // 默认0.5度网格
  
  // 获取研究区域的边界框
  var bounds = region.bounds();
  
  // 计算网格数量 - 使用GEE正确语法
  var minLon = bounds.getInfo().coordinates[0][0][0];
  var maxLon = bounds.getInfo().coordinates[0][2][0];
  var minLat = bounds.getInfo().coordinates[0][0][1];
  var maxLat = bounds.getInfo().coordinates[0][2][1];
  
  var lonSteps = Math.ceil((maxLon - minLon) / gridSize);
  var latSteps = Math.ceil((maxLat - minLat) / gridSize);
  
  print('网格分区信息: ' + lonSteps + ' x ' + latSteps + ' = ' + (lonSteps * latSteps) + ' 个分区');
  
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

// 6. 分区导出原始影像
// 使用较小的网格大小确保每个分区都能成功处理
exportDataByPartitions(
  composite_2024, 
  new_clip_region, 
  "baimahai_Sentinel2_original_2024_06_07",
  0.5 
);

print('所有分区导出任务已提交，请在Tasks面板中查看进度');
print('建议：下载完成后可以使用GIS软件（如QGIS）将分区数据合并为完整影像');