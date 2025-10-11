// 1. 定义研究区域
var chengdu = china_city.filter(ee.Filter.eq('name', '玉树藏族自治州'));

Map.addLayer(chengdu.style({fillColor:'00000000',color:'ffff00'}), {}, '玉树藏族自治州');

Map.centerObject(chengdu, 10);

var new_clip_region = chengdu;

// 2. 去云算法函数
/**
 * 获取QA位信息
 * 入参:
 * - image (ee.Image): 包含QA波段的影像
 * - start (number): 起始位位置
 * - end (number): 结束位位置
 * 方法:
 * - 从QA波段中提取指定位范围的信息
 * 出参:
 * - ee.Image: 提取的QA位信息
 */
function getQABits(image, start, end) {
    var pattern = 0;
    for (var i = start; i <= end; i++) {
       pattern += 1 << i;
    }
    // Return a single band image of the extracted QA bits
    return image.bitwiseAnd(pattern).rightShift(start);
}

/**
 * 哨兵-2去云算法
 * 入参:
 * - image (ee.Image): 哨兵-2影像
 * 方法:
 * - 使用QA60波段进行云掩膜
 * - 对原始波段应用云掩膜
 * 出参:
 * - ee.Image: 去云后的原始哨兵-2影像
 */
function rmcloudS2(image){
  // 获取QA60波段（云掩膜）
  var qa = image.select('QA60');
  
  // 提取云掩膜位 (位10: 云, 位11: 云阴影)
  var cloudMask = qa.bitwiseAnd(1 << 10).eq(0).and(qa.bitwiseAnd(1 << 11).eq(0));
  
  // 对原始影像应用云掩膜
  return image.updateMask(cloudMask);
}

// 3. 获取 Sentinel-2 数据
var startDate_2025 = '2025-06-01';
var endDate_2025 = '2025-07-31';

// 获取 Sentinel-2 数据，应用去云算法
var S2_2025 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
  .filterBounds(new_clip_region)
  .filterDate(startDate_2025, endDate_2025)
  .map(rmcloudS2);

// 4. 计算影像中值合成，保留原始数据
var composite_2025 = S2_2025.median().clip(chengdu);

// 5. 可视化合成影像
Map.addLayer(composite_2025, {min: 0, max: 3000, bands: ['B4', 'B3', 'B2']}, 'Sentinel-2 Composite 2025');

// 6. 计算并显示去云后的NDVI
var ndvi_2025 = composite_2025.normalizedDifference(['B8', 'B4']);
Map.addLayer(ndvi_2025, {min: -1, max: 1, palette: ['red', 'yellow', 'green']}, 'NDVI (Cloud Removed)');

// 7. 显示影像统计信息
print('哨兵-2影像数量:', S2_2025.size());
print('影像波段信息:', composite_2025.bandNames());
print('影像投影信息:', composite_2025.projection());

// 计算影像统计信息
var stats = composite_2025.select(['B4', 'B3', 'B2']).reduceRegion({
  reducer: ee.Reducer.minMax().combine({
    reducer2: ee.Reducer.mean(),
    sharedInputs: true
  }),
  geometry: new_clip_region,
  scale: 30,
  maxPixels: 1e9
});

print('影像统计信息:', stats);