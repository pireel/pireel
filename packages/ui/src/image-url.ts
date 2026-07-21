/**
 * 图片 URL 缩略 / 格式化 helper
 *
 * 单域名：原图与转图都在 cdn.pireel.com（R2 custom domain），转图走 Cloudflare
 * Image Transformations 内置 URL 格式：
 *   原图：cdn.pireel.com/<key>
 *   转图：cdn.pireel.com/cdn-cgi/image/width=W[,height=H,fit=cover],format=auto/<key>
 * 前置：zone 开启 Images → Transformations，且 allowed origins 放行 cdn.pireel.com。
 *
 * 前端展示走 imageThumb() 套尺寸预设；'original' 直读原图（不烧 transform 量）。
 *
 * 配置：VITE_IMG_SOURCE_BASE。未配 → 直返原输入（开发环境/未接入）。
 */

// 双端读取：process.env 里**有定义**（含空串）就以它为准（workerd nodejs_compat /
// vitest / scripts；vi.stubEnv(key,'') 即可模拟"未配置"），undefined 才落
// import.meta.env（浏览器，Vite 注入）。不能按 process 存在性二选一——TanStack
// Start dev 往浏览器注入只含 TSS_* 的 process 全局，那样 VITE_* 会被读成空。
function readEnv(viteKey: string): string {
  const fromProcess =
    typeof process !== 'undefined' && process.env ? process.env[viteKey] : undefined;
  if (fromProcess !== undefined) return fromProcess;
  return (
    (import.meta as unknown as { env?: Record<string, string> }).env?.[viteKey] || ''
  );
}
/** 展示 CDN（cdn.pireel.com）。服务端散读统一走这里——别再直读 env。 */
export function imgSourceBase(): string {
  return readEnv('VITE_IMG_SOURCE_BASE').replace(/\/$/, '');
}
const readSourceBase = imgSourceBase;

/** 我们自己的存储 / CDN host 白名单——其余 host 的 URL 不转码（外部参考图、provider
 *  临时 URL 等）。img.pireel.com 已退役，留在这里只为解析历史完整 URL 抠 key。 */
const OUR_HOSTS = new Set(['cdn.pireel.com', 'img.pireel.com']);

/**
 * 把输入归一成 s3 key：
 *   - 裸 key（不含 protocol）→ 直接当 key 返
 *   - data: / blob: → null（不能 transform）
 *   - 完整 URL：白名单内抠 path 当 key；外站返 null（不 transform）
 */
function extractKey(input: string): string | null {
  if (!input) return null;
  if (/^(data|blob):/.test(input)) return null;
  // 站内相对路径('/local-assets/…' 这类本地资产路由):是 URL 不是裸 key,原样透传——
  // 剥掉打头斜杠会让浏览器按当前页面路径解析,图直接 404(OSS 壳踩过)
  if (input.startsWith('/')) return null;
  if (!input.includes('://')) {
    // 裸 key（DB 新格式：'creations/u_x/cre_y-0.png'）
    return input.replace(/^\//, '');
  }
  try {
    const u = new URL(input);
    if (!OUR_HOSTS.has(u.hostname)) return null;
    // 已是转图 URL（/cdn-cgi/image/<opts>/<key>）→ 剥掉前缀取回裸 key，防二次转图
    return u.pathname.replace(/^\//, '').replace(/^cdn-cgi\/image\/[^/]+\//, '');
  } catch {
    return null;
  }
}

/** 尺寸铁律：预设宽高 ≥ 该类场景**最大渲染尺寸的 2 倍**（Retina 下才清晰）。
 *  渲染尺寸都在代码里写死，不需要运行时算——改了某处 DOM 尺寸记得回来对账。 */
export const IMAGE_PRESETS = {
  /** pill 内嵌小图标，最大渲染 28×28 → 2× = 56 */
  inline: { w: 56, h: 56 },
  /** 列表行/网格缩略，最大渲染 88×88（聊天图组），常见 36~64 → 2× ≈ 192 */
  thumb: { w: 192, h: 192 },
  /** 保比例缩略（不裁剪，studio 生成面板产物条带），高 112 渲染 16:9 时 ~200 宽 → 2× = 400 */
  strip: { w: 400, h: 0 },
  /** 卡片封面（项目/模板/素材/落地页），卡片可拉伸到 ~480 CSS px 宽 → 2× = 960 */
  list: { w: 960, h: 0 },
  /** pill hover 大图、lightbox 启动缩略，最大渲染 ~512 宽 → 2× = 1024 */
  preview: { w: 1024, h: 0 },
  /** 画布 image strip（高 320 容器宽自适应，16:9 时 ~570 宽）→ 2× ≈ 1280 */
  canvas: { w: 1280, h: 0 },
} as const;

export type ImagePreset = keyof typeof IMAGE_PRESETS | 'original';

/**
 * 拿一个语义尺寸的 transform URL。输入接受：
 *   - 裸 s3 key（DB 新格式，如 'creations/u_x/cre_y-0.png'）→ 拼 cdn host
 *   - 完整 URL 在 OUR_HOSTS 下（历史数据）→ 抠 key 后拼 cdn host
 *   - 外部 URL（参考图 / provider 临时链 / dataURL）→ 原样返不 transform
 *
 * 'original' 直读原图 URL，不走 transform（全尺寸场景没必要烧转图量）。
 * SOURCE_BASE 没配 → 直返裸 key（dev 兜底，浏览器自己处理）。
 */
export function imageThumb(
  url: string | undefined | null,
  preset: ImagePreset,
): string {
  if (!url) return '';
  const key = extractKey(url);
  // 不是我们的图（外部 URL）—— 跳过转码原样返
  if (!key) return url;

  const sourceBase = readSourceBase().replace(/\/$/, '');
  if (!sourceBase) return key;

  if (preset === 'original') return `${sourceBase}/${key}`;
  const cfg = IMAGE_PRESETS[preset];
  const opts = [
    `width=${cfg.w}`,
    ...(cfg.h > 0 ? [`height=${cfg.h}`, 'fit=cover'] : []),
    'format=auto',
  ].join(',');
  // Cloudflare Image Transformations 内置 URL 格式（同域名，无独立转图服务）
  return `${sourceBase}/cdn-cgi/image/${opts}/${key}`;
}
