import _ from 'lodash';
import { Context } from 'koa';
import crypto from 'crypto';
import axios from 'axios';

import APIException from '@/lib/exceptions/APIException.ts';
import EX from '@/api/consts/exceptions.ts';
import { createParser } from 'eventsource-parser';
import logger from '@/lib/logger.ts';
import util from '@/lib/util.ts';

// GLM API 配置
const GLM_API_BASE = 'https://open.bigmodel.cn/api/paas/v4';
const GLM_WEB_BASE = 'https://chatglm.cn/chatglm/backend-api';

// Token 缓存
const tokenCache = new Map<string, {
  token: string;
  refreshToken: string;
  expiresAt: number;
}>();

/**
 * 生成请求签名
 */
async function generateSign(token: string, timestamp: number): Promise<string> {
  const signData = `${token}.${timestamp}`;
  return crypto.createHash('sha256').update(signData).digest('hex');
}

/**
 * 请求访问令牌
 */
async function requestToken(apikey: string): Promise<string> {
  try {
    const response = await axios.post(`${GLM_WEB_BASE}/assistant/conversation`, {
      assistant_id: apikey
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    return response.data.result?.token || '';
  } catch (error) {
    logger.error('获取token失败:', error);
    throw new APIException(EX.API_REQUEST_FAILED, '获取访问令牌失败');
  }
}

/**
 * 刷新访问令牌
 */
async function acquireToken(refreshToken: string): Promise<string> {
  try {
    const response = await axios.post(`${GLM_WEB_BASE}/assistant/conversation/refresh`, {
      refresh_token: refreshToken
    }, {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    return response.data.result?.token || '';
  } catch (error) {
    logger.error('刷新token失败:', error);
    throw new APIException(EX.API_REQUEST_FAILED, '刷新访问令牌失败');
  }
}

/**
 * 获取有效的访问令牌
 */
async function getValidToken(apikey: string): Promise<string> {
  const cached = tokenCache.get(apikey);
  
  if (cached && cached.expiresAt > Date.now()) {
    return cached.token;
  }
  
  let newToken: string;
  if (cached?.refreshToken) {
    try {
      newToken = await acquireToken(cached.refreshToken);
    } catch (error) {
      // 刷新失败，重新获取
      newToken = await requestToken(apikey);
    }
  } else {
    newToken = await requestToken(apikey);
  }
  
  // 缓存新token（假设有效期1小时）
  tokenCache.set(apikey, {
    token: newToken,
    refreshToken: cached?.refreshToken || newToken,
    expiresAt: Date.now() + 3600000 // 1小时
  });
  
  return newToken;
}

/**
 * 视频生成
 */
export default async function generateVideos(ctx: Context) {
  const { 
    model = 'cogvideox',
    prompt,
    image_url,
    size = '1280x720',
    quality = 'standard',
    response_format = 'url'
  } = ctx.request.body as any;

  if (!prompt) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, 'prompt参数不能为空');
  }

  // 从Authorization头获取API Key
  const authorization = ctx.request.headers.authorization;
  if (!authorization || !authorization.startsWith('Bearer ')) {
    throw new APIException(EX.API_REQUEST_PARAMS_INVALID, '缺少有效的Authorization头');
  }
  
  const apikey = authorization.replace('Bearer ', '');
  
  try {
    // 获取访问令牌
    const accessToken = await getValidToken(apikey);
    const timestamp = Date.now();
    const sign = await generateSign(accessToken, timestamp);
    
    // 构建请求数据
    const requestData = {
      model,
      prompt,
      ...(image_url && { image_url }),
      label_watermark: 1, // 修正：GLM官方 1=去水印，0=有水印
      size,
      quality,
      response_format
    };
    
    logger.info('发送视频生成请求:', { model, prompt, image_url });
    
    // 发送请求到GLM API
    const response = await axios.post(`${GLM_API_BASE}/videos/generations`, requestData, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
        'X-Request-ID': util.uuid(),
        'X-Timestamp': timestamp.toString(),
        'X-Sign': sign,
        'User-Agent': 'GLM-Free-API/1.0'
      },
      timeout: 300000 // 5分钟超时
    });
    
    // 处理响应
    if (response.data.error) {
      logger.error('GLM API返回错误:', response.data.error);
      throw new APIException(EX.API_REQUEST_FAILED, response.data.error.message || '视频生成失败');
    }
    
    // 返回标准格式的响应
    const result = {
      object: 'list',
      data: response.data.data?.map((item: any) => ({
        url: item.url,
        revised_prompt: item.revised_prompt || prompt
      })) || []
    };
    
    logger.info('视频生成成功:', { count: result.data.length });
    
    ctx.body = {
      code: 0,
      message: 'success',
      data: result
    };
    
  } catch (error) {
    logger.error('视频生成失败:', error);
    
    if (error instanceof APIException) {
      throw error;
    }
    
    if (error.response?.status === 401) {
      // Token过期，清除缓存
      tokenCache.delete(apikey);
      throw new APIException(EX.API_REQUEST_FAILED, '访问令牌已过期，请重试');
    }
    
    if (error.response?.status === 429) {
      throw new APIException(EX.API_REQUEST_FAILED, '请求过于频繁，请稍后重试');
    }
    
    if (error.code === 'ECONNABORTED') {
      throw new APIException(EX.API_REQUEST_FAILED, '视频生成超时，请稍后重试');
    }
    
    throw new APIException(EX.API_REQUEST_FAILED, '视频生成服务暂时不可用');
  }
}