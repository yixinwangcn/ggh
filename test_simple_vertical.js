const axios = require('axios');

async function testVerticalVideo() {
  console.log('🎬 测试纵向视频生成...\n');

  const request = {
    model: "cogvideox",
    prompt: "做个纵向动画",
    label_watermark: 0,
    image_url: "https://vip.123pan.cn/1811661596/yk6baz03t0n000d7w33h5dcp8o91c5rcDIYPDIQzDIJ2Apx2Dwe2.webp",
    options: {
      generationPattern: 1,
      resolution: 2,
      fps: 60,
      duration: 1,
      ratioWidth: 608,   // 9:16 纵向
      ratioHeight: 1080
    }
  };

  console.log('📐 请求参数:');
  console.log('- 比例设置: 608x1080');
  console.log('- 计算比例:', (608/1080).toFixed(3), '(标准9:16 =', (9/16).toFixed(3), ')');
  console.log('- 去水印: label_watermark =', request.label_watermark);
  console.log();

  try {
    console.log('🚀 发送请求...');
    const response = await axios.post('http://127.0.0.1:8000/v1/videos/generations', request, {
      headers: {
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcxODM0NjkxLCJuYmYiOjE3NTYyODI2OTEsImlhdCI6MTc1NjI4MjY5MSwianRpIjoiOTQ4NzBlMjU4OGM2NGI2MTg0MTg5ZTlmMDMzYzI0MDUiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJhZjk4NGY2MTJiZTY0NjUzYmY0NWQ5YzgzMjZhZTRmZiIsInR5cGUiOiJyZWZyZXNoIn0.MpPs6dhsnMcHoxsy0aapUimrZOTU4FXjoCX5be-0nrM',
        'Content-Type': 'application/json'
      },
      timeout: 300000 // 5分钟
    });

    console.log('✅ 请求成功!');
    
    if (response.data.data && response.data.data.length > 0) {
      const video = response.data.data[0];
      console.log('\n🎉 视频生成完成!');
      console.log('📺 视频URL:', video.video_url);
      console.log('🖼️ 封面URL:', video.cover_url);
      console.log('📐 实际分辨率:', video.resolution);
      console.log('⏱️ 视频时长:', video.video_duration);
      
      // 分析比例结果
      if (video.resolution) {
        console.log('\n📊 比例分析:');
        console.log('- 请求比例: 608:1080 (9:16 纵向)');
        console.log('- 实际分辨率:', video.resolution);
        
        if (video.resolution.includes('9') && video.resolution.includes('16')) {
          console.log('✅ 比例正确: 纵向9:16');
        } else if (video.resolution.includes('16') && video.resolution.includes('9')) {
          console.log('❌ 比例错误: 变成了横向16:9');
        } else {
          console.log('⚠️ 比例未知:', video.resolution);
        }
      }
      
      console.log('\n💡 去水印状态: label_watermark=0 应该已去除水印');
      
    } else {
      console.log('⚠️ 响应中没有视频数据');
      console.log('响应:', JSON.stringify(response.data, null, 2));
    }

  } catch (error) {
    if (error.code === 'ECONNABORTED') {
      console.log('⏱️ 请求超时，但视频可能仍在生成中...');
    } else {
      console.log('❌ 请求失败:');
      if (error.response) {
        console.log('状态码:', error.response.status);
        console.log('错误信息:', JSON.stringify(error.response.data, null, 2));
      } else {
        console.log('错误:', error.message);
      }
    }
  }
}

testVerticalVideo();