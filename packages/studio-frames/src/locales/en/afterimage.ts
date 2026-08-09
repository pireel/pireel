import type { FrameLocalePack } from '../types';

export const pack: FrameLocalePack = {
  title: 'Afterimage',
  summary:
    'Temporal slices, motion traces, exposure bands, and color memory reveal what changed inside real footage—an optical language, not a neon interface or glitch filter.',
  copy: {
    // Cover: Latin needs a smaller vertical measure than the two-character Chinese title.
    'class="title head" data-edit>余像':
      'class="title head" style="font-size:140px" data-edit>AFTERIMAGE',
    时间还在画面里: 'TIME LINGERS IN THE FRAME',
    // Motion memory.
    动作留下: 'MOTION LEAVES',
    方向: 'A DIRECTION',
    '只保留三个真实位置：进入、接触、结果。':
      'Keep three real positions: entry, contact, result.',
    // Shutter slice: lower the long English line while preserving the same spatial gesture.
    'data-edit>穿过这一刻':
      'style="font-size:80px" data-edit>MOVE THROUGH THIS MOMENT',
    // Temporal stack.
    三段时间: 'THREE MOMENTS',
    一个结果: 'ONE RESULT',
    '层叠用来比较状态，不是摆三张卡。':
      'Stack states to compare them—not to arrange three cards.',
    // Focus transfer.
    判断不动: 'HOLD THE CLAIM',
    焦点移动: 'MOVE THE FOCUS',
    '从说话的人，移向能验证这句话的物体。':
      'Move from the speaker to the object that verifies the claim.',
    // Chroma echo.
    颜色记住: 'COLOR REMEMBERS',
    离开的方向: 'WHERE IT LEFT',
    '珊瑚属于上一刻，青色属于即将抵达的位置。':
      'Coral marks the departing state; cyan marks the arriving one.',
    // Clean return: the English statement needs a smaller shared measure in the left column.
    'data-edit>现在，': 'style="font-size:68px" data-edit>NOW,',
    只看真实画面: 'SEE ONLY THE SOURCE',
    '所有残影都已对齐，给结论留下完整的一帧。':
      'Every trace has aligned. Leave one complete frame for the conclusion.',
  },
};
