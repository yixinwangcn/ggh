const http = require('http');

const requestBody = {
  model: 'cogvideox',
  prompt: '变成视频',
  image_url: 'https://vip.123pan.cn/1811661596/ymjew503t0l000d7w32xbw8hr6abytknDIYPDIQzDIJ2Apx2Dwe2.jpg'
};

const postData = JSON.stringify(requestBody);
console.log('Request body object:', requestBody);

const options = {
  hostname: 'localhost',
  port: 8000,
  path: '/v1/videos/generations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcyMDAyMTM0LCJuYmYiOjE3NTY0NTAxMzQsImlhdCI6MTc1NjQ1MDEzNCwianRpIjoiMTRiYmUzNjA1NmQyNDkxZWE2OWU4NWZiMWE5Y2Y1MjEiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJjY2ZmNTBkMWQ0ZGU0YWVhYWYxMjZjOWMxOWMyMGZiMSIsInR5cGUiOiJyZWZyZXNoIn0.Ba93tq3hskD_zNlHxBgvmH15NAr9ClIulDyqUW6V4os',
    'Content-Length': Buffer.byteLength(postData)
  }
};

console.log('Sending request with data:', postData);

const req = http.request(options, (res) => {
  console.log(`Status: ${res.statusCode}`);
  console.log(`Headers: ${JSON.stringify(res.headers)}`);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('Response:', data);
    process.exit(0);
  });
});

req.on('error', (e) => {
  console.error(`Problem with request: ${e.message}`);
  process.exit(1);
});

req.write(postData);
req.end();

// 设置超时
setTimeout(() => {
  console.log('Request timeout');
  process.exit(1);
}, 30000);