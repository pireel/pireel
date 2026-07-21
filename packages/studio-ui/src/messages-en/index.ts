/**
 * studio-ui en 词典总装(key=源码中文原文)。分文件按源码文件维护,一个源文件
 * 一个词典文件,避免多人/多 agent 改同一文件冲突;新增源文件转换时在这里补一行。
 */
import workbench from './workbench';
import captionsPanel from './captions-panel';
import panels from './panels';
import chatGen from './chat-gen';
import presetElements from './preset-elements';
import misc from './misc';
import shell from './shell';

export const EN_UI: Record<string, string> = {
  ...shell,
  ...workbench,
  ...captionsPanel,
  ...panels,
  ...chatGen,
  ...presetElements,
  ...misc,
};
