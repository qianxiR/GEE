/**
 * 分块下载大区域影像数据
 * 功能：将大研究区域拆分成多个小网格，分别下载，避免单个文件过大
 * 作者：[您的姓名]
 * 日期：2025
 */

// ========== 1. 定义研究区域 ==========
// 示例：使用Lene河区域（可以根据需要修改）
// 格式：[最小经度, 最小纬度, 最大经度, 最大纬度]
var studyRegion = ee.Geometry.Rectangle([122.788, 72.017, 130.055, 74.152]);

// 显示完整研究区域
Map.addLayer(studyRegion, {color: 'red'}, '完整研究区域', true);
Map.centerObject(studyRegion, 7);

// ========== 2. 设置下载参数 ==========
// 时间范围
var startDate = '2025-06-01';
var endDate = '2025-07-31';

// 影像数据源
var imageCollection = 'COPERNICUS/S2_SR_HARMONIZED';  // Sentinel-2 地表反射率

// 导出波段（只保留B2-B12光谱波段，不包含辅助波段）
var exportBands = ['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12'];  // B2-B12光谱波段

// 分辨率（米）
var scale = 10;

// 分块参数 - 将区域分成多少块（行×列）
var gridRows = 2;     // 行数（纬度方向）
var gridCols = 2;     // 列数（经度方向）
// 总共会生成 gridRows × gridCols = 4 个下载任务

// 文件导出设置
var exportFolder = 'GEE_GridDownload';       // Google Drive文件夹名
var filePrefix = 'Lene_Grid';                 // 文件名前缀

// ========== 3. 创建网格函数 ==========
/**
 * 将矩形区域分割成网格
 * 入参:
 * - geometry (ee.Geometry.Rectangle): 输入的矩形区域
 * - rows (number): 网格行数
 * - cols (number): 网格列数
 * 方法:
 * - 获取区域边界坐标
 * - 计算每个网格的经纬度跨度
 * - 循环创建所有网格
 * 出参:
 * - Array: 包含所有网格的数组，每个元素是 {geometry: ee.Geometry, index: string}
 */
function createGrid(geometry, rows, cols) {
  // 获取边界坐标
  var bounds = geometry.bounds().coordinates().get(0);
  var coords = ee.List(bounds);
  
  // 提取最小和最大经纬度
  var minLon = ee.Number(ee.List(coords.get(0)).get(0));
  var minLat = ee.Number(ee.List(coords.get(0)).get(1));
  var maxLon = ee.Number(ee.List(coords.get(2)).get(0));
  var maxLat = ee.Number(ee.List(coords.get(2)).get(1));
  
  // 获取实际值（用于JavaScript循环）
  var bounds_info = geometry.bounds().getInfo().coordinates[0];
  var minLonVal = bounds_info[0][0];
  var minLatVal = bounds_info[0][1];
  var maxLonVal = bounds_info[2][0];
  var maxLatVal = bounds_info[2][1];
  
  // 计算每个网格的跨度
  var lonStep = (maxLonVal - minLonVal) / cols;
  var latStep = (maxLatVal - minLatVal) / rows;
  
  print('========== 网格分块信息 ==========');
  print('完整区域范围:');
  print('  经度: ' + minLonVal.toFixed(3) + '°E - ' + maxLonVal.toFixed(3) + '°E');
  print('  纬度: ' + minLatVal.toFixed(3) + '°N - ' + maxLatVal.toFixed(3) + '°N');
  print('网格配置: ' + rows + ' 行 × ' + cols + ' 列 = ' + (rows * cols) + ' 个网格');
  print('每个网格大小:');
  print('  经度跨度: ' + lonStep.toFixed(3) + '°');
  print('  纬度跨度: ' + latStep.toFixed(3) + '°');
  print('====================================');
  
  // 创建所有网格
  var grids = [];
  for (var row = 0; row < rows; row++) {
    for (var col = 0; col < cols; col++) {
      // 计算当前网格的边界
      var gridMinLon = minLonVal + col * lonStep;
      var gridMaxLon = minLonVal + (col + 1) * lonStep;
      var gridMinLat = minLatVal + row * latStep;
      var gridMaxLat = minLatVal + (row + 1) * latStep;
      
      // 创建网格几何
      var gridGeometry = ee.Geometry.Rectangle([
        gridMinLon, gridMinLat, gridMaxLon, gridMaxLat
      ]);
      
      // 生成网格索引（例如：R0C0, R0C1, R1C0, R1C1）
      var gridIndex = 'R' + row + 'C' + col;
      
      grids.push({
        geometry: gridGeometry,
        index: gridIndex,
        row: row,
        col: col
      });
      
      // 在地图上显示网格边界
      Map.addLayer(
        gridGeometry, 
        {color: 'yellow'}, 
        '网格 ' + gridIndex, 
        false  // 默认不显示，可在图层列表中打开
      );
    }
  }
  
  return grids;
}

// ========== 4. 获取影像数据 ==========
print('\n========== 开始加载影像数据 ==========');
var S2 = ee.ImageCollection(imageCollection)
  .filterBounds(studyRegion)
  .filterDate(startDate, endDate)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

// 检查影像数量
var imageCount = S2.size();
print('时间范围: ' + startDate + ' 至 ' + endDate);
print('找到的影像数量: ', imageCount);

// 计算中值合成
var composite = S2.median().clip(studyRegion);

// 选择导出波段
var exportImage = composite.select(exportBands);

// 在地图上显示合成影像（RGB真彩色）
Map.addLayer(
  composite, 
  {min: 0, max: 3000, bands: ['B4', 'B3', 'B2']}, 
  'Sentinel-2 合成影像'
);

print('影像合成完成');
print('导出波段: ' + exportBands.join(', '));

// ========== 5. 创建网格并批量导出 ==========
print('\n========== 开始创建导出任务 ==========');

// 创建网格
var grids = createGrid(studyRegion, gridRows, gridCols);

// 循环导出每个网格
for (var i = 0; i < grids.length; i++) {
  var grid = grids[i];
  
  // 裁剪影像到当前网格
  var gridImage = exportImage.clip(grid.geometry);
  
  // 生成文件名
  var description = filePrefix + '_' + grid.index + '_' + 
                   startDate.replace(/-/g, '') + '_' + 
                   endDate.replace(/-/g, '');
  
  // 创建导出任务
  Export.image.toDrive({
    image: gridImage,
    description: description,
    folder: exportFolder,
    fileNamePrefix: description,
    region: grid.geometry,
    scale: scale,
    crs: 'EPSG:4326',
    fileFormat: 'GeoTIFF',
    maxPixels: 1e13,
    skipEmptyTiles: true,
    formatOptions: {
      cloudOptimized: true
    }
  });
  
  print('✓ 导出任务已创建: ' + description);
}

// ========== 6. 输出使用说明 ==========
print('\n========== 导出任务使用说明 ==========');
print('总共创建了 ' + grids.length + ' 个导出任务');
print('');
print('使用步骤：');
print('1. 在GEE Code Editor右侧找到【Tasks】标签');
print('2. 点击每个任务旁边的【RUN】按钮');
print('3. 在弹出窗口中确认参数，点击【RUN】开始导出');
print('4. 导出完成后，文件会出现在Google Drive的"' + exportFolder + '"文件夹中');
print('');
print('导出文件说明：');
print('- 文件格式: GeoTIFF');
print('- 坐标系: EPSG:4326 (WGS84地理坐标系)');
print('- 分辨率: ' + scale + '米');
print('- 波段数量: ' + exportBands.length);
print('- 文件命名格式: ' + filePrefix + '_R[行]C[列]_[开始日期]_[结束日期].tif');
print('');
print('后期处理：');
print('- 所有网格使用相同的坐标系和分辨率，可在GIS软件中直接拼接');
print('- 推荐使用QGIS的 "栅格 -> 其他 -> 合并" 工具进行拼接');
print('- 或使用GDAL命令: gdal_merge.py -o merged.tif grid_*.tif');
print('=========================================');

print('\n✅ 所有导出任务已准备完成！请在Tasks面板查看');
