// ========== 全局配置（修改此处即可切换研究区域） ==========
/**
 * 全局区域变量
 * 说明：修改此变量即可切换研究区域，后续代码会自动定位到该区域
 * 
 * 使用示例：
 * - 省级：var TARGET_REGION = china_province.filter(ee.Filter.eq('name', '青海省'));
 * - 市级：var TARGET_REGION = china_city.filter(ee.Filter.eq('name', '某市名'));
 * 
 * 注意：需要确保GEE环境中已导入 china_province 等行政区划资产
 */
var TARGET_REGION = china_province.filter(ee.Filter.eq('name', '青海省'));
var REGION_DISPLAY_NAME = '青海省';  // 地图显示名称

// 显示研究区域边界（黄色边框，透明填充）
Map.addLayer(TARGET_REGION.style({fillColor:'00000000',color:'ffff00', width: 2}), {}, REGION_DISPLAY_NAME);

// 将地图中心定位到研究区域
Map.centerObject(TARGET_REGION, 7);

// ========== 显示青海省内的湖泊水深数据 ==========
/**
 * 显示研究区域内的湖泊分布和水深数据
 * 方法:
 * - 筛选TARGET_REGION范围内的所有HydroLakes湖泊
 * - 叠加显示JRC全球地表水数据（水面出现频率）
 */

// 1. 获取青海省范围内的所有湖泊边界
var lakes_in_region = ee.FeatureCollection('projects/sat-io/open-datasets/HydroLakes/lake_poly_v10')
  .filterBounds(TARGET_REGION);

// 显示湖泊边界（蓝色边框）
Map.addLayer(lakes_in_region.style({color: '0000ff', width: 1}), {}, '青海省湖泊边界');

// 2. 获取JRC全球地表水数据（Surface Water Occurrence - 水面出现频率）
var globalSurfaceWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
  .select('occurrence')  // 水面出现频率 (0-100%)
  .clip(TARGET_REGION);

// 显示水面出现频率（蓝色渐变：深蓝=高频率，浅蓝=低频率）
Map.addLayer(globalSurfaceWater, {
  min: 0,
  max: 100,
  palette: ['white', 'lightblue', 'blue', 'darkblue']
}, '水面出现频率 (0-100%)');

// 3. 创建永久水体掩膜（出现频率>50%的区域）
var permanentWater = globalSurfaceWater.gt(50);
Map.addLayer(permanentWater.updateMask(permanentWater), {
  palette: ['cyan']
}, '永久水体 (>50%频率)');

// 打印统计信息
print('========== 青海省湖泊统计 ==========');
print('湖泊数量:', lakes_in_region.size());
print('湖泊数据集:', 'HydroLakes v1.0');
print('水深数据集:', 'JRC Global Surface Water v1.4');

// ========== 显示青海省内有3D水深数据的湖泊ID ==========
/**
 * 获取有3D水深数据的湖泊并显示ID标签
 * 方法:
 * - 从3D-LAKES数据集筛选青海省范围内的湖泊
 * - 在地图上显示这些湖泊并标注ID
 * - 为每个湖泊生成水深栅格可视化
 */

// 1. 获取青海省内有3D水深数据的湖泊
var lakesWithDepth = ee.FeatureCollection("projects/ee-chihsiang/assets/Global_Reservoir/global_A_E_v2")
  .filterBounds(TARGET_REGION);

print('========== 3D水深数据可用性 ==========');
print('有3D水深数据的湖泊数量:', lakesWithDepth.size());

// 2. 获取这些湖泊的Hylak_id列表
var hylakIds = lakesWithDepth.aggregate_array('Hylak_id');
print('湖泊ID列表:', hylakIds);

// 3. 从HydroLakes获取这些湖泊的边界（用于显示）
var lakesWithDepthBoundaries = lakes_in_region.filter(ee.Filter.inList('Hylak_id', hylakIds));

// 4. 为有水深数据的湖泊添加特殊样式（红色边框，更粗）
Map.addLayer(lakesWithDepthBoundaries.style({
  color: 'red', 
  width: 2,
  fillColor: 'ff000033'  // 半透明红色填充
}), {}, '有3D水深数据的湖泊（红色）');

// 5. 打印每个湖泊的详细信息（包括ID和名称）
print('========== 湖泊详细列表 ==========');
lakesWithDepth.limit(50).evaluate(function(fc) {
  if (fc.features.length > 0) {
    print('找到', fc.features.length, '个湖泊（最多显示50个）');
    fc.features.forEach(function(feature, index) {
      var hylakId = feature.properties.Hylak_id;
      var lakeIndex = feature.properties.index;
      print('湖泊 ' + (index + 1) + ' - Hylak_ID: ' + hylakId + ', Index: ' + lakeIndex);
    });
  } else {
    print('⚠️ 青海省范围内没有3D-LAKES数据');
    print('建议：使用替代的水深估算方法或DEM数据');
  }
});

// ========== 批量生成并显示水深栅格 ==========
/**
 * 为青海省内所有有水深数据的湖泊生成水深栅格
 * 方法:
 * - 遍历每个湖泊
 * - 提取水深和高程数据
 * - 使用remap生成水深影像
 * - 拼接所有湖泊的水深影像
 */

/**
 * 字符串列表转数字列表的辅助函数
 * 入参:
 * - variable (string): 格式为 "[1,2,3,...]" 的字符串
 * 方法:
 * - 去除方括号并按逗号分割
 * - 将每个元素解析为数字
 * 出参:
 * - ee.List: 数字列表
 */
function string_tonumber_global(variable){
  var splitList = ee.String(variable).replace("\\[", "").replace("\\]", "").split(",");
  var number_list = ee.List(splitList).map(function(item) {
    return ee.Number.parse(item);
  });
  return number_list;
}

/**
 * 为单个湖泊生成水深影像
 * 入参:
 * - feature (ee.Feature): 包含3D水深数据的湖泊要素
 * 方法:
 * - 提取湖泊的水深和高程数据
 * - 获取湖泊边界
 * - 使用remap将水面频率映射为高程值
 * 出参:
 * - ee.Image: 水深影像（如果数据有效），否则返回null
 */
function generateLakeBathymetry(feature) {
  try {
    // 获取湖泊ID
    var hylakId = feature.get('Hylak_id');
    
    // 获取湖泊边界
    var lakeBoundary = lakes_in_region.filter(ee.Filter.eq('Hylak_id', hylakId));
    
    // 提取水深和高程数据
    var elevation = string_tonumber_global(feature.get('swo_elevation'));
    var swo = string_tonumber_global(feature.get('swo'));
    
    // 获取JRC水体数据
    var lakeWater = ee.Image('JRC/GSW1_4/GlobalSurfaceWater')
      .clip(lakeBoundary.geometry().buffer(100));
    
    // 生成水深影像
    var bathymetry = lakeWater.remap(swo, elevation)
      .rename('elevation')
      .clip(lakeBoundary.geometry());
    
    return bathymetry;
  } catch(e) {
    return ee.Image.constant(0).updateMask(0);
  }
}

// 6. 将所有湖泊的水深影像拼接成一个影像集合
var bathymetryCollection = lakesWithDepth.map(generateLakeBathymetry);

// 7. 合并所有水深影像（使用mosaic拼接）
var allLakesBathymetry = ee.ImageCollection(bathymetryCollection.toList(1000))
  .mosaic()
  .clip(TARGET_REGION);

// 8. 可视化水深栅格（使用高程色带）
Map.addLayer(allLakesBathymetry, {
  min: 2500,
  max: 5000,
  palette: ['darkblue', 'blue', 'cyan', 'lightgreen', 'yellow', 'orange', 'red']
}, '青海省湖泊水深栅格（高程值）');

print('========================================');
print('✓ 水深栅格可视化完成');
print('  - 颜色说明：深蓝=低海拔，红色=高海拔');
print('  - 单位：米（海拔高程）');
print('  - 范围：约2500-5000米');
print('========================================');

// ========== 导出青海省湖泊边界数据 ==========
/**
 * 导出矢量数据（湖泊边界）
 * 方法:
 * - 导出所有HydroLakes湖泊边界
 * - 导出有3D水深数据的湖泊边界
 * - 格式：Shapefile（可在QGIS/ArcGIS中打开）
 */

// 1. 导出所有湖泊边界
Export.table.toDrive({
  collection: lakes_in_region,
  description: 'Qinghai_All_Lakes_Boundaries',
  folder: 'GEE_exports_Qinghai',
  fileFormat: 'SHP',  // Shapefile格式
  selectors: ['Hylak_id', 'Lake_name', 'Lake_area', 'Shore_len', 'Vol_total', 'Depth_avg', 'Dis_avg', 'Res_time', 'Elevation', 'Slope_100', 'Wshd_area']  // 选择导出的属性字段
});

// 2. 导出有3D水深数据的湖泊边界（重点湖泊）
Export.table.toDrive({
  collection: lakesWithDepthBoundaries,
  description: 'Qinghai_Lakes_With_Bathymetry',
  folder: 'GEE_exports_Qinghai',
  fileFormat: 'SHP',
  selectors: ['Hylak_id', 'Lake_name', 'Lake_area', 'Shore_len', 'Vol_total', 'Depth_avg', 'Elevation']
});

// 3. 导出为GeoJSON格式（可选，更轻量级）
Export.table.toDrive({
  collection: lakesWithDepthBoundaries,
  description: 'Qinghai_Lakes_With_Bathymetry_GeoJSON',
  folder: 'GEE_exports_Qinghai',
  fileFormat: 'GeoJSON'
});

print('========== 导出任务已创建 ==========');
print('✓ 任务1: Qinghai_All_Lakes_Boundaries.zip');
print('  - 内容: 青海省所有湖泊边界（Shapefile）');
print('  - 包含: 湖泊ID、名称、面积、深度等属性');
print('');
print('✓ 任务2: Qinghai_Lakes_With_Bathymetry.zip');
print('  - 内容: 有3D水深数据的湖泊边界（Shapefile）');
print('  - 用途: 重点研究对象');
print('');
print('✓ 任务3: Qinghai_Lakes_With_Bathymetry_GeoJSON.geojson');
print('  - 内容: 有3D水深数据的湖泊边界（GeoJSON）');
print('  - 用途: 网页可视化或轻量级分析');
print('');
print('📌 操作步骤:');
print('  1. 点击右上角 Tasks 面板');
print('  2. 找到上述3个导出任务');
print('  3. 点击每个任务右侧的 Run 按钮');
print('  4. 确认参数后点击 Run 开始导出');
print('  5. 导出完成后在Google Drive的GEE_exports_Qinghai文件夹中查看');
print('========================================');

// ====================================================================

/////////////////// This code is to download the 3D bathmytry  /////////////////////
/////////////////// Instruction ////////////////////////////////////////////////////
// 1.In line 265, change "9047" to "prefered hydrolake id".      #If you do not know hydrolake id, please visit  https://planet-test-projectchi.projects.earthengine.app/view/d-lakes
// 2 In line 265, change "GEE_exports" to your preferred folder (Optional).
// 3.Click on "Run" in the upper tab bar.
// 4.Click on "Task" in the upper right tab bar.
// 5.Click on "Run" below the "Task".
// 6.Click on "Run" in the pop-up window.
// 7.Once the task is finished, the map will be downloaded to your Google Drive in the "GEE_exports" folder

// 8.Please to search 3D-LAKES or https://planet-test-projectchi.projects.earthengine.app/view/d-lakes for more datialed information,

/////////////////// Instruction ////////////////////////////////////////////////////              
// download(9047,'GEE_exports')              //    <---------- 需要下载湖泊数据时，取消此行注释并修改湖泊ID
//////////////////////////////////////////////////////////////////////////////////// 
/////////////////// Main code ////////////////////////////////////////////////////// 
/**
 * 下载指定湖泊的3D水深数据
 * 入参:
 * - Hylak_id (number): HydroLakes数据库中的湖泊ID
 * - folder (string): Google Drive中的导出文件夹名称
 * 方法:
 * - 根据Hylak_id从全球湖泊数据集中筛选目标湖泊
 * - 获取湖泊的水面高程和水深数据
 * - 生成3D水深地形图并导出为GeoTIFF格式
 * 出参:
 * - 无返回值，执行导出任务到Google Drive
 */
function download(Hylak_id,folder){
// 从全球水库数据集中筛选指定ID的湖泊（包含水深和高程信息）
var lakes = ee.FeatureCollection("projects/ee-chihsiang/assets/Global_Reservoir/global_A_E_v2").filter(ee.Filter.eq("index", Hylak_id))

// 从HydroLakes数据集中获取湖泊边界矢量
var featureCollection=ee.FeatureCollection('projects/sat-io/open-datasets/HydroLakes/lake_poly_v10').filter(ee.Filter.eq("Hylak_id",Hylak_id))

// 获取JRC全球地表水数据，裁剪到湖泊边界（扩展500米缓冲区）
var Image_base=ee.Image('JRC/GSW1_4/GlobalSurfaceWater').clip(featureCollection.geometry().buffer(500))

/**
 * 将字符串列表转换为数字列表
 * 入参:
 * - variable (string): 格式为 "[1,2,3,...]" 的字符串
 * 方法:
 * - 去除字符串中的方括号
 * - 按逗号分割字符串
 * - 将每个元素解析为数字
 * 出参:
 * - ee.List: 数字列表
 */
function string_tonumber(variable){
  // 去除方括号并按逗号分割
  var splitList = ee.String(variable).replace("\\[", "").replace("\\]", "").split(",")
  
  // 将每个字符串元素转换为数字
  var number_list = ee.List(splitList).map(function(item) {
        return ee.Number.parse(item);})
    return number_list;
  }
// 从湖泊属性中提取高程和水面出现频率数据
var elevation = string_tonumber(lakes.aggregate_array('swo_elevation').get(0))  // 高程列表
var swo = string_tonumber(lakes.aggregate_array('swo').get(0))  // 水面出现频率（Surface Water Occurrence）列表

// 生成3D水深地形图：将水面出现频率值重映射为对应的高程值
var Image2=Image_base.remap(swo,elevation)

// 添加水深图层到地图显示
var map_ba = ui.Map.Layer(Image2, {}, 'Bathymetry');
Map.add(map_ba)

// 将地图中心定位到目标湖泊
Map.centerObject(featureCollection.geometry())

// 配置导出参数
var exportParameters = {
  image: Image2,              // 要导出的影像（3D水深图）
  description: Hylak_id,      // 任务名称和导出文件名（不含扩展名）
  scale: 30,                  // 空间分辨率（米）
  region: featureCollection.geometry(),  // 导出区域（湖泊边界）
  fileFormat: 'GeoTIFF',      // 导出格式
  folder: folder,             // Google Drive中的目标文件夹
  maxPixels: 1e12             // 最大像素数限制
};

// 执行导出任务到Google Drive
Export.image.toDrive(exportParameters);
}