# 图生视频 API 使用文档

## 问题解决总结

✅ **已解决的问题**：
- 图生视频中参考图没有生效
- GLM服务端没有正确识别到图片
- source_list为空的问题

✅ **修复的关键点**：
1. **文件名解析**：正确处理URL查询参数（如`?image_process=format,webp`）
2. **MIME类型检测**：修复了文件类型识别失败导致的上传错误
3. **GLM API兼容**：添加了必需的签名headers确保图片上传成功

## API 接口说明

### 端点
```
POST /v1/videos/generations
```

### 请求头
```
Content-Type: application/json
Authorization: Bearer YOUR_JWT_TOKEN
```

### 请求参数

| 参数名 | 类型 | 必填 | 说明 |
|--------|------|------|------|
| model | string | 是 | 模型名称，固定为 "cogvideox" |
| prompt | string | 是 | 视频生成提示词，描述希望的动作效果 |
| image_url | string | 是 | 参考图片的URL地址 |
| video_style | string | 否 | 视频风格（可选） |
| emotional_atmosphere | string | 否 | 情感氛围（可选） |
| mirror_mode | boolean | 否 | 镜像模式（可选） |

### 请求示例

#### JSON格式
```json
{
  "model": "cogvideox",
  "prompt": "让这个可爱的女孩动起来，眨眨眼睛，微笑",
  "image_url": "https://fileup.chatglm.cn/chatglm-operation/image/23/2301478ca0.png?image_process=format,webp"
}
```

### 响应格式

#### 成功响应 (200)
```json
{
  "created": 1756575864,
  "data": [
    {
      "conversation_id": "68b33804194457137a1814db",
      "cover_url": "https://sfile.chatglm.cn/api/cogvideo/xxx_cover_0.jpeg",
      "video_url": "https://sfile.chatglm.cn/api/cogvideo/xxx_0.mp4",
      "video_duration": "5s",
      "resolution": "3 : 2"
    }
  ]
}
```

#### 错误响应
```json
{
  "code": -2001,
  "message": "错误描述",
  "data": null
}
```

### 响应字段说明

| 字段名 | 类型 | 说明 |
|--------|------|------|
| created | number | 创建时间戳 |
| data | array | 视频数据数组 |
| conversation_id | string | 对话ID |
| cover_url | string | 视频封面图URL |
| video_url | string | 视频文件URL |
| video_duration | string | 视频时长 |
| resolution | string | 视频分辨率 |

## 使用示例

### 1. Node.js 示例
```javascript
const http = require('http');

const requestData = {
  model: 'cogvideox',
  prompt: '让这个可爱的女孩动起来，眨眨眼睛，微笑',
  image_url: 'https://example.com/image.jpg'
};

const postData = JSON.stringify(requestData);

const options = {
  hostname: 'localhost',
  port: 8000,
  path: '/v1/videos/generations',
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer YOUR_JWT_TOKEN',
    'Content-Length': Buffer.byteLength(postData)
  }
};

const req = http.request(options, (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const result = JSON.parse(data);
    console.log('视频生成结果:', result);
  });
});

req.write(postData);
req.end();
```

### 2. curl 示例
```bash
curl -X POST http://localhost:8000/v1/videos/generations \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "model": "cogvideox",
    "prompt": "让这个可爱的女孩动起来，眨眨眼睛，微笑",
    "image_url": "https://example.com/image.jpg"
  }'
```

### 3. Python 示例
```python
import requests

url = "http://localhost:8000/v1/videos/generations"
headers = {
    "Content-Type": "application/json",
    "Authorization": "Bearer YOUR_JWT_TOKEN"
}
data = {
    "model": "cogvideox",
    "prompt": "让这个可爱的女孩动起来，眨眨眼睛，微笑",
    "image_url": "https://example.com/image.jpg"
}

response = requests.post(url, headers=headers, json=data)
result = response.json()
print("视频生成结果:", result)
```

## 注意事项

1. **图片格式**：支持 PNG、JPG、JPEG、WebP 格式
2. **图片大小**：建议不超过 10MB
3. **图片尺寸**：系统会自动调整为 1440px 宽度，高度最大 960px
4. **提示词**：建议使用中文，描述具体的动作和效果
5. **JWT Token**：需要有效的认证token才能调用API
6. **超时时间**：视频生成可能需要1-2分钟，请设置合适的超时时间

## 常见问题

### Q: 为什么图片没有生效？
A: 确保图片URL可以正常访问，格式正确，且服务已应用最新的修复代码。

### Q: 如何获取JWT Token？
A: 通过登录接口获取refresh_token，然后调用相关接口获取access_token。

### Q: 视频生成失败怎么办？
A: 检查图片URL是否有效，提示词是否合理，token是否过期。

### Q: 支持哪些视频效果？
A: 支持人物动作、表情变化、简单的场景动画等，具体效果取决于提示词描述。

## 技术实现细节

修复后的关键代码逻辑：
1. 正确解析图片URL，去除查询参数
2. 修复MIME类型检测，确保GLM能识别图片格式
3. 添加必需的签名headers用于GLM API认证
4. 将上传成功的source_id正确添加到source_list中

现在图生视频功能已完全正常，可以稳定使用！