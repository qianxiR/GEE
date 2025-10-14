// ========== 1. 定义研究区域（经纬度范围） ==========
// 经纬度范围：经度 122.788-130.055，纬度 72.017-74.152
var studyRegion = ee.Geometry.Rectangle([122.788, 72.017, 130.055, 74.152]);
var styling = {color: 'red', fillColor: '00000000'};

// ========== 2. 调用 Sentinel-2 SR 数据 ==========
var S2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(studyRegion)
  .filterDate('2025-06-01', '2025-10-01')
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20));

// ========== 3. 中位合成（只保留B1-B12光谱波段） ==========
/**
 * 说明：median()会自动保留影像集合中的所有波段，然后通过select()选择需要的波段
 * Sentinel-2 SR的B1-B12波段（除B10，SR产品中不存在）
 * 选择的波段：B1, B2, B3, B4, B5, B6, B7, B8, B8A, B9, B11, B12（共12个光谱波段）
 * 不包含辅助波段：AOT, WVP, SCL, TCI等
 */
var S2_median = S2.median()
  .select(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12'])
  .clip(studyRegion);

// ========== 4. 显示结果 ==========
Map.centerObject(studyRegion, 8);
Map.addLayer(S2_median, {min:0, max:3000, bands:['B4','B3','B2']}, 'S2_median (clipped)');

// 打印波段信息，确认导出的波段数量
print('==================== 影像波段信息 ====================');
print('合成影像包含的波段:', S2_median.bandNames());
print('波段数量:', S2_median.bandNames().size());
print('说明：导出的GeoTIFF文件包含B1-B12光谱波段（共12个），不包含辅助波段');
print('====================================================');

// ========== 5. 直接导出完整区域到 Google Drive ==========
/**
 * 直接导出完整区域影像
 * 入参:
 * - image (ee.Image): 要导出的影像
 * - region (ee.Geometry): 研究区域
 * - description (string): 导出任务描述名称
 * 方法:
 * - 直接导出整个研究区域的影像数据
 * - 使用云优化的GeoTIFF格式
 * - 保留所有波段
 * 出参:
 * - 无返回值，直接提交导出任务到GEE任务队列
 */
var exportDescription = 'custom_region_Sentinel2_20250601_20251001';

Export.image.toDrive({
  image: S2_median,
  description: exportDescription,
  folder: 'GEE_Exports',
  scale: 10,
  region: studyRegion,
  crs: 'EPSG:4326',  // 设置坐标系为WGS84地理坐标系
  fileFormat: 'GeoTIFF',
  formatOptions: {
    cloudOptimized: true
  },
  maxPixels: 1e13  // 设置足够大的像素数以支持大区域导出
});

print('==================== 导出任务已提交 ====================');
print('任务名称: ' + exportDescription);
print('导出文件夹: GEE_Exports');
print('坐标系: EPSG:4326 (WGS84地理坐标系)');
print('分辨率: 10米');
print('导出波段数量: ' + S2_median.bandNames().size().getInfo());
print('波段列表: ' + S2_median.bandNames().getInfo().join(', '));
print('说明：导出的GeoTIFF文件包含B1-B12光谱波段（共12个），不包含辅助波段');
print('请在Tasks面板中点击"Run"按钮启动下载任务');
print('========================================================');
