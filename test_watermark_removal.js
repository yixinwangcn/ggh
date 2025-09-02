const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:8000';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcxODM0NjkxLCJuYmYiOjE3NTYyODI2OTEsImlhdCI6MTc1NjI4MjY5MSwianRpIjoiOTQ4NzBlMjU4OGM2NGI2MTg0MTg5ZTlmMDMzYzI0MDUiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJhZjk4NGY2MTJiZTY0NjUzYmY0NWQ5YzgzMjZhZTRmZiIsInR5cGUiOiJyZWZyZXNoIn0.MpPs6dhsnMcHoxsy0aapUimrZOTU4FXjoCX5be-0nrM';

async function testWatermarkRemoval() {
  console.log('🎬 测试视频去水印功能...\n');

  try {
    console.log('📹 发送去水印视频生成请求...');
    
    const requestData = {
      model: "cogvideox",
      prompt: "做个动画",
      label_watermark: 0, // 关键：设置为0去除水印
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

    console.log('请求数据:', JSON.stringify(requestData, null, 2));

    const response = await axios.post(`${BASE_URL}/v1/videos/generations`, requestData, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 300000 // 5分钟超时
    });

    console.log('✅ 去水印视频生成请求成功!');
    console.log('响应数据:', JSON.stringify(response.data, null, 2));

    if (response.data.data && response.data.data.length > 0) {
      const videoData = response.data.data[0];
      console.log('\n🎉 视频生成成功!');
      console.log('📺 视频URL:', videoData.video_url);
      console.log('🖼️ 封面URL:', videoData.cover_url);
      console.log('⏱️ 视频时长:', videoData.video_duration);
      console.log('📐 分辨率:', videoData.resolution);
      console.log('\n💡 注意: label_watermark=0 应该已经去除了水印');
    }

  } catch (error) {
    console.log('❌ 去水印视频生成失败:');
    if (error.response) {
      console.log('状态码:', error.response.status);
      console.log('错误信息:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('错误:', error.message);
    }
  }
}

// 对比测试：带水印 vs 无水印
async function compareWatermark() {
  console.log('\n🔍 对比测试：带水印 vs 无水印\n');

  const baseRequest = {
    model: "cogvideox",
    prompt: "做个动画",
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

  // 测试1：带水印
  console.log('1️⃣ 测试带水印视频 (label_watermark: 1)');
  try {
    const withWatermark = await axios.post(`${BASE_URL}/v1/videos/generations`, {
      ...baseRequest,
      label_watermark: 1
    }, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ 带水印请求成功');
  } catch (error) {
    console.log('❌ 带水印请求失败:', error.response?.data || error.message);
  }

  // 测试2：无水印
  console.log('\n2️⃣ 测试无水印视频 (label_watermark: 0)');
  try {
    const withoutWatermark = await axios.post(`${BASE_URL}/v1/videos/generations`, {
      ...baseRequest,
      label_watermark: 0
    }, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
    console.log('✅ 无水印请求成功');
  } catch (error) {
    console.log('❌ 无水印请求失败:', error.response?.data || error.message);
  }
}

async function main() {
  await testWatermarkRemoval();
  await compareWatermark();
}

main().catch(console.error);