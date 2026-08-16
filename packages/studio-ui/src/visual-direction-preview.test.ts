import { describe, expect, it } from "vitest";
import {
  visualDirectionKind,
  visualDirectionMotionBlock,
  type MotionGraphicPreviewCopy,
} from "./visual-direction-preview";

const copy: MotionGraphicPreviewCopy = {
  words: "One clear idea",
  wordsSupport: "Motion supports meaning",
  numberLabel: "Completion",
  numberNote: "Verified result",
  dataTitle: "Performance",
  dataHook: "Hook",
  dataProof: "Proof",
  dataAction: "Action",
  overlayName: "Lin",
  overlayRole: "Director",
  brandLine: "Edit by intent",
  sourceHeadline: "The source remains visible",
  sourceFocus: "One truthful detail",
  before: "Current",
  after: "Improved",
  stageOne: "Ingest",
  stageTwo: "Direct",
  stageThree: "Deliver",
  documentTitle: "Evidence becomes a conclusion",
  interfaceTitle: "Editing workspace",
  mapStart: "Start",
  mapEnd: "Goal",
};

describe("visual direction previews", () => {
  it("maps every discoverable direction to a distinct structural grammar", () => {
    expect(
      [
        "editorial-quiet",
        "memphis-motion",
        "precision-tech",
        "paper-collage",
        "neo-brutalist",
        "soft-organic",
      ].map(visualDirectionKind),
    ).toEqual([
      "editorial",
      "memphis",
      "tech",
      "collage",
      "brutalist",
      "organic",
    ]);
  });

  it("renders all Motion Graphic categories through real direction-specific custom blocks", () => {
    for (const kind of [
      "words",
      "number",
      "comparison",
      "data",
      "line",
      "donut",
      "funnel",
      "steps",
      "timeline",
      "flow",
      "cycle",
      "document",
      "overlay",
      "source",
      "phone",
      "browser",
      "map",
      "brand",
    ] as const) {
      const memphis = visualDirectionMotionBlock(
        "memphis-motion",
        kind,
        { x: 0, y: 0, w: 1, h: 1 },
        copy,
      );
      const tech = visualDirectionMotionBlock(
        "precision-tech",
        kind,
        { x: 0, y: 0, w: 1, h: 1 },
        copy,
      );
      expect(memphis.templateId).toBe("custom");
      expect(tech.templateId).toBe("custom");
      expect(String(memphis.slots?.innerHtml)).toContain(`vd-${kind}`);
      expect(String(memphis.slots?.innerHtml)).toContain("text-shadow");
      expect(String(tech.slots?.innerHtml)).toContain(
        "background-size:36px 36px",
      );
      expect(memphis.slots?.innerHtml).not.toBe(tech.slots?.innerHtml);
    }
  });

  it("keeps source-capture surfaces separate from their outer scene classes", () => {
    const render = (kind: "phone" | "browser" | "map") =>
      String(
        visualDirectionMotionBlock(
          "editorial-quiet",
          kind,
          { x: 0, y: 0, w: 1, h: 1 },
          copy,
        ).slots?.innerHtml,
      );

    expect(render("phone")).toContain("vd-phone-frame");
    expect(render("browser")).toContain("vd-browser-capture");
    expect(render("map")).toContain("vd-map-canvas");
  });
});
