const axios = require('axios');

const BASE_URL = 'http://127.0.0.1:8000';
const TEST_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcxODM0NjkxLCJuYmYiOjE3NTYyODI2OTEsImlhdCI6MTc1NjI4MjY5MSwianRpIjoiOTQ4NzBlMjU4OGM2NGI2MTg0MTg5ZTlmMDMzYzI0MDUiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJhZjk4NGY2MTJiZTY0NjUzYmY0NWQ5YzgzMjZhZTRmZiIsInR5cGUiOiJyZWZyZXNoIn0.MpPs6dhsnMcHoxsy0aapUimrZOTU4FXjoCX5be-0nrM';

async function testVideoRatio() {
  console.log('🎬 测试视频比例设置...\n');

  // 测试纵向视频 (9:16)
  console.log('📱 测试纵向视频 (9:16 比例)...');
  
  try {
    const verticalRequest = {
      model: "cogvideox",
      prompt: "做个纵向动画",
      label_watermark: 0,
      image_url: "https://vip.123pan.cn/1811661596/yk6baz03t0n000d7w33h5dcp8o91c5rcDIYPDIQzDIJ2Apx2Dwe2.webp",
      options: {
        generationPattern: 1,
        resolution: 2,
        fps: 60,
        duration: 1,
        ratioWidth: 608,   // 9的倍数
        ratioHeight: 1080  // 16的倍数，确保9:16比例
      }
    };

    console.log('纵向请求参数:', JSON.stringify(verticalRequest, null, 2));
    console.log('计算比例:', (verticalRequest.options.ratioWidth / verticalRequest.options.ratioHeight).toFixed(3), '(应该约等于0.563 for 9:16)');

    const response = await axios.post(`${BASE_URL}/v1/videos/generations`, verticalRequest, {
      headers: {
        'Authorization': `Bearer ${TEST_TOKEN}`,
        'Content-Type': 'application/json'
      },
      timeout: 300000
    });

    console.log('✅ 纵向视频生成成功!');
    console.log('响应:', JSON.stringify(response.data, null, 2));

    if (response.data.data && response.data.data.length > 0) {
      const videoData = response.data.data[0];
      console.log('\n📺 生成结果:');
      console.log('视频URL:', videoData.video_url);
      console.log('分辨率:', videoData.resolution);
      console.log('预期比例: 9:16 (纵向)');
      console.log('实际比例:', videoData.resolution);
    }

  } catch (error) {
    console.log('❌ 纵向视频生成失败:');
    if (error.response) {
      console.log('状态码:', error.response.status);
      console.log('错误信息:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.log('错误:', error.message);
    }
  }
}

// 测试不同比例设置
async function testDifferentRatios() {
  console.log('\n🔍 测试不同比例设置...\n');

  const ratios = [
    { name: '9:16 (纵向)', width: 608, height: 1080 },
    { name: '16:9 (横向)', width: 1080, height: 608 },
    { name: '1:1 (正方形)', width: 720, height: 720 },
    { name: '4:3 (传统)', width: 720, height: 960 }
  ];

  for (const ratio of ratios) {
    console.log(`📐 测试 ${ratio.name} 比例...`);
    console.log(`   尺寸: ${ratio.width}x${ratio.height}`);
    console.log(`   比例: ${(ratio.width / ratio.height).toFixed(3)}`);
    
    try {
      const request = {
        model: "cogvideox",
        prompt: `做个${ratio.name}的动画`,
        label_watermark: 0,
        options: {
          generationPattern: 1,
          resolution: 2,
          fps: 60,
          duration: 1,
          ratioWidth: ratio.width,
          ratioHeight: ratio.height
        }
      };

      // 只发送请求，不等待完成（避免超时）
      const response = await axios.post(`${BASE_URL}/v1/videos/generations`, request, {
        headers: {
          'Authorization': `Bearer ${TEST_TOKEN}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30秒超时，只测试请求是否被接受
      });

      console.log(`✅ ${ratio.name} 请求已发送`);
      
    } catch (error) {
      if (error.code === 'ECONNABORTED') {
        console.log(`⏱️ ${ratio.name} 请求已发送，生成中...`);
      } else {
        console.log(`❌ ${ratio.name} 请求失败:`, error.response?.data?.message || error.message);
      }
    }
    
    console.log(''); // 空行分隔
  }
}

async function main() {
  await testVideoRatio();
  await testDifferentRatios();
  
  console.log('\n💡 提示:');
  console.log('- 如果生成的视频比例不正确，可能需要调整 ratioWidth 和 ratioHeight 参数');
  console.log('- 9:16 纵向视频应该使用 ratioWidth: 608, ratioHeight: 1080');
  console.log('- 16:9 横向视频应该使用 ratioWidth: 1080, ratioHeight: 608');
}

main().catch(console.error);