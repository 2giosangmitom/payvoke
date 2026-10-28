import React, { createContext, useContext, useMemo } from "react";
import {
  createLibrary,
  createParser,
  defineComponent,
  Renderer,
  type ComponentRenderer,
  type ElementNode,
} from "@openuidev/react-lang";
import {
  OPENUI_ROOT,
  componentList,
  type ComponentName,
  type ComponentProps,
} from "@payvoke/shared/openui";
import { ChatWidget } from "@/src/features/chat/chat-widget";
import { QuestionForm } from "@/src/features/chat/question-form";
import { cn } from "@/src/lib/utils";
import type { ChatQuestion } from "@/src/features/chat/api";

// OpenUI Lang is host-rendered declarative data. Every component below is a
// fixed host renderer for the shared catalog; provider text is only ever React
// text content, and the catalog has no action, URL or tool props to wire up.
type SurfaceContextValue = {
  questions: ChatQuestion[];
  invocationId?: string;
  onAnswer?: (question: ChatQuestion, values: Record<string, unknown>) => Promise<void>;
};
const SurfaceContext = createContext<SurfaceContextValue>({ questions: [] });

const label = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";

const widgetCard = "border border-border p-4";
const widgetTitle = "mb-2.5 font-semibold";

const renderers: { [N in ComponentName]: ComponentRenderer<ComponentProps<N>> } = {
  Stack: ({ props, renderNode }) => (
    <div
      className={cn(
        "grid min-w-0 gap-3",
        props.direction === "horizontal" && "flex flex-wrap *:min-w-0 *:flex-[1_1_11rem]",
      )}
    >
      {renderNode(props.children)}
    </div>
  ),
  Text: ({ props }) =>
    props.variant === "heading" ? (
      <h3 className="leading-relaxed font-semibold whitespace-pre-wrap">{props.value}</h3>
    ) : (
      <p
        className={cn(
          "leading-relaxed whitespace-pre-wrap",
          props.variant === "caption" && "text-xs text-faint",
        )}
      >
        {props.value}
      </p>
    ),
  Card: ({ props, renderNode }) => (
    <section className={widgetCard}>
      <h3 className={widgetTitle}>{props.title}</h3>
      {props.description && (
        <p className="leading-relaxed whitespace-pre-wrap text-muted-foreground">
          {props.description}
        </p>
      )}
      {props.children && <div className="mt-3">{renderNode(props.children)}</div>}
    </section>
  ),
  Metric: ({ props }) => (
    <div className="flex items-baseline gap-2.5">
      <small className="text-faint">{props.label}</small>
      <strong className="font-mono text-3xl font-semibold">{label(props.value)}</strong>
      {props.unit && <span className="text-faint">{props.unit}</span>}
    </div>
  ),
  Table: ({ props }) => {
    const columns = props.columns
      .slice(0, 12)
      .map((column) => (typeof column === "string" ? { key: column, label: column } : column));
    const cell = "border border-border p-2.5 text-left";
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse text-xs">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={cn(cell, "font-mono font-medium text-faint")}>
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.slice(0, 100).map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key} className={cell}>
                    {label(Object.hasOwn(row, column.key) ? row[column.key] : undefined)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  },
  Chart: ({ props }) => {
    const points = props.points.slice(0, 20);
    const max = Math.max(1, ...points.map((point) => Math.max(0, point.value)));
    return (
      <div className="grid gap-2" role="img" aria-label={props.title || "Bar chart"}>
        {points.map((point, index) => (
          <div
            key={index}
            className="grid grid-cols-[6.25rem_minmax(0,1fr)_3.5rem] items-center gap-2.5 font-mono text-xs"
          >
            <span className="truncate">{point.label}</span>
            <i
              className="block h-3 bg-primary transition-[width] duration-500"
              style={{ width: `${(Math.max(0, point.value) / max) * 100}%` }}
            />
            <strong className="text-right font-medium">{point.value}</strong>
          </div>
        ))}
      </div>
    );
  },
  QuestionForm: ({ props }) => {
    const { questions, invocationId, onAnswer } = useContext(SurfaceContext);
    const title = props.title || "Provider question";
    const question = questions.find(
      (item) =>
        item.questionId === props.questionId &&
        item.status === "OPEN" &&
        (!invocationId || item.invocationId === invocationId),
    );
    if (!question)
      return (
        <div className={widgetCard}>
          <h3 className={widgetTitle}>{title}</h3>
          <p className="text-muted-foreground">This question is no longer open.</p>
        </div>
      );
    return (
      <div className={widgetCard}>
        <h3 className={widgetTitle}>{title}</h3>
        {onAnswer ? (
          <QuestionForm
            question={question}
            compact
            onSubmit={(values) => onAnswer(question, values)}
          />
        ) : (
          <>
            <p className="leading-relaxed">{question.prompt}</p>
            <small className="text-faint">You can't answer from this view.</small>
          </>
        )}
      </div>
    );
  },
};

export const openuiLibrary = createLibrary({
  root: OPENUI_ROOT,
  components: componentList.map((spec) =>
    defineComponent({ ...spec, component: renderers[spec.name] as ComponentRenderer<any> }),
  ),
});
const parser = createParser(openuiLibrary.toJSONSchema(), OPENUI_ROOT);

// Question IDs placed inline by a surface, so the chat does not render the
// same open question a second time as a standalone form.
export function surfaceQuestionIds(source: string): string[] {
  const ids: string[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > 20 || !value || typeof value !== "object") return;
    if (Array.isArray(value)) return value.forEach((item) => visit(item, depth + 1));
    const node = value as ElementNode;
    if (node.type !== "element") return;
    if (node.typeName === "QuestionForm" && typeof node.props.questionId === "string")
      ids.push(node.props.questionId);
    for (const prop of Object.values(node.props)) visit(prop, depth + 1);
  };
  try {
    visit(parser.parse(source).root, 0);
  } catch {
    /* an unparsable surface places no questions */
  }
  return ids;
}

export function OpenUISurface({
  source,
  questions = [],
  invocationId,
  onAnswer,
}: {
  source: string;
  questions?: ChatQuestion[];
  invocationId?: string;
  onAnswer?: (question: ChatQuestion, values: Record<string, unknown>) => Promise<void>;
}) {
  const context = useMemo(
    () => ({ questions, invocationId, onAnswer }),
    [questions, invocationId, onAnswer],
  );
  if (typeof source !== "string" || !source.trim()) return null;
  return (
    <ChatWidget label="App widget" meta="OpenUI Lang" aria-label="App widget">
      <SurfaceContext.Provider value={context}>
        <Renderer response={source} library={openuiLibrary} />
      </SurfaceContext.Provider>
    </ChatWidget>
  );
}
