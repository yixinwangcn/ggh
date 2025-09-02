#!/bin/bash

# GLM图生视频 curl 调用示例集合
# 使用方法：chmod +x curl_examples.sh && ./curl_examples.sh

echo "=== GLM图生视频 curl调用示例 ==="

# 替换为你的实际JWT token
JWT_TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiLnlKjmiLdfR28wajV5IiwiZXhwIjoxNzcyMDAyMTM0LCJuYmYiOjE3NTY0NTAxMzQsImlhdCI6MTc1NjQ1MDEzNCwianRpIjoiMTRiYmUzNjA1NmQyNDkxZWE2OWU4NWZiMWE5Y2Y1MjEiLCJ1aWQiOiI2NTFkNGIyMjNmY2IxYjk2OGQyN2ZhNTUiLCJkZXZpY2VfaWQiOiJjY2ZmNTBkMWQ0ZGU0YWVhYWYxMjZjOWMxOWMyMGZiMSIsInR5cGUiOiJyZWZyZXNoIn0.Ba93tq3hskD_zNlHxBgvmH15NAr9ClIulDyqUW6V4os"

# API服务器地址
API_BASE="http://localhost:8000"

echo -e "\n1. 基础图生视频示例"
echo "================================"
curl -X POST "${API_BASE}/v1/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "model": "cogvideox",
    "prompt": "让这个可爱的女孩动起来，眨眨眼睛，微笑",
    "image_url": "https://fileup.chatglm.cn/chatglm-operation/image/23/2301478ca0.png?image_process=format,webp"
  }' | jq '.'

echo -e "\n\n2. 带详细参数的图生视频示例"
echo "================================"
curl -X POST "${API_BASE}/v1/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "model": "cogvideox",
    "prompt": "图片中的人物开始跳舞，动作优雅流畅，表情生动自然",
    "image_url": "https://example.com/your-image.jpg",
    "video_style": "realistic",
    "emotional_atmosphere": "happy",
    "mirror_mode": false
  }' | jq '.'

echo -e "\n\n3. 动物图片生成视频示例"
echo "================================"
curl -X POST "${API_BASE}/v1/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "model": "cogvideox",
    "prompt": "让这只可爱的小猫咪动起来，眨眨眼睛，摇摇尾巴",
    "image_url": "https://example.com/cat-image.jpg"
  }' | jq '.'

echo -e "\n\n4. 风景图片生成视频示例"
echo "================================"
curl -X POST "${API_BASE}/v1/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "model": "cogvideox",
    "prompt": "让画面中的树叶轻轻摆动，云朵缓缓飘过，营造自然的动态效果",
    "image_url": "https://example.com/landscape.jpg"
  }' | jq '.'

echo -e "\n\n5. 不使用jq格式化的简单示例"
echo "================================"
curl -X POST "${API_BASE}/v1/videos/generations" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "model": "cogvideox",
    "prompt": "让这个人物动起来，自然地眨眼和微笑",
    "image_url": "https://your-domain.com/image.png"
  }'

echo -e "\n\n=== 完成 ==="