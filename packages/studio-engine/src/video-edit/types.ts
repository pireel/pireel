/**
 * 视频剪辑(video-edit)模块共享类型。
 *
 * 范围:浏览器端视频处理基础设施——画像 / 抽音频 / 场景检测 / 缩略图 / 渲染。
 * 不含业务编排(LLM timeline / 入库等),那些走上层组件。
 */

export type ClipMeta = {
  width: number;
  height: number;
  duration: number;
  hasAudio: boolean;
  videoCodec: string | null;
  audioCodec: string | null;
};

export type SceneCut = {
  /** 切点处的时间戳(秒) */
  timestamp: number;
  /** HSV 差异分数,用于调阈值 */
  score: number;
};

export type SceneSegment = {
  start: number;
  end: number;
};

export type Thumbnail = {
  /** 抽帧时间戳(秒) */
  timestamp: number;
  /** Object URL 指向 Blob,记得 revoke */
  url: string;
  /** Blob 本体,需要上传时用 */
  blob: Blob;
};
