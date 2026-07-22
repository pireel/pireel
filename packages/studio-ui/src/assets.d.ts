/** Panel static assets (Vite turns these into URLs; used by the transition preview's two real photos). */
declare module '*.jpg' {
  const src: string;
  export default src;
}
