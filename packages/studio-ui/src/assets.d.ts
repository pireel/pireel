/** 面板静态资产(Vite 处理成 URL;转场预览的两张真实照片用)。 */
declare module '*.jpg' {
  const src: string;
  export default src;
}
