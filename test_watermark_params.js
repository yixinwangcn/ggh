const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:8000';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcxODM0NjkxLCJuYmYiOjE3NTYyODI2OTEsImlhdCI6MTc1NjI4MjY5MSwianRpIjoiOTQ4NzBlMjU4OGM2NGI2MTg0MTg5ZTlmMDMzYzI0MDUiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJhZjk4NGY2MTJiZTY0NjUzYmY0NWQ5YzgzMjZhZTRmZiIsInR5cGUiOiJyZWZyZXNoIn0.MpPs6dhsnMcHoxsy0aapUimrZOTU4FXjoCX5be-0nrM';

async function testWatermarkParams() {
  console.log('🔍 测试不同的去水印参数格式...\n');

  const watermarkTests = [
    {
      name: 'label_watermark: 0 (当前实现)',
      params: { label_watermark: 0 }
    },
    {
      name: 'watermark: false',
      params: { watermark: false }
    },
    {
      name: 'no_watermark: true',
      params: { no_watermark: true }
    },
    {
      name: 'remove_watermark: true',
      params: { remove_watermark: true }
    },
    {
      name: 'watermark_enabled: false',
      params: { watermark_enabled: false }
    },
    {
      name: '在options中设置label_watermark',
      params: {},
      options: { label_watermark: 0 }
    }
  ];

  for (const test of watermarkTests) {
    console.log(`🧪 测试: ${test.name}`);
    
    try {
      const request = {
        model: "cogvideox",
        prompt: `测试去水印-${test.name}`,
        image_url: "https://vip.123pan.cn/1811661596/yk6baz03t0n000d7w33h5dcp8o91c5rcDIYPDIQzDIJ2Apx2Dwe2.webp",
        ...test.params,
        options: {
          generationPattern: 1,
          resolution: 2,
          fps: 60,
          duration: 1,
          ratioWidth: 608,
          ratioHeight: 1080,
          ...(test.options || {})
        }
      };

      console.log('   参数:', JSON.stringify(test.params, null, 2));
      if (test.options) {
        console.log('   options:', JSON.stringify(test.options, null, 2));
      }
      
      const response = await axios.post(`${BASE_URL}/v1/videos/generations`, request, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log('   ✅ 请求已发送');
      
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.log('   ⏱️ 请求已发送，生成中...');
      } else if (error.response) {
        console.log(`   ❌ 请求失败: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
      } else {
        console.log(`   ❌ 网络错误: ${error.message}`);
      }
    }
    
    console.log('');
  }
}

async function testOriginalFormat() {
  console.log('🎯 测试用户原始请求格式...\n');
  
  // 基于用户原始请求的格式
  const originalRequest = {
    model: "cogvideox",
    prompt: "做个动画",
    label_watermark: 0, // 用户原始请求中的参数
    image_url: "https://vip.123pan.cn/1811661596/yk6baz03t0n000d7w33h5dcp8o91c5rcDIYPDIQzDIJ2Apx2Dwe2.webp",
    options: {
      generationPattern: 1,
      resolution: 2,
      fps: 60,
      duration: 1,
      ratioWidth: 608,
      ratioHeight: 1080
    }
  };

  console.log('📋 用户原始格式测试:');
  console.log(JSON.stringify(originalRequest, null, 2));
  
  try {
    const response = await axios.post(`${BASE_URL}/v1/videos/generations`, originalRequest, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    console.log('✅ 原始格式请求已发送');
    
  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.log('⏱️ 原始格式请求已发送，生成中...');
    } else {
      console.log('❌ 原始格式请求失败:', error.response?.data || error.message);
    }
  }
}

async function main() {
  console.log('🎬 GLM 去水印参数测试\n');
  console.log('目标: 找到正确的去水印参数格式\n');
  
  await testWatermarkParams();
  await testOriginalFormat();
  
  console.log('💡 分析建议:');
  console.log('1. 检查服务器日志，查看实际发送到GLM API的参数');
  console.log('2. 对比不同参数格式的生成结果');
  console.log('3. 可能需要在不同位置设置去水印参数');
  console.log('4. 验证参数是否正确传递到GLM官方API');
}

main().catch(console.error);