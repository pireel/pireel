import { registerEditorCommandExtension } from "@pireel/studio-engine/editor-document/commands/extensions";
import {
  patchHandoffItem,
  setEditingSkills,
  setProjectBrand,
  setProjectSkill,
} from "./editor-document/commands/handoff";
for (const type of [
  "handoff.patch",
  "editingSkills.set",
  "brand.set",
  "skill.set",
])
  registerEditorCommandExtension(type, (document, command) => {
    switch (command.type) {
      case "handoff.patch":
        return patchHandoffItem(
          document,
          command.id,
          command.status,
          command.answer,
        );
      case "editingSkills.set":
        return setEditingSkills(document, command.ids);
      case "brand.set":
        return setProjectBrand(document, command.brand);
      case "skill.set":
        return setProjectSkill(document, command.skillId);
      default:
        throw new Error("Unexpected host command");
    }
  });
