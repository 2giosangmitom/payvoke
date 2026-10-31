import { z } from "zod";

// The documented built-in tools; builtin.ts parses and bounds them.
const flatSchema = z.record(z.string(), z.unknown()).meta({
  description:
    "Flat JSON Schema (2020-12) object: scalar, enum and file fields (`format: file`, or an array of them).",
});

export const askForm = z
  .object({
    name: z.literal("ask_form"),
    args: z.object({
      title: z.string().min(1).max(120),
      description: z.string().max(1000).optional(),
      schema: flatSchema,
      submitLabel: z.string().max(40).optional(),
    }),
  })
  .meta({ id: "AskFormTool", description: "A one-shot form. The result is the form's values." });

export const askChoice = z
  .object({
    name: z.literal("ask_choice"),
    args: z.object({
      prompt: z.string().min(1).max(500),
      options: z
        .array(
          z.object({
            id: z.string().regex(/^[\w-]{1,64}$/),
            label: z.string().min(1).max(120),
            description: z.string().max(300).optional(),
          }),
        )
        .min(2)
        .max(12),
      multiple: z.boolean().optional(),
      minSelections: z.number().int().min(1).optional(),
      maxSelections: z.number().int().min(1).optional(),
    }),
  })
  .meta({
    id: "AskChoiceTool",
    description: "Pick from options. The result is `{ selected: [id] }`.",
  });

export const confirmTool = z
  .object({
    name: z.literal("confirm"),
    args: z.object({
      title: z.string().min(1).max(160),
      description: z.string().max(1000).optional(),
      details: z
        .array(z.object({ label: z.string().min(1).max(60), value: z.string().min(1).max(200) }))
        .max(8)
        .optional(),
      confirmLabel: z.string().max(40).optional(),
      cancelLabel: z.string().max(40).optional(),
      variant: z.enum(["default", "destructive"]).optional(),
    }),
  })
  .meta({ id: "ConfirmTool", description: "Yes or no. The result is `{ approved: boolean }`." });

export const toolCall = z.discriminatedUnion("name", [askForm, askChoice, confirmTool]).meta({
  id: "ToolCall",
  description:
    "A built-in Payvoke component opened in the buyer's chat. It waits for exactly one buyer result.",
});
