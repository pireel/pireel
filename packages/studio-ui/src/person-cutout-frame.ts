/** Shared by native video layers, export and PiP demos. Consumes the input bitmap. Frames of one playing
 *  or exporting layer pass a `stream` so the matte stays steady from frame to frame. */
export async function personCutoutFrame(frame: ImageBitmap, stream?: import('./person-matte').MatteStream): Promise<ImageBitmap> {
  let mask: ImageBitmap | null = null;
  try {
    const { segmentPersonMask } = await import('./geometry');
    // The existing segmenter owns/closes its argument; keep the color frame for compositing.
    mask = await segmentPersonMask(await createImageBitmap(frame), stream);
    if (!mask) throw new Error('人像抠图暂不可用，请重试或选择人物小窗。');
    const canvas = new OffscreenCanvas(frame.width, frame.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('无法创建人像抠图画布。');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(frame, 0, 0);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(mask, 0, 0, frame.width, frame.height);
    return canvas.transferToImageBitmap();
  } finally { mask?.close(); frame.close(); }
}
