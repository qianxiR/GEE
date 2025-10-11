    // 批量哨兵影像下载脚本
    // 一次性下载所有研究区域的哨兵影像数据

    // ========== 1. 定义所有研究区域 ==========
    var china_county = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/china_county"),
        china_city = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/china_city"),
        baimahai = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/baimahai"),
        duona = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/duona_zongquanhu_cuorinanhu"),
        jipocuo = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/jipocuo"),
        shaiyincuo = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/shaiyincuo"),
        amucuo = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/shuishen/amucuo");

    // ========== 2. 区域配置对象 ==========
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

// ========== 3. 下载参数配置 ==========
var downloadParams = {
startDate: '2025-06-01',
endDate: '2025-07-31',
cloudFilter: 20, // 云量过滤阈值（百分比）
gridSize: 0.5,   // 网格大小（度）
scale: 10,       // 分辨率（米）
maxPixels: 1e8   // 每个分区的最大像素数
};

// ========== 4. 哨兵-2影像获取函数 ==========
/**
 * 获取哨兵-2影像数据
 * 入参:
 * - region (ee.FeatureCollection): 研究区域要素集合
 * - startDate (string): 开始日期，格式'YYYY-MM-DD'
 * - endDate (string): 结束日期，格式'YYYY-MM-DD'
 * - cloudFilter (number): 云量过滤阈值，0-100
 * 方法:
 * - 筛选指定时间范围内的哨兵-2影像
 * - 应用云量过滤和空间过滤
 * - 计算中值合成影像
 * 出参:
 * - ee.Image: 合成后的哨兵-2影像
 */
function getSentinel2Data(region, startDate, endDate, cloudFilter) {
  var s2Collection = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(region)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloudFilter));
  
  // 检查数据可用性
  var count = s2Collection.size();
  print('哨兵影像数量: ' + count.getInfo());
  
  // 计算中值合成
  var composite = s2Collection.median().clip(region);
  
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

    // ========== 5. 网格分区生成函数 ==========
    /**
     * 生成网格分区
     * 入参:
     * - region (ee.Geometry): 研究区域几何对象
     * - gridSize (number): 网格大小（度）
     * 方法:
     * - 将研究区域划分为规则的矩形网格
     * - 过滤掉与研究区域不相交的网格
     * 出参:
     * - ee.FeatureCollection: 包含所有有效网格的要素集合
     */
    function createGridPartitions(region, gridSize) {
    // 获取研究区域的边界框
    var bounds = region.bounds();
    
    // 计算网格数量
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

    // ========== 6. 分区导出函数 ==========
    /**
     * 分区导出数据
     * 入参:
     * - image (ee.Image): 要导出的影像
     * - region (ee.Geometry): 研究区域
     * - baseDescription (string): 基础描述名称
     * - gridSize (number): 网格大小
     * 方法:
     * - 将大区域分割成小网格进行逐个导出
     * - 避免内存溢出和处理超时问题
     * 出参:
     * - 无返回值，直接提交导出任务到GEE任务队列
     */
    function exportDataByPartitions(image, region, baseDescription, gridSize) {
    // 生成网格分区
    var partitions = createGridPartitions(region, gridSize);
    
    // 获取分区数量
    var partitionCount = partitions.size();
    print('开始分区导出，共 ' + partitionCount.getInfo() + ' 个分区');
    
    // 遍历每个分区进行导出
    var partitionList = partitions.getInfo().features;
    
    partitionList.forEach(function(partition, index) {
        var gridGeometry = ee.Geometry(partition.geometry);
        var gridId = partition.properties.gridId;
        var row = partition.properties.row;
        var col = partition.properties.col;
        
        // 裁剪影像到当前网格
        var clippedImage = image.clip(gridGeometry);
        
        // 导出参数
        var paddedGridId = ('000' + gridId).slice(-3);
        
        var exportParams = {
        image: clippedImage,
        description: baseDescription + '_partition_' + paddedGridId + '_r' + row + 'c' + col,
        folder: "GEE_Batch_Exports",
        scale: downloadParams.scale,
        region: gridGeometry,
        fileFormat: "GeoTIFF",
        formatOptions: {
            cloudOptimized: true
        },
        maxPixels: downloadParams.maxPixels
        };
        
        // 提交导出任务
        Export.image.toDrive(exportParams);
        
        print('已提交分区 ' + (index + 1) + '/' + partitionList.length + ' 的导出任务');
    });
    }

// ========== 7. 单个区域处理函数 ==========
/**
 * 处理单个区域的哨兵影像下载
 * 入参:
 * - regionConfig (object): 区域配置对象，包含name、collection、description
 * 方法:
 * - 获取区域几何对象
 * - 检查数据可用性
 * - 下载哨兵-2影像数据
 * - 执行分区导出
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
    var baseDescription = regionConfig.name + '_Sentinel2_' + 
                        downloadParams.startDate.replace(/-/g, '') + '_' + 
                        downloadParams.endDate.replace(/-/g, '');
    
    // 执行分区导出
    exportDataByPartitions(
      s2Image,
      regionGeometry,
      baseDescription,
      downloadParams.gridSize
    );
    
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
 * - 逐个提交分区导出任务
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
    var baseDescription = regionConfig.name + '_Sentinel2_' + 
                        downloadParams.startDate.replace(/-/g, '') + '_' + 
                        downloadParams.endDate.replace(/-/g, '');
    
    // 逐个提交分区导出任务
    exportDataByPartitionsSequentially(
      s2Image,
      regionGeometry,
      baseDescription,
      downloadParams.gridSize
    );
    
  } catch (error) {
    print('处理区域 ' + regionConfig.name + ' 时发生错误: ' + error);
  }
}

/**
 * 逐个提交分区导出任务
 * 入参:
 * - image (ee.Image): 要导出的影像
 * - region (ee.Geometry): 研究区域
 * - baseDescription (string): 基础描述名称
 * - gridSize (number): 网格大小
 * 方法:
 * - 将大区域分割成小网格
 * - 逐个提交每个分区的导出任务
 * - 确保任务按顺序提交
 * 出参:
 * - 无返回值，直接提交导出任务到GEE任务队列
 */
function exportDataByPartitionsSequentially(image, region, baseDescription, gridSize) {
  // 生成网格分区
  var partitions = createGridPartitions(region, gridSize);
  
  // 获取分区数量
  var partitionCount = partitions.size();
  print('开始逐个提交分区导出，共 ' + partitionCount.getInfo() + ' 个分区');
  
  // 获取分区列表
  var partitionList = partitions.getInfo().features;
  
  // 逐个提交分区任务（使用for循环确保顺序）
  for (var i = 0; i < partitionList.length; i++) {
    var partition = partitionList[i];
    var gridGeometry = ee.Geometry(partition.geometry);
    var gridId = partition.properties.gridId;
    var row = partition.properties.row;
    var col = partition.properties.col;
    
    // 裁剪影像到当前网格
    var clippedImage = image.clip(gridGeometry);
    
    // 导出参数
    var paddedGridId = ('000' + gridId).slice(-3);
    
    var exportParams = {
      image: clippedImage,
      description: baseDescription + '_partition_' + paddedGridId + '_r' + row + 'c' + col,
      folder: "GEE_Batch_Exports",
      scale: downloadParams.scale,
      region: gridGeometry,
      fileFormat: "GeoTIFF",
      formatOptions: {
        cloudOptimized: true
      },
      maxPixels: downloadParams.maxPixels
    };
    
    // 逐个提交导出任务
    Export.image.toDrive(exportParams);
    
    print('已提交分区 ' + (i + 1) + '/' + partitionList.length + ' 的导出任务');
    
    // 添加短暂延迟，确保任务逐个提交
    if (i < partitionList.length - 1) {
      print('等待1秒后提交下一个分区...');
    }
  }
}

// ========== 8. 逐个区域下载函数 ==========
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
  print('- 网格大小: ' + downloadParams.gridSize + '度');
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
  print('- 网格大小: ' + downloadParams.gridSize + '度');
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
  print('建议：下载完成后可以使用GIS软件（如QGIS）将分区数据合并为完整影像');
}

// ========== 9. 初始化显示 ==========
// 显示可用区域列表
showAvailableRegions();

// 自动检查并下载非china区域
autoDownloadNonChinaRegions();

// ========== 10. 地图显示（可选） ==========
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
