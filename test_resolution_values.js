const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:8000';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcxODM0NjkxLCJuYmYiOjE3NTYyODI2OTEsImlhdCI6MTc1NjI4MjY5MSwianRpIjoiOTQ4NzBlMjU4OGM2NGI2MTg0MTg5ZTlmMDMzYzI0MDUiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJhZjk4NGY2MTJiZTY0NjUzYmY0NWQ5YzgzMjZhZTRmZiIsInR5cGUiOiJyZWZyZXNoIn0.MpPs6dhsnMcHoxsy0aapUimrZOTU4FXjoCX5be-0nrM';

async function testDifferentResolutions() {
  console.log('🔍 测试不同resolution值对比例的影响...\n');

  const resolutionTests = [
    { resolution: 1, name: 'resolution=1' },
    { resolution: 2, name: 'resolution=2 (当前默认)' },
    { resolution: 3, name: 'resolution=3' },
    { resolution: 4, name: 'resolution=4' },
    { resolution: 5, name: 'resolution=5' }
  ];

  for (const test of resolutionTests) {
    console.log(`📐 测试 ${test.name}...`);
    
    try {
      const request = {
        model: "cogvideox",
        prompt: `测试${test.name}的比例`,
        label_watermark: 0,
        options: {
          generationPattern: 1,
          resolution: test.resolution,
          fps: 60,
          duration: 1,
          ratioWidth: 608,
          ratioHeight: 1080
        }
      };

      console.log(`   发送请求: resolution=${test.resolution}`);
      
      const response = await axios.post(`${BASE_URL}/v1/videos/generations`, request, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 只测试请求接受，不等待完成
      });

      console.log(`   ✅ 请求已接受`);
      
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.log(`   ⏱️ 请求已发送，生成中...`);
      } else if (error.response) {
        console.log(`   ❌ 请求失败: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
      } else {
        console.log(`   ❌ 网络错误: ${error.message}`);
      }
    }
    
    console.log(''); // 空行
  }
}

async function testAspectRatioParams() {
  console.log('🎯 测试可能的比例参数名...\n');

  const aspectTests = [
    {
      name: 'aspect_ratio 参数',
      params: { aspect_ratio: '9:16' }
    },
    {
      name: 'ratio 参数',
      params: { ratio: '9:16' }
    },
    {
      name: 'video_ratio 参数',
      params: { video_ratio: '9:16' }
    },
    {
      name: 'format 参数',
      params: { format: 'vertical' }
    },
    {
      name: 'orientation 参数',
      params: { orientation: 'portrait' }
    }
  ];

  for (const test of aspectTests) {
    console.log(`📱 测试 ${test.name}...`);
    
    try {
      const request = {
        model: "cogvideox",
        prompt: `测试${test.name}`,
        label_watermark: 0,
        options: {
          generationPattern: 1,
          resolution: 2,
          fps: 60,
          duration: 1,
          ...test.params
        }
      };

      console.log(`   参数:`, JSON.stringify(test.params, null, 2));
      
      const response = await axios.post(`${BASE_URL}/v1/videos/generations`, request, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      });

      console.log(`   ✅ 请求已接受`);
      
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.log(`   ⏱️ 请求已发送，生成中...`);
      } else if (error.response) {
        console.log(`   ❌ 请求失败: ${error.response.status} - ${error.response.data?.message || 'Unknown error'}`);
      } else {
        console.log(`   ❌ 网络错误: ${error.message}`);
      }
    }
    
    console.log('');
  }
}

async function main() {
  console.log('🎬 GLM 视频比例参数探索\n');
  console.log('目标: 找到控制视频比例的正确参数\n');
  
  await testDifferentResolutions();
  await testAspectRatioParams();
  
  console.log('💡 分析建议:');
  console.log('1. 检查服务器日志，查看实际发送到GLM API的参数');
  console.log('2. 对比GLM官网的视频生成请求格式');
  console.log('3. 可能需要使用特定的比例代码而非像素值');
  console.log('4. resolution参数可能直接控制输出比例');
}

main().catch(console.error);