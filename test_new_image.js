const http = require('http');

const requestData = {
  model: 'cogvideox',
  prompt: '让这个可爱的女孩动起来',
  image_url: 'https://fileup.chatglm.cn/chatglm-operation/image/23/2301478ca0.png?image_process=format,webp'
};

console.log('Request body object:', requestData);

const postData = JSON.stringify(requestData);
console.log('Sending request with data:', postData);

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

const req = http.request(options, (res) => {
  console.log('Status:', res.statusCode);
  console.log('Headers:', JSON.stringify(res.headers));

  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    console.log('Response:', data);
  });
});

req.on('error', (e) => {
  console.error('Request error:', e);
});

req.write(postData);
req.end();