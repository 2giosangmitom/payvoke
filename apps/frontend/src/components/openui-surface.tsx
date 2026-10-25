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
} from "@payvoke/openui-components";
import { QuestionForm } from "./question-form";
import type { ChatQuestion } from "@/src/lib/paid-chat";

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

const renderers: { [N in ComponentName]: ComponentRenderer<ComponentProps<N>> } = {
  Stack: ({ props, renderNode }) => (
    <div className="run-widget-stack" data-direction={props.direction ?? "vertical"}>
      {renderNode(props.children)}
    </div>
  ),
  Text: ({ props }) =>
    props.variant === "heading" ? (
      <h3 className="run-widget-text" data-variant="heading">
        {props.value}
      </h3>
    ) : (
      <p className="run-widget-text" data-variant={props.variant ?? "body"}>
        {props.value}
      </p>
    ),
  Card: ({ props, renderNode }) => (
    <section className="run-widget-card">
      <h3>{props.title}</h3>
      {props.description && <p>{props.description}</p>}
      {props.children && renderNode(props.children)}
    </section>
  ),
  Metric: ({ props }) => (
    <div className="run-widget-metric">
      <small>{props.label}</small>
      <strong>{label(props.value)}</strong>
      {props.unit && <span>{props.unit}</span>}
    </div>
  ),
  Table: ({ props }) => {
    const columns = props.columns
      .slice(0, 12)
      .map((column) => (typeof column === "string" ? { key: column, label: column } : column));
    return (
      <div className="run-widget-overflow">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {props.rows.slice(0, 100).map((row, index) => (
              <tr key={index}>
                {columns.map((column) => (
                  <td key={column.key}>
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
      <div className="run-widget-chart" role="img" aria-label={props.title || "Bar chart"}>
        {points.map((point, index) => (
          <div key={index}>
            <span>{point.label}</span>
            <i style={{ width: `${(Math.max(0, point.value) / max) * 100}%` }} />
            <strong>{point.value}</strong>
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
        <div className="run-widget-card">
          <h3>{title}</h3>
          <p>This question is no longer open.</p>
        </div>
      );
    return (
      <div className="run-widget-card">
        <h3>{title}</h3>
        {onAnswer ? (
          <QuestionForm
            question={question}
            compact
            onSubmit={(values) => onAnswer(question, values)}
          />
        ) : (
          <>
            <p>{question.prompt}</p>
            <small>Answering is unavailable in this view.</small>
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
    <section className="run-widget" aria-label="App widget">
      <header>
        APP WIDGET <span>OpenUI Lang</span>
      </header>
      <SurfaceContext.Provider value={context}>
        <Renderer response={source} library={openuiLibrary} />
      </SurfaceContext.Provider>
    </section>
  );
}
