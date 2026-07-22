/** en dictionary shard (key = the original source Chinese); see index.ts for ownership. */
const dict: Record<string, string> = {
  // use-export.ts
  '成片-{res}p-{stamp}.{format}': 'export-{res}p-{stamp}.{format}',
  '本地视频丢失，重新上传原片后再导出': 'The local source video is missing — re-upload it, then export again',
  '这个浏览器不支持本地导出，换 Chrome/Edge 打开再试': "This browser doesn't support local export — open in Chrome or Edge and try again",
  '先上传口播视频再导出': 'Upload a talking-head video first, then export',
  '已有导出在进行中': 'An export is already in progress',
  '内容没有改动，已下载上次的成片': 'Nothing has changed — downloaded the previous export again',
  '导出完成，已开始下载': 'Export complete — download started',
  '已取消导出': 'Export canceled',
  '导出被取消': 'The export was canceled',
  '导出失败，稍后重试': 'Export failed — try again in a moment',
  '导出失败': 'Export failed',
  '先上传口播视频': 'Upload a talking-head video first',
  '成片超过 200MB，发布上传装不下——降低分辨率或缩短时长再试': 'The export is over 200MB — too large to upload for publishing. Lower the resolution or shorten the video and try again',
  '上传成片中…': 'Uploading the export…',
  '已取消': 'Canceled',
  '发布准备失败，稍后重试': "Couldn't prepare the video for publishing — try again in a moment",
  // use-draft-pipeline.ts
  '提取口播稿…': 'Transcribing…',
  '分析口播稿…': 'Analyzing the transcript…',
  '规划没有产出场景,请再说一次「分析口播稿」重试': 'Planning produced no scenes — say "analyze the transcript" again to retry',
  '分析画面… 预计约 {sec}s': 'Analyzing visuals… about {sec}s',
  '画面语义/调色分析…': 'Analyzing visual semantics and color…',
  '分析画面 {pct}% · 约剩 {sec}s': 'Analyzing visuals {pct}% · ~{sec}s left',
  // use-draft-persist.ts
  '未命名项目': 'Untitled project',
  // geometry.ts
  '未运行': 'Not run yet',
  'MediaPipe({delegate}) 加载失败: {msg}': 'MediaPipe ({delegate}) failed to load: {msg}',
  '无视频轨,几何跳过': 'No video track — geometry skipped',
  '已分析 {n} 帧({delegate}) · 人 {subject}帧/占{occ}% · 脸 {face}帧': 'Analyzed {n} frames ({delegate}) · person in {subject} frames / {occ}% coverage · face in {face} frames',
  '几何遍异常: {msg}': 'Geometry pass error: {msg}',
  // client-export.ts
  '源缺视频轨': 'The source has no video track',
  'overlay doc 缺 #root 或预览运行时': 'Overlay document is missing #root or the preview runtime',
  '插入片段拉取失败': "Couldn't fetch the B-roll clip",
  // studio-boot.tsx
  '正在准备创作引擎…': 'Warming up the creative engine…',
  '进入工作台': 'Entering the workspace',
  '正在同步项目…': 'Syncing your project…',
  '正在进入工作台': 'Entering the workspace',
  // use-generation-lock.ts
  '这个组件正在生成中，先不能动它': "This element is still generating — it can't be edited yet",
  // media.ts
  'ASR 请求失败(HTTP {status})': 'Transcription request failed (HTTP {status}) — try again in a moment',
  '生成空间创建失败，稍后再试': 'Could not create the generation space — try again shortly',
};
export default dict;
