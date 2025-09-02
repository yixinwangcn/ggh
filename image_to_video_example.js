const http = require('http');

// 图生视频API调用示例
const requestData = {
  model: 'cogvideox',
  prompt: '让这个可爱的女孩动起来，眨眨眼睛，微笑',
  image_url: 'https://fileup.chatglm.cn/chatglm-operation/image/23/2301478ca0.png?image_process=format,webp'
};

console.log('发送图生视频请求...');
console.log('请求数据:', JSON.stringify(requestData, null, 2));

const postData = JSON.stringify(requestData);

const options = {
  hostname: 'localhost',
  port: 8000,
  path: '/v1/videos/generations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN_HERE', // 替换为你的JWT token
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  console.log('响应状态:', res.statusCode);
  console.log('响应头:', JSON.stringify(res.headers, null, 2));

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('响应结果:');
    try {
      const result = JSON.parse(data);
      console.log(JSON.stringify(result, null, 2));
      
      if (result.code === 0 && result.data) {
        console.log('\n✅ 视频生成成功!');
        console.log('视频ID:', result.data.id);
        console.log('任务状态:', result.data.task_status);
        if (result.data.video_result && result.data.video_result.length > 0) {
          console.log('视频URL:', result.data.video_result[0].url);
        }
      } else {
        console.log('\n❌ 请求失败:', result.message);
      }
    } catch (e) {
      console.log('原始响应:', data);
    }
  });
});

req.on('error', (e) => {
  console.error('请求错误:', e);
});

req.write(postData);
req.end();