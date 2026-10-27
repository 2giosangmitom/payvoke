"use client";

import { Send } from "lucide-react";
import { cn } from "@/src/lib/utils";
import type { ChatQuestion } from "@/src/lib/paid-chat";
import { SchemaForm } from "./schema-form";

// A provider question inside a paid run; answering stays within the hold.
export function QuestionForm({
  question,
  onSubmit,
  compact = false,
}: {
  question: ChatQuestion;
  onSubmit: (values: Record<string, unknown>) => Promise<void>;
  compact?: boolean;
}) {
  return (
    <div className="grid gap-3">
      <p className={cn("leading-relaxed whitespace-pre-wrap", compact && "text-sm")}>
        {question.prompt}
      </p>
      <SchemaForm
        schema={question.inputSchema}
        onSubmit={onSubmit}
        submitLabel="Send answer"
        submitIcon={<Send />}
        resetOnSubmit
        footer={
          <small className="font-mono text-[11px] text-faint">
            Answering doesn&apos;t cost anything extra.
          </small>
        }
      />
    </div>
  );
}
