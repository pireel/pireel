/**
 * Studio composition —— 对外唯一入口(barrel)。
 *
 * 原 876 行单文件按职责四分,导入路径保持不变('@/lib/studio/composition'):
 *   composition-core  类型 + 分镜/时长几何 + 模板注册表 + 共享文本工具(无兄弟依赖)
 *   templates         内置模板渲染实现 + 注册(**import 副作用**,必须先于 assemble 消费执行,
 *                     本 barrel 的导入顺序即保证)
 *   assemble          assembleHtml / blockPreviewDoc(拼完整 Hyperframes 文档)
 *   block-factory     newBlock / mediaBlock / titleBlock … 块构造器
 *
 * 别绕过本入口直接 import 兄弟文件 —— 注册表就绪顺序由这里保证。
 */

export * from './caption-presets';
export * from './composition-core';
export * from './templates';
export * from './assemble';
export * from './block-factory';
