// CSSTree exports these functions independently, but @types/css-tree only declares the barrel.
// Reuse those signatures without importing the runtime lexer or its Node-only data loaders.
declare module 'css-tree/parser' {
  const parse: typeof import('css-tree').parse;
  export default parse;
}
declare module 'css-tree/generator' {
  const generate: typeof import('css-tree').generate;
  export default generate;
}
declare module 'css-tree/walker' {
  const walk: typeof import('css-tree').walk;
  export default walk;
}
