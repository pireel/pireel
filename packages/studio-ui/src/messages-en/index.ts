/**
 * studio-ui en dictionary assembly (key = the original source Chinese). Maintained split by source file,
 * one dictionary file per source file, to avoid conflicts when multiple people/agents edit the same file;
 * add a line here when converting a new source file.
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
