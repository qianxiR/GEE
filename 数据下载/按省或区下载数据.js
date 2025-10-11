// Google数据下载工具
// 作者：[您的姓名]
var china_city = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/china_city"),
    china_county = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/china_county"),
    china_provinces = ee.FeatureCollection("projects/applied-pipe-453411-k9/assets/china_provinces");
// 定义UI面板
var mainPanel = ui.Panel({
      style: {
        width: '350px',
        padding: '10px',
        position: 'top-right'
      }
    });
    
    // 添加标题
    mainPanel.add(ui.Label('Google数据下载工具', {
      fontWeight: 'bold',
      fontSize: '20px',
      margin: '0 0 10px 0'
    }));
    
    mainPanel.add(ui.Label('基于Google Earth Engine的数据下载', {
      fontSize: '14px',
      margin: '0 0 15px 0'
    }));
    
    // 添加影像选择器
    mainPanel.add(ui.Label('选择影像:', { fontWeight: 'bold', margin: '5px 0' }));
    var imageSelect = ui.Select({
      items: [
        'COPERNICUS/S2_SR_HARMONIZED', // Sentinel-2 MSI Level-2A (SR)
        'COPERNICUS/S2_HARMONIZED', // Sentinel-2 MSI Level-1C (TOA)
        'COPERNICUS/S2_CLOUD_PROBABILITY', // Sentinel-2 Cloud Probability
        'CLOUD_SCORE_PLUS_HARMONIZED/S2_HARMONIZED_V1', // Cloud Score + S2_HARMONIZED V1
        'LANDSAT/LC08/C02/T1_TOA', // Landsat-8 Collection 2 Tier 1 TOA Reflectance
        'LANDSAT/LC08/C02/T1', // Landsat-8 Collection 2 Tier 1 and Real-Time data Raw Scenes
        'LANDSAT/LC09/C02/T1_TOA' // Landsat-9 Collection 2 Tier 1 TOA Reflectance
      ],
      placeholder: '选择影像',
      value: 'COPERNICUS/S2_SR_HARMONIZED'
    });
    mainPanel.add(imageSelect);
    
    // 添加日期选择区域
    var datePanel = ui.Panel({
      layout: ui.Panel.Layout.flow('vertical'),
      style: { margin: '0 0 10px 0' }
    });
    
    datePanel.add(ui.Label('研究时段:', { width: '100px' }));
    mainPanel.add(datePanel);
    
    // 开始时间选择
    var startDatePanel = ui.Panel();
    startDatePanel.add(ui.Label('开始时间:', { fontWeight: 'bold' }));
    
    var startYearSelect = ui.Select({
      items: ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'], // 增加年份选择范围
      placeholder: '年份',
      value: '2020',
      style: { width: '80px' }
    });
    
    var startMonthSelect = ui.Select({
      items: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
      placeholder: '月份',
      value: '01',
      style: { width: '80px' }
    });
    
    var startDateSelect = ui.Select({
      items: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'],
      placeholder: '日期',
      value: '01',
      style: { width: '80px' }
    });
    
    var startDateFlow = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: { margin: '0 0 5px 0' }
    });
    startDateFlow.add(startYearSelect);
    startDateFlow.add(startMonthSelect);
    startDateFlow.add(startDateSelect);
    startDatePanel.add(startDateFlow);
    mainPanel.add(startDatePanel);
    
    // 结束时间选择
    var endDatePanel = ui.Panel();
    endDatePanel.add(ui.Label('结束时间:', { fontWeight: 'bold' }));
    
    var endYearSelect = ui.Select({
      items: ['2015', '2016', '2017', '2018', '2019', '2020', '2021', '2022', '2023', '2024', '2025'], // 增加年份选择范围
      placeholder: '年份',
      value: '2025',
      style: { width: '80px' }
    });
    
    var endMonthSelect = ui.Select({
      items: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'],
      placeholder: '月份',
      value: '12',
      style: { width: '80px' }
    });
    
    var endDateSelect = ui.Select({
      items: ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31'],
      placeholder: '日期',
      value: '31',
      style: { width: '80px' }
    });
    
    var endDateFlow = ui.Panel({
      layout: ui.Panel.Layout.flow('horizontal'),
      style: { margin: '0 0 5px 0' }
    });
    endDateFlow.add(endYearSelect);
    endDateFlow.add(endMonthSelect);
    endDateFlow.add(endDateSelect);
    endDatePanel.add(endDateFlow);
    mainPanel.add(endDatePanel);
    
    // 添加研究区域选择
    mainPanel.add(ui.Label('研究区域:', { fontWeight: 'bold', margin: '5px 0' }));
    
    // 添加省份搜索框
    var provinceSearchBox = ui.Textbox({
      placeholder: '搜索省份（可选）',
      style: { width: '180px' },
      onChange: function (searchText) {
        searchProvinces(searchText);
      }
    });
    mainPanel.add(provinceSearchBox);
    
    // 省份搜索结果面板
    var provinceResultsPanel = ui.Panel({
      style: { 
        maxHeight: '150px',
        shown: false,
        margin: '5px 0'
      }
    });
    mainPanel.add(provinceResultsPanel);
    
    // 添加城市搜索框
    var citySearchBox = ui.Textbox({
      placeholder: '搜索城市（可选）',
      style: { width: '180px' },
      onChange: function (searchText) {
        searchCities(searchText);
      }
    });
    mainPanel.add(citySearchBox);
    
    // 城市搜索结果面板
    var cityResultsPanel = ui.Panel({
      style: { 
        maxHeight: '150px',
        shown: false,
        margin: '5px 0'
      }
    });
    mainPanel.add(cityResultsPanel);
    
    
    // 添加网格大小输入框
    mainPanel.add(ui.Label('网格大小（度）:', { fontWeight: 'bold', margin: '5px 0' }));
    var gridSizeInput = ui.Textbox({
      placeholder: '输入0-1之间的数值，如：0.5',
      value: '0.5',
      style: { width: '180px' }
    });
    mainPanel.add(gridSizeInput);
    
    // 添加说明标签
    mainPanel.add(ui.Label('建议：0.1度(约11km) 0.25度(约28km) 0.5度(约56km) 1.0度(约111km)', { 
      fontSize: '12px', 
      color: 'gray',
      margin: '2px 0 10px 0'
    }));
    
    // 添加下载按钮
    var downloadButton = ui.Button({
      label: '下载数据',
      style: {
        color: 'black',
        padding: '10px',
        margin: '10px 0'
      },
      onClick: downloadData
    });
    mainPanel.add(downloadButton);
    
    // 结果面板
    var resultsPanel = ui.Panel({
      style: {
        maxHeight: '200px',
        shown: false
      }
    });
    mainPanel.add(resultsPanel);
    
    // 添加结果指示器
    var loadingLabel = ui.Label({
      value: '数据下载中，请稍候...',
      style: {
        color: 'gray',
        shown: false
      }
    });
    mainPanel.add(loadingLabel);
    
    // 设置地图
    var map = ui.Map();
    map.setControlVisibility({
      zoomControl: true,
      mapTypeControl: true,
      layerList: true,
      fullscreenControl: false
    });
    
    // 设置绘图工具
    var drawingTools = map.drawingTools();
    drawingTools.setShown(false);
    drawingTools.setDrawModes(['polygon']);
    while (drawingTools.layers().length() > 0) {
      drawingTools.layers().remove(drawingTools.layers().get(0));
    }
    drawingTools.addLayer([]);
    drawingTools.setShape('polygon');
  
    
    // 存储当前选择的省份和城市
    var selectedProvince = null;
    var selectedCity = null;
    
    // 存储所有省份和城市数据
    var allProvinces = [];
    var allCities = [];
    
    /**
     * 动态加载省份列表
     * 入参: 无
     * 方法:
     * - 从GEE行政区划数据中获取所有省份名称
     * - 将结果转换为UI选择器所需的格式
     * 出参:
     * - Array: 包含省份选项的数组，格式为[{label: '省份名', value: '省份名'}]
     */
    function loadProvinceList() {
      // 从GEE数据中获取所有省份名称
      var provinceNames = china_provinces.aggregate_array('name');
      
      // 转换为UI选择器格式
      var provinceList = provinceNames.getInfo().map(function(provinceName) {
        return { label: provinceName, value: provinceName };
      });
      
      // 按名称排序
      provinceList.sort(function(a, b) {
        return a.label.localeCompare(b.label, 'zh-CN');
      });
      
      return provinceList;
    }
    
    /**
     * 动态加载所有城市列表
     * 入参: 无
     * 方法:
     * - 从GEE行政区划数据中获取所有城市
     * - 将结果转换为UI选择器所需的格式
     * 出参:
     * - Array: 包含城市选项的数组，格式为[{label: '城市名', value: '城市名'}]
     */
    function loadCityList() {
      // 从GEE数据中获取所有城市名称
      var cityNames = china_city.aggregate_array('name');
      
      // 转换为UI选择器格式
      var cityList = cityNames.getInfo().map(function(cityName) {
        return { label: cityName, value: cityName };
      });
      
      // 按名称排序
      cityList.sort(function(a, b) {
        return a.label.localeCompare(b.label, 'zh-CN');
      });
      
      return cityList;
    }
    
    
    /**
     * 搜索省份
     * 入参:
     * - searchText (string): 搜索关键词
     * 方法:
     * - 根据搜索关键词过滤省份列表
     * - 显示搜索结果
     * 出参: 无
     */
    function searchProvinces(searchText) {
      provinceResultsPanel.clear();
      
      if (!searchText || searchText.length < 1) {
        provinceResultsPanel.style().set('shown', false);
        return;
      }
      
      // 过滤省份列表
      var filteredProvinces = allProvinces.filter(function(province) {
        return province.label.indexOf(searchText) !== -1;
      });
      
      if (filteredProvinces.length === 0) {
        provinceResultsPanel.add(ui.Label('未找到匹配的省份', { color: 'gray' }));
      } else {
        // 限制显示结果数量
        var maxResults = Math.min(filteredProvinces.length, 10);
        for (var i = 0; i < maxResults; i++) {
          var province = filteredProvinces[i];
          var provinceButton = ui.Button({
            label: province.label,
            style: { 
              width: '100%',
              textAlign: 'left',
              margin: '2px 0'
            },
            onClick: function(provinceName) {
              return function() {
                selectedProvince = provinceName;
                provinceSearchBox.setValue(provinceName);
                provinceResultsPanel.style().set('shown', false);
                updateMap();
              };
            }(province.value)
          });
          provinceResultsPanel.add(provinceButton);
        }
      }
      
      provinceResultsPanel.style().set('shown', true);
    }
    
    /**
     * 搜索城市
     * 入参:
     * - searchText (string): 搜索关键词
     * 方法:
     * - 按需加载城市数据
     * - 根据搜索关键词过滤城市列表
     * - 显示搜索结果
     * 出参: 无
     */
    function searchCities(searchText) {
      cityResultsPanel.clear();
      
      if (!searchText || searchText.length < 1) {
        cityResultsPanel.style().set('shown', false);
        return;
      }
      
      // 如果城市数据未加载，先加载
      if (allCities.length === 0) {
        loadingLabel.setValue('正在加载城市数据...');
        loadingLabel.style().set('shown', true);
        
        // 异步加载城市数据
        allCities = loadCityList();
        loadingLabel.style().set('shown', false);
      }
      
      // 过滤城市列表
      var filteredCities = allCities.filter(function(city) {
        return city.label.indexOf(searchText) !== -1;
      });
      
      if (filteredCities.length === 0) {
        cityResultsPanel.add(ui.Label('未找到匹配的城市', { color: 'gray' }));
      } else {
        // 限制显示结果数量
        var maxResults = Math.min(filteredCities.length, 10);
        for (var i = 0; i < maxResults; i++) {
          var city = filteredCities[i];
          var cityButton = ui.Button({
            label: city.label,
            style: { 
              width: '100%',
              textAlign: 'left',
              margin: '2px 0'
            },
            onClick: function(cityName) {
              return function() {
                selectedCity = cityName;
                citySearchBox.setValue(cityName);
                cityResultsPanel.style().set('shown', false);
                updateMap();
              };
            }(city.value)
          });
          cityResultsPanel.add(cityButton);
        }
      }
      
      cityResultsPanel.style().set('shown', true);
    }
    
    
    /**
     * 更新地图显示
     * 入参: 无
     * 方法:
     * - 使用全局变量获取当前选择的值
     * - 优先显示城市，其次省份
     * - 如果都没有选择则显示提示信息
     * 出参: 无
     */
    function updateMap() {
      map.clear();
      var region;
      var layerName;
      var zoomLevel = 6;
    
      if (selectedCity) {
        // 优先显示城市
        var cityFeature = china_city.filter(ee.Filter.eq('name', selectedCity)).first();
        if (cityFeature) {
          region = cityFeature.geometry();
          layerName = selectedCity;
          zoomLevel = 8;
        } else {
          loadingLabel.setValue('所选城市不存在');
          return;
        }
      } else if (selectedProvince) {
        // 其次显示省份
        var provinceFeature = china_provinces.filter(ee.Filter.eq('name', selectedProvince)).first();
        if (provinceFeature) {
          region = provinceFeature.geometry();
          layerName = selectedProvince;
          zoomLevel = 6;
        } else {
          loadingLabel.setValue('所选省份不存在');
          return;
        }
      } else {
        // 没有选择任何区域
        loadingLabel.setValue('请选择研究区域（省份或城市）');
        return;
      }
    
      if (region) {
        map.centerObject(region, zoomLevel);
        map.addLayer(region, { color: 'red' }, layerName);
        
        // 打印已选择的影像信息
        printSelectedImageInfo();
      }
    }
    
    /**
     * 打印已选择的影像信息
     * 入参: 无
     * 方法:
     * - 获取当前选择的影像类型、时间范围、网格大小等参数
     * - 在控制台打印详细的影像信息
     * 出参: 无
     */
    function printSelectedImageInfo() {
      // 获取当前选择的参数
      var selectedImage = imageSelect.getValue();
      var startYear = startYearSelect.getValue();
      var startMonth = startMonthSelect.getValue();
      var startDate = startDateSelect.getValue();
      var endYear = endYearSelect.getValue();
      var endMonth = endMonthSelect.getValue();
      var endDate = endDateSelect.getValue();
      var gridSize = gridSizeInput.getValue();
      
      var start = startYear + '-' + startMonth + '-' + startDate;
      var end = endYear + '-' + endMonth + '-' + endDate;
      
      // 获取影像类型的中文名称
      var imageTypeName;
      switch (selectedImage) {
        case 'COPERNICUS/S2_SR_HARMONIZED':
          imageTypeName = 'Sentinel-2 地表反射率 (SR)';
          break;
        case 'COPERNICUS/S2_HARMONIZED':
          imageTypeName = 'Sentinel-2 大气层顶反射率 (TOA)';
          break;
        case 'COPERNICUS/S2_CLOUD_PROBABILITY':
          imageTypeName = 'Sentinel-2 云概率';
          break;
        case 'CLOUD_SCORE_PLUS_HARMONIZED/S2_HARMONIZED_V1':
          imageTypeName = 'Cloud Score + Sentinel-2';
          break;
        case 'LANDSAT/LC08/C02/T1_TOA':
          imageTypeName = 'Landsat-8 大气层顶反射率 (TOA)';
          break;
        case 'LANDSAT/LC08/C02/T1':
          imageTypeName = 'Landsat-8 地表反射率 (SR)';
          break;
        case 'LANDSAT/LC09/C02/T1_TOA':
          imageTypeName = 'Landsat-9 大气层顶反射率 (TOA)';
          break;
        default:
          imageTypeName = selectedImage;
      }
      
      // 获取研究区域名称
      var regionName = '';
      if (selectedCity) {
        regionName = selectedCity;
      } else if (selectedProvince) {
        regionName = selectedProvince;
      }
      
      // 计算网格大小对应的公里数
      var gridSizeKm = parseFloat(gridSize) * 111;
      
      // 打印影像信息
      print('==================== 已选择的影像信息 ====================');
      print('影像类型: ' + imageTypeName);
      print('研究区域: ' + regionName);
      print('时间范围: ' + start + ' 至 ' + end);
      print('网格大小: ' + gridSize + '度 (约' + Math.round(gridSizeKm) + 'km)');
      print('========================================================');
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
          maxPixels: 1e8 // 限制每个分区的最大像素数为1亿
        };
        
        // 提交导出任务
        Export.image.toDrive(exportParams);
        
        print('已提交分区 ' + (index + 1) + '/' + partitionList.length + ' 的导出任务');
      });
    }

    // 主要下载函数
    function downloadData() {
      // 显示加载指示器
      loadingLabel.style().set('shown', true);
      resultsPanel.style().set('shown', false);
    
      // 获取影像选择
      var selectedImage = imageSelect.getValue();
      
      // 获取网格大小
      var gridSizeValue = gridSizeInput.getValue();
      var gridSize = parseFloat(gridSizeValue);
      
      // 验证网格大小
      if (isNaN(gridSize) || gridSize <= 0 || gridSize > 1) {
        loadingLabel.setValue('请输入有效的网格大小（0-1之间的数值）');
        return;
      }
    
      // 获取日期参数
      var startYear = startYearSelect.getValue();
      var startMonth = startMonthSelect.getValue();
      var startDate = startDateSelect.getValue();
      var endYear = endYearSelect.getValue();
      var endMonth = endMonthSelect.getValue();
      var endDate = endDateSelect.getValue();
    
      var start = startYear + '-' + startMonth + '-' + startDate;
      var end = endYear + '-' + endMonth + '-' + endDate;
    
      // 日期验证
      var startDateObj = new Date(start);
      var endDateObj = new Date(end);
      if (startDateObj > endDateObj) {
        loadingLabel.setValue('开始日期必须早于结束日期');
        return;
      }
    
      // 获取研究区域
      var region;
      var selectedRegionName;
      
      // 根据选择获取区域（优先城市，其次省份）
      if (selectedCity) {
        var cityFeature = china_city.filter(ee.Filter.eq('name', selectedCity)).first();
        if (cityFeature) {
          region = ee.Feature(cityFeature).geometry();
          selectedRegionName = selectedCity;
        } else {
          loadingLabel.setValue('所选城市不存在');
          return;
        }
      } else if (selectedProvince) {
        var provinceFeature = china_provinces.filter(ee.Filter.eq('name', selectedProvince)).first();
        if (provinceFeature) {
          region = provinceFeature.geometry();
          selectedRegionName = selectedProvince;
        } else {
          loadingLabel.setValue('所选省份不存在');
          return;
        }
      } else {
        loadingLabel.setValue('请选择研究区域（省份或城市）');
        return;
      }
    
      // 重置地图并居中显示
      map.clear();
      if (region) {
        map.centerObject(region, 8);
      }
    
      // ============== 以下是您的数据下载逻辑 ==============
      var imageCollection = ee.ImageCollection(selectedImage);
      var bandNames;
      var scale;
    
      // 设置下载参数
      switch (selectedImage) {
        case 'COPERNICUS/S2_SR_HARMONIZED':
          bandNames = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12']; // 下载所有波段
          scale = 10;
          break;
        case 'COPERNICUS/S2_HARMONIZED':
          bandNames = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B8', 'B8A', 'B9', 'B11', 'B12'];
          scale = 10;
          break;
        case 'COPERNICUS/S2_CLOUD_PROBABILITY':
          bandNames = ['probability'];
          scale = 10;
          break;
        case 'CLOUD_SCORE_PLUS_HARMONIZED/S2_HARMONIZED_V1':
          bandNames = ['cs_cloud_shadow', 'cs_cloud', 'cs_clear'];
          scale = 10;
          break;
        case 'LANDSAT/LC08/C02/T1_TOA':
          bandNames = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B10', 'B11'];
          scale = 30;
          break;
        case 'LANDSAT/LC08/C02/T1':
          bandNames = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B10', 'B11'];
          scale = 30;
          break;
        case 'LANDSAT/LC09/C02/T1_TOA':
          bandNames = ['B1', 'B2', 'B3', 'B4', 'B5', 'B6', 'B7', 'B10', 'B11'];
          scale = 30;
          break;
        default:
          bandNames = ['B2', 'B3', 'B4'];
          scale = 30;
      }
    
      // 数据预处理函数
      function preprocessImage(image) {
        var selectedBands = image.select(bandNames);
        return selectedBands.clip(region);
      }
    
      // 数据筛选 - 添加云量过滤（仅对哨兵影像）
      var data;
      var imageType = String(selectedImage);
      if (region) {
        if (imageType.indexOf('COPERNICUS/S2') !== -1) {
          // 哨兵影像添加云量过滤
          data = imageCollection.filterDate(start, end)
            .filterBounds(region)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
            .map(preprocessImage)
            .median();
        } else {
          // 其他影像类型不进行云量过滤
          data = imageCollection.filterDate(start, end)
            .filterBounds(region)
            .map(preprocessImage)
            .median();
        }
      } else {
        if (imageType.indexOf('COPERNICUS/S2') !== -1) {
          data = imageCollection.filterDate(start, end)
            .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
            .map(preprocessImage)
            .median();
        } else {
          data = imageCollection.filterDate(start, end)
            .map(preprocessImage)
            .median();
        }
      }
    
      // 显示参数 - 根据影像类型设置不同的显示参数
      var visualization;
      if (imageType.indexOf('COPERNICUS/S2') !== -1) {
        // 哨兵影像使用RGB显示
        visualization = {
          min: 0,
          max: 3000,
          bands: ['B4', 'B3', 'B2'] // RGB波段
        };
      } else if (imageType.indexOf('LANDSAT') !== -1) {
        // Landsat影像使用RGB显示
        visualization = {
          min: 0,
          max: 0.3,
          bands: ['B4', 'B3', 'B2'] // RGB波段
        };
      } else {
        // 其他影像类型使用前三个波段
        visualization = {
          min: 0,
          max: 0.3,
          bands: bandNames.slice(0, 3)
        };
      }
    
    
      // 分区下载模式（默认）
      var baseDescription = selectedImage.replace(/\//g, '_') + '_' + selectedRegionName + '_Download';
      
      // 调用分区导出函数
      exportDataByPartitions(data, region, baseDescription, gridSize);
      
      // 显示结果
      loadingLabel.style().set('shown', false);
      resultsPanel.clear();
      resultsPanel.style().set('shown', true);
      
      // 计算分区数量
      var bounds = region.bounds().getInfo().coordinates[0];
      var lonRange = bounds[2][0] - bounds[0][0];
      var latRange = bounds[2][1] - bounds[0][1];
      var partitionCount = Math.ceil(lonRange / gridSize) * Math.ceil(latRange / gridSize);
      
      // 计算每个分区的像素数量（km²除以分辨率²）
      var gridSizeKm = gridSize * 111; // 1度约等于111km
      var pixelCount = Math.round((gridSizeKm * gridSizeKm) / (scale * scale / 1000000)); // scale转换为km
      
      resultsPanel.add(ui.Label('分区下载任务已创建，共 ' + partitionCount + ' 个分区', { color: 'blue' }));
      resultsPanel.add(ui.Label('网格大小：' + gridSize + '度（约' + Math.round(gridSizeKm) + 'km），每分区约' + pixelCount.toLocaleString() + '像素', { color: 'gray', fontSize: '12px' }));
      resultsPanel.add(ui.Label('请在Tasks中查看进度，下载完成后可使用GIS软件合并分区数据', { color: 'gray', fontSize: '12px' }));
    }
    
    /**
     * 初始化搜索框
     * 入参: 无
     * 方法:
     * - 延迟加载数据，避免启动时卡死
     * - 只加载省份数据，城市数据按需加载
     * 出参: 无
     */
    function initializeSearchBoxes() {
      // 只加载省份列表，数据量较小
      allProvinces = loadProvinceList();
      
      // 城市数据初始化为空，按需加载
      allCities = [];
      
      // 显示提示信息
      loadingLabel.setValue('数据加载中，请稍候...');
      loadingLabel.style().set('shown', true);
    }
    
    // 调整ui.root.add的顺序
    ui.root.clear();
    ui.root.add(map); // 先添加地图
    ui.root.add(mainPanel); // 后添加控制面板，这样面板会显示在右侧
    
    // 初始化搜索框
    initializeSearchBoxes();
    
    // 初始化显示中国中心位置
    map.setCenter(104.0, 30.0, 6);
    
    // 隐藏加载提示
    loadingLabel.style().set('shown', false);
    