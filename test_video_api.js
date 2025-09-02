const axios = require('axios');

async function testVideoGeneration() {
  try {
    console.log('Testing video generation with image...');
    
    const response = await axios.post('http://localhost:8000/v1/videos/generations', {
      model: 'cogvideox',
      prompt: '变成视频',
      image_url: 'https://vip.123pan.cn/1811661596/ymjew503t0l000d7w32xbw8hr6abytknDIYPDIQzDIJ2Apx2Dwe2.jpg'
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcyMDAyMTM0LCJuYmYiOjE3NTY0NTAxMzQsImlhdCI6MTc1NjQ1MDEzNCwianRpIjoiMTRiYmUzNjA1NmQyNDkxZWE2OWU4NWZiMWE5Y2Y1MjEiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJjY2ZmNTBkMWQ0ZGU0YWVhYWYxMjZjOWMxOWMyMGZiMSIsInR5cGUiOiJyZWZyZXNoIn0.Ba93tq3hskD_zNlHxBgvmH15NAr9ClIulDyqUW6V4os'
      }
    });
    
    console.log('Response:', JSON.stringify(response.data, null, 2));
  } catch (error) {
    console.error('Error:', error.response ? error.response.data : error.message);
  }
}

testVideoGeneration();