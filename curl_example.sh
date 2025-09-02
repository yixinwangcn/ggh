#!/bin/bash

# 图生视频 curl 调用示例

# 方法1：使用image_url参数
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "model": "cogvideox",
    "prompt": "让这个可爱的女孩动起来，眨眨眼睛，微笑",
    "image_url": "https://fileup.chatglm.cn/chatglm-operation/image/23/2301478ca0.png?image_process=format,webp"
  }'

echo -e "\n\n=== 分隔线 ===\n"

# 方法2：使用本地图片URL
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "model": "cogvideox",
    "prompt": "一个美丽的女孩在花园里跳舞",
    "image_url": "https://example.com/your-image.jpg"
  }'

echo -e "\n\n=== 分隔线 ===\n"

# 方法3：带更多参数的完整示例
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE" \
  -d '{
    "model": "cogvideox",
    "prompt": "让图片中的人物动起来，表情生动自然",
    "image_url": "https://your-domain.com/image.png",
    "video_style": "realistic",
    "emotional_atmosphere": "happy",
    "mirror_mode": false
  }'