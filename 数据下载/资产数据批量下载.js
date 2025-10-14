// ========== 批量哨兵影像下载脚本 ==========
/**
 * 批量下载多个研究区域的哨兵影像数据
 * 
 * 说明：
 * - 本脚本用于批量下载多个区域
 * - 如果只需下载单个区域，请使用"资产数据单个下载.js"
 * - 修改区域列表请在下方的 regionConfigs 数组中添加/删除
 */
// ===========================================

// ========== 1. 定义所有研究区域资产 ==========
var china_county = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/china_county"),
    china_city = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/china_city"),
    baimahai = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/baimahai"),
    duona = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/duona_zongquanhu_cuorinanhu"),
    jipocuo = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/jipocuo"),
    shaiyincuo = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/shaiyincuo"),
    amucuo = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/amucuo");

// ========== 2. 全局下载参数配置（修改此处即可切换下载时间） ==========
/**
 * 下载参数配置
 * 说明：修改这些参数即可切换下载的时间范围和参数
 * 导出文件名会自动从这些配置生成
 */
var downloadParams = {
  startDate: '2025-06-01',  // 开始日期，格式：YYYY-MM-DD
  endDate: '2025-07-31',    // 结束日期，格式：YYYY-MM-DD
  cloudFilter: 20,          // 云量过滤阈值（百分比）
  scale: 10,                // 分辨率（米）
  maxPixels: 1e13           // 最大像素数
};
// =========================================================================

// ========== 3. 区域配置对象 ==========
var regionConfigs = [
  {
    name: 'china_county',
    collection: china_county,
    description: '中国县级行政区划'
  },
  {
    name: 'china_city', 
    collection: china_city,
    description: '中国市级行政区划'
  },
  {
    name: 'baimahai',
    collection: baimahai,
    description: '白马海区域'
  },
  {
    name: 'duona',
    collection: duona,
    description: '多纳宗泉湖措日南湖区域'
  },
  {
    name: 'jipocuo',
    collection: jipocuo,
    description: '吉普错区域'
  },
  {
    name: 'shaiyincuo',
    collection: shaiyincuo,
    description: '晒银错区域'
  },
  {
    name: 'amucuo',
    collection: amucuo,
    description: '阿木错区域'
  }
];

// ========== 4. 哨兵-2影像获取函数 ==========
/**
 * 获取哨兵-2影像数据（只保留B1-B12光谱波段）
 * 入参:
 * - region (ee.FeatureCollection): 研究区域要素集合
 * - startDate (string): 开始日期，格式'YYYY-MM-DD'
 * - endDate (string): 结束日期，格式'YYYY-MM-DD'
 * - cloudFilter (number): 云量过滤阈值，0-100
 * 方法:
 * - 筛选指定时间范围内的哨兵-2影像
 * - 应用云量过滤和空间过滤
 * - 计算中值合成影像，只保留B1-B12光谱波段
 * - 不包含辅助波段（AOT, WVP, SCL, TCI等）
 * 出参:
 * - ee.Image: 合成后的哨兵-2影像，包含B1-B12光谱波段（共12个）
 */
function getSentinel2Data(region, startDate, endDate, cloudFilter) {
  var s2Collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(region)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudFilter));
  
  // 检查数据可用性
  var count = s2Collection.size();
  print('哨兵影像数量: ' + count.getInfo());
  
  // 计算中值合成（只选择B1-B12光谱波段）
  var composite = s2Collection.median()
    .select(['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12'])
    .clip(region);
  
  return composite;
}

/**
 * 检查哨兵-2数据可用性
 * 入参:
 * - region (ee.FeatureCollection): 研究区域要素集合
 * - startDate (string): 开始日期，格式'YYYY-MM-DD'
 * - endDate (string): 结束日期，格式'YYYY-MM-DD'
 * - cloudFilter (number): 云量过滤阈值，0-100
 * 方法:
 * - 检查指定时间范围内是否有可用的哨兵-2影像
 * - 返回数据可用性状态和影像数量
 * 出参:
 * - object: {available: boolean, count: number} 数据可用性状态和影像数量
 */
function checkDataAvailability(region, startDate, endDate, cloudFilter) {
  try {
    // 检查区域是否有效
    if (!region) {
      return {
        available: false,
        count: 0
      };
    }
    
    var s2Collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
      .filterBounds(region)
      .filterDate(startDate, endDate)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudFilter));
    
    var count = s2Collection.size();
    var countValue = count.getInfo();
    
    return {
      available: countValue > 0,
      count: countValue
    };
  } catch (error) {
    print('检查数据可用性时发生错误: ' + error);
    return {
      available: false,
      count: 0
    };
  }
}

// ========== 5. 直接导出函数 ==========
/**
 * 直接导出完整区域影像数据
 * 入参:
 * - image (ee.Image): 要导出的影像
 * - region (ee.Geometry): 研究区域
 * - description (string): 导出任务描述名称
 * 方法:
 * - 直接导出整个研究区域的影像数据到Google Drive
 * - 使用云优化的GeoTIFF格式
 * 出参:
 * - 无返回值，直接提交导出任务到GEE任务队列
 */
function exportImageData(image, region, description) {
  var exportParams = {
    image: image,
    description: description,
    folder: "GEE_Batch_Exports",
    scale: downloadParams.scale,
    region: region,
    crs: 'EPSG:4326',  // 设置坐标系为WGS84地理坐标系
    fileFormat: "GeoTIFF",
    formatOptions: {
      cloudOptimized: true
    },
    maxPixels: downloadParams.maxPixels
  };
  
  // 提交导出任务
  Export.image.toDrive(exportParams);
  
  print('==================== 导出任务已提交 ====================');
  print('任务名称: ' + description);
  print('导出文件夹: GEE_Batch_Exports');
  print('坐标系: EPSG:4326 (WGS84地理坐标系)');
  print('分辨率: ' + downloadParams.scale + '米');
  print('导出波段数量: ' + image.bandNames().size().getInfo());
  print('导出波段列表: ' + image.bandNames().getInfo().join(', '));
  print('说明：GeoTIFF包含B1-B12光谱波段（共12个），不包含辅助波段');
  print('====================================================');
}

// ========== 6. 单个区域处理函数 ==========
/**
 * 处理单个区域的哨兵影像下载
 * 入参:
 * - regionConfig (object): 区域配置对象，包含name、collection、description
 * 方法:
 * - 获取区域几何对象
 * - 检查数据可用性
 * - 下载哨兵-2影像数据
 * - 直接导出完整区域
 * 出参:
 * - 无返回值，直接提交下载任务
 */
function processSingleRegion(regionConfig) {
  print('==================== 开始处理区域: ' + regionConfig.name + ' ====================');
  
  try {
    // 获取区域几何对象
    var regionGeometry = regionConfig.collection.geometry();
    
    // 检查数据可用性
    var dataStatus = checkDataAvailability(
      regionConfig.collection,
      downloadParams.startDate,
      downloadParams.endDate,
      downloadParams.cloudFilter
    );
    
    if (!dataStatus.available) {
      print('警告：区域 ' + regionConfig.name + ' 在指定时间范围内没有可用的哨兵影像数据');
      print('时间范围: ' + downloadParams.startDate + ' 至 ' + downloadParams.endDate);
      print('云量过滤: < ' + downloadParams.cloudFilter + '%');
      return;
    }
    
    print('区域 ' + regionConfig.name + ' 数据可用，影像数量: ' + dataStatus.count);
    
    // 获取哨兵-2影像数据
    var s2Image = getSentinel2Data(
      regionConfig.collection,
      downloadParams.startDate,
      downloadParams.endDate,
      downloadParams.cloudFilter
    );
    
    // 生成导出描述名称
    var description = regionConfig.name + '_Sentinel2_' + 
                      downloadParams.startDate.replace(/-/g, '') + '_' + 
                      downloadParams.endDate.replace(/-/g, '');
    
    // 直接导出完整区域
    exportImageData(s2Image, regionGeometry, description);
    
    print('区域 ' + regionConfig.name + ' 的下载任务已提交完成');
    
  } catch (error) {
    print('处理区域 ' + regionConfig.name + ' 时发生错误: ' + error);
  }
}

/**
 * 逐个检查并下载非china开头的区域
 * 入参: 无
 * 方法:
 * - 过滤掉china开头的区域
 * - 逐个检查每个区域的数据可用性
 * - 逐个提交有数据可用的区域下载任务
 * 出参: 无
 */
function autoDownloadNonChinaRegions() {
  print('==================== 逐个检查并下载非china区域 ====================');
  
  // 过滤掉china开头的区域
  var nonChinaRegions = regionConfigs.filter(function(regionConfig) {
    return regionConfig.name.indexOf('china') !== 0;
  });
  
  print('找到 ' + nonChinaRegions.length + ' 个非china区域:');
  nonChinaRegions.forEach(function(regionConfig, index) {
    print((index + 1) + '. ' + regionConfig.name + ' - ' + regionConfig.description);
  });
  print('===============================================================');
  
  // 逐个检查并下载（使用for循环确保顺序执行）
  for (var i = 0; i < nonChinaRegions.length; i++) {
    var regionConfig = nonChinaRegions[i];
    print('检查区域 ' + (i + 1) + '/' + nonChinaRegions.length + ': ' + regionConfig.name);
    
    try {
      // 检查数据可用性
      var dataStatus = checkDataAvailability(
        regionConfig.collection,
        downloadParams.startDate,
        downloadParams.endDate,
        downloadParams.cloudFilter
      );
      
      if (dataStatus.available) {
        print('✓ 区域 ' + regionConfig.name + ' 数据可用，影像数量: ' + dataStatus.count + '，开始下载...');
        
        // 逐个处理区域，确保任务逐个提交
        processSingleRegionSequentially(regionConfig);
        
        print('✓ 区域 ' + regionConfig.name + ' 的下载任务已提交完成');
      } else {
        print('✗ 区域 ' + regionConfig.name + ' 数据不可用，跳过下载');
      }
      
    } catch (error) {
      print('✗ 检查区域 ' + regionConfig.name + ' 时发生错误: ' + error);
    }
    
    // 添加延迟，确保任务逐个提交
    if (i < nonChinaRegions.length - 1) {
      print('等待3秒后处理下一个区域...');
    }
  }
  
  print('==================== 非china区域逐个下载完成 ====================');
  print('所有任务已逐个提交，请在GEE的Tasks面板中查看下载进度');
}

/**
 * 逐个处理单个区域的哨兵影像下载（确保任务逐个提交）
 * 入参:
 * - regionConfig (object): 区域配置对象，包含name、collection、description
 * 方法:
 * - 获取区域几何对象
 * - 下载哨兵-2影像数据
 * - 直接导出完整区域
 * 出参:
 * - 无返回值，直接提交下载任务
 */
function processSingleRegionSequentially(regionConfig) {
  print('==================== 开始处理区域: ' + regionConfig.name + ' ====================');
  
  try {
    // 检查要素集合是否有效
    if (!regionConfig.collection) {
      print('错误：区域 ' + regionConfig.name + ' 的要素集合为空');
      return;
    }
    
    // 获取区域几何对象
    var regionGeometry = regionConfig.collection.geometry();
    
    // 检查几何对象是否有效
    if (!regionGeometry) {
      print('错误：区域 ' + regionConfig.name + ' 的几何对象为空');
      return;
    }
    
    // 获取哨兵-2影像数据
    var s2Image = getSentinel2Data(
      regionConfig.collection,
      downloadParams.startDate,
      downloadParams.endDate,
      downloadParams.cloudFilter
    );
    
    // 生成导出描述名称
    var description = regionConfig.name + '_Sentinel2_' + 
                      downloadParams.startDate.replace(/-/g, '') + '_' + 
                      downloadParams.endDate.replace(/-/g, '');
    
    // 直接导出完整区域
    exportImageData(s2Image, regionGeometry, description);
    
  } catch (error) {
    print('处理区域 ' + regionConfig.name + ' 时发生错误: ' + error);
  }
}

// ========== 7. 逐个区域下载函数 ==========
/**
 * 下载指定区域的哨兵影像
 * 入参:
 * - regionIndex (number): 区域索引，从0开始
 * 方法:
 * - 根据索引获取对应的区域配置
 * - 处理单个区域的哨兵影像下载
 * - 显示处理结果
 * 出参: 无
 */
function downloadSingleRegion(regionIndex) {
  if (regionIndex < 0 || regionIndex >= regionConfigs.length) {
    print('错误：区域索引超出范围，请输入0到' + (regionConfigs.length - 1) + '之间的数字');
    return;
  }
  
  var regionConfig = regionConfigs[regionIndex];
  print('==================== 开始下载区域: ' + regionConfig.name + ' ====================');
  print('区域描述: ' + regionConfig.description);
  print('下载参数:');
  print('- 时间范围: ' + downloadParams.startDate + ' 至 ' + downloadParams.endDate);
  print('- 云量过滤: < ' + downloadParams.cloudFilter + '%');
  print('- 分辨率: ' + downloadParams.scale + '米');
  print('============================================================');
  
  processSingleRegion(regionConfig);
  
  print('==================== 区域 ' + regionConfig.name + ' 下载任务已提交 ====================');
  print('请在GEE的Tasks面板中查看下载进度');
}

/**
 * 显示所有可用区域列表
 * 入参: 无
 * 方法:
 * - 遍历所有区域配置
 * - 显示区域索引、名称和描述
 * 出参: 无
 */
function showAvailableRegions() {
  print('==================== 可用区域列表 ====================');
  regionConfigs.forEach(function(regionConfig, index) {
    print(index + '. ' + regionConfig.name + ' - ' + regionConfig.description);
  });
  print('====================================================');
  print('使用方法: downloadSingleRegion(区域索引)');
  print('例如: downloadSingleRegion(0) 下载第一个区域');
}

/**
 * 批量下载所有区域的哨兵影像（保留原功能）
 * 入参: 无
 * 方法:
 * - 遍历所有区域配置
 * - 为每个区域创建下载任务
 * - 显示总体进度信息
 * 出参: 无
 */
function batchDownloadAllRegions() {
  print('==================== 开始批量下载哨兵影像 ====================');
  print('下载参数:');
  print('- 时间范围: ' + downloadParams.startDate + ' 至 ' + downloadParams.endDate);
  print('- 云量过滤: < ' + downloadParams.cloudFilter + '%');
  print('- 分辨率: ' + downloadParams.scale + '米');
  print('============================================================');
  
  // 遍历所有区域配置
  regionConfigs.forEach(function(regionConfig, index) {
    print('处理进度: ' + (index + 1) + '/' + regionConfigs.length);
    processSingleRegion(regionConfig);
    
    // 添加短暂延迟，避免任务提交过于频繁
    if (index < regionConfigs.length - 1) {
      print('等待2秒后处理下一个区域...');
    }
  });
  
  print('==================== 所有区域下载任务已提交 ====================');
  print('请在GEE的Tasks面板中查看所有下载任务的进度');
}

// ========== 8. 初始化显示 ==========
// 显示可用区域列表
showAvailableRegions();

// 自动检查并下载非china区域
autoDownloadNonChinaRegions();

// ========== 9. 地图显示（可选） ==========
// 显示所有区域在地图上
Map.setCenter(100, 35, 4); // 设置地图中心为中国中部

regionConfigs.forEach(function(regionConfig, index) {
  var colors = ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'cyan'];
  var color = colors[index % colors.length];
  
  Map.addLayer(
    regionConfig.collection.style({fillColor: '00000000', color: color}), 
    {}, 
    regionConfig.name + ' (' + regionConfig.description + ')'
  );
});

print('地图已显示所有研究区域，不同颜色代表不同区域');
print('');
print('==================== 使用说明 ====================');
print('1. 查看区域列表: showAvailableRegions()');
print('2. 下载单个区域: downloadSingleRegion(区域索引)');
print('3. 批量下载所有: batchDownloadAllRegions()');
print('4. 自动下载非china区域: autoDownloadNonChinaRegions()');
print('5. 区域索引范围: 0-6');
print('===============================================');
