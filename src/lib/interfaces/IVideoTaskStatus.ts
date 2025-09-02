// 视频任务状态接口定义

export interface VideoTaskStatus {
  chat_id: string;
  chat_type: string;
  sub_task_type: string;
  status: string;
  prompt: string;
  plan: string;
  msg: string;
  video_url: string;
  audio_url: string;
  audio_key: string;
  audio_id: string;
  audio_title: string;
  cover_url: string;
  source_url: string;
  source_id: string;
  last_frame_source_url: string;
  last_frame_source_id: string;
  source_width: number;
  source_height: number;
  resolution: string;
  video_duration: string;
  video_fps: string;
  video_resolution: string;
  finished_at: number;
  extra: any;
  cost: number;
  is_sensitive: number;
  safe_request_id: string;
  containing_audio_url: string;
}

export interface VideoTaskStatusResponse {
  status: number;
  message: string;
  result: VideoTaskStatus;
  rid: string;
}