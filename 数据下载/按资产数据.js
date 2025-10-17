// ========== 全局配置（修改此处即可切换研究区域和时间） ==========
/**
 * 全局区域变量
 * 说明：修改此变量即可切换研究区域，后续代码会自动使用此区域
 * 
 * 使用示例：
 * - 自定义资产：var TARGET_REGION = jipocuo;
 * - 自定义资产：var TARGET_REGION = baimahai;
 * - 自定义资产：var TARGET_REGION = amucuo;
 * - 行政区划：var TARGET_REGION = china_city.filter(ee.Filter.eq('name', '玉树藏族自治州'));
 */
var TARGET_REGION = jipocuo;
var REGION_DISPLAY_NAME = 'jipocuo';  // 地图显示名称

/**
 * 全局时间配置
 * 说明：修改这些变量即可切换下载的时间范围，导出文件名会自动使用这些日期
 */
var START_DATE = '2025-06-01';  // 开始日期，格式：YYYY-MM-DD
var END_DATE = '2025-07-31';    // 结束日期，格式：YYYY-MM-DD
// ====================================================================

// 1. 定义研究区域
Map.addLayer(TARGET_REGION.style({fillColor:'00000000',color:'ffff00'}), {}, REGION_DISPLAY_NAME);

Map.centerObject(TARGET_REGION, 10);

// 将FeatureCollection转换为Geometry，确保严格按照区域边界裁剪
var new_clip_region = TARGET_REGION.geometry();

// 2. 获取 Sentinel-2 数据（只保留B1-B12光谱波段）
/**
 * 获取哨兵-2 SR数据
 * 说明：median()会保留所有可用波段，然后通过select()只选择B2-B12光谱波段
 * 包含波段：B2, B3, B4, B5, B6, B7, B8, B8A, B9, B11, B12（除B10，SR产品中不存在）
 * 不包含辅助波段：AOT, WVP, SCL, TCI等
 * 这样可以支持后续的多种遥感分析（NDVI, NDWI, SAVI等）
 */
var S2_2024 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(new_clip_region)
  .filterDate(START_DATE, END_DATE)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

// 3. 检查数据可用性
print('Sentinel-2影像数量:', S2_2024.size());

// 计算影像中值合成，使用geometry进行精确裁剪，只保留B2-B12光谱波段
var composite_2024 = S2_2024.median()
  .select(['B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12'])
  .clip(new_clip_region);

// 4. 检查影像数据范围和统计信息
print('影像波段信息:', composite_2024.bandNames());
print('影像投影信息:', composite_2024.projection());

// 计算影像统计信息
var stats = composite_2024.select(['B4', 'B3', 'B2']).reduceRegion({
  reducer: ee.Reducer.minMax().combine({
    reducer2: ee.Reducer.mean(),
    sharedInputs: true
  }),
  geometry: new_clip_region,
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

// 添加备选可视化方案（统一使用RGB真彩色）
Map.addLayer(composite_2024, {
  min: 0, 
  max: 4000, 
  bands: ['B4', 'B3', 'B2'],  // 红、绿、蓝（RGB真彩色）
  gamma: 1.2
}, 'Sentinel-2 RGB (增强)');

// 6. 直接导出完整区域影像
/**
 * 直接导出影像数据
 * 入参:
 * - image (ee.Image): 要导出的影像
 * - region (ee.Geometry): 研究区域几何对象（必须是Geometry类型）
 * - description (string): 导出任务描述名称
 * 方法:
 * - 使用研究区域的精确几何边界进行裁剪
 * - 确保导出的数据严格限制在上传的区域范围内
 * - 使用云优化的GeoTIFF格式
 * - 文件名自动从全局配置的区域名称和日期生成
 * 出参:
 * - 无返回值，直接提交导出任务到GEE任务队列
 */
// 生成导出文件名：区域名_Sentinel2_开始日期_结束日期
var exportFileName = REGION_DISPLAY_NAME + '_Sentinel2_' + 
                     START_DATE.replace(/-/g, '') + '_' + 
                     END_DATE.replace(/-/g, '');

var exportParams = {
  image: composite_2024,
  description: exportFileName,
  folder: "GEE_Exports",
  scale: 10,
  region: new_clip_region, // 使用Geometry类型，严格按照上传区域的边界裁剪
  crs: 'EPSG:4326',  // 设置坐标系为WGS84地理坐标系
  fileFormat: "GeoTIFF",
  formatOptions: {
    cloudOptimized: true
  },
  maxPixels: 1e13 // 设置最大像素数，避免大区域导出失败
};

// 提交导出任务
Export.image.toDrive(exportParams);

print('==================== 导出任务已提交 ====================');
print('任务名称: ' + exportFileName);
print('导出文件夹: GEE_Exports');
print('时间范围: ' + START_DATE + ' 至 ' + END_DATE);
print('坐标系: EPSG:4326 (WGS84地理坐标系)');
print('分辨率: 10米');
print('导出区域: 严格按照 ' + REGION_DISPLAY_NAME + ' 的精确边界裁剪');
print('导出波段数量: ' + composite_2024.bandNames().size().getInfo());
print('导出波段列表: ' + composite_2024.bandNames().getInfo().join(', '));
print('说明：导出的GeoTIFF包含B2-B12光谱波段（共11个），不包含辅助波段');
print('请在Tasks面板中点击"Run"按钮启动下载任务');
print('====================================================');