import React, { type ReactNode } from "react";
import { QuestionForm } from "./question-form";
import type { ChatQuestion } from "@/src/lib/paid-chat";

type Dict = Record<string, unknown>;
const CATALOG = "https://payvoke.dev/a2ui/catalog/v1";
const record = (value: unknown): value is Dict =>
  !!value && typeof value === "object" && !Array.isArray(value);
const safeKey = (value: string) =>
  /^[\w-]{1,80}$/.test(value) && !["__proto__", "prototype", "constructor"].includes(value);

// A2UI is host-rendered declarative data. This catalog never executes provider code,
// loads provider URLs, or turns provider-supplied component names into dynamic imports.
function valueAt(data: Dict, raw: unknown): unknown {
  if (record(raw) && typeof raw.path === "string") {
    const keys = raw.path.startsWith("/") ? raw.path.slice(1).split("/") : [];
    return keys.length && keys.every(safeKey)
      ? keys.reduce<unknown>((item, key) => (record(item) ? item[key] : undefined), data)
      : undefined;
  }
  return raw;
}
function label(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value);
  return "";
}

export function A2uiSurface({
  operations,
  questions = [],
  invocationId,
  onAnswer,
}: {
  operations: unknown[];
  questions?: ChatQuestion[];
  invocationId?: string;
  onAnswer?: (question: ChatQuestion, values: Record<string, unknown>) => Promise<void>;
}) {
  if (!Array.isArray(operations) || operations.length > 100) return null;
  let created = false;
  let deleted = false;
  let components: Dict[] = [];
  const data: Dict = Object.create(null) as Dict;
  for (const operation of operations) {
    if (!record(operation) || operation.version !== "v0.9.1") return null;
    if (record(operation.createSurface) && operation.createSurface.catalogId === CATALOG) {
      created = true;
      deleted = false;
    }
    if (record(operation.deleteSurface)) deleted = true;
    if (
      record(operation.updateComponents) &&
      Array.isArray(operation.updateComponents.components)
    ) {
      components = operation.updateComponents.components.filter(record).slice(0, 50);
    }
    if (record(operation.updateDataModel) && typeof operation.updateDataModel.path === "string") {
      const path = operation.updateDataModel.path.startsWith("/")
        ? operation.updateDataModel.path.slice(1).split("/")
        : [];
      if (!path.length || !path.every(safeKey)) return null;
      let cursor = data;
      for (const segment of path.slice(0, -1)) {
        if (!record(cursor[segment])) cursor[segment] = Object.create(null) as Dict;
        cursor = cursor[segment] as Dict;
      }
      cursor[path.at(-1)!] = operation.updateDataModel.value;
    }
  }
  if (!created || deleted) return null;

  const byId = new Map<string, Dict>();
  for (const component of components) {
    const id = label(component.id);
    if (id) byId.set(id, component);
  }
  const referenced = new Set<string>();
  for (const component of components) {
    if (typeof component.child === "string") referenced.add(component.child);
    if (Array.isArray(component.children))
      for (const child of component.children) if (typeof child === "string") referenced.add(child);
  }
  // Components that are not referenced by a parent are the render roots. If a
  // provider emits only children, fall back to document order instead of hiding
  // the whole surface.
  const roots = components.filter((component) => !referenced.has(label(component.id)));
  const renderList = roots.length ? roots : components;

  function render(component: Dict, depth: number, key: string): ReactNode {
    if (depth > 10) return null;
    const get = (name: string) => label(valueAt(data, component[name]));
    const childRefs = [
      ...(typeof component.child === "string" ? [component.child] : []),
      ...(Array.isArray(component.children) ? component.children : []),
    ];
    const children = childRefs.map((child, index) => {
      if (typeof child === "string") {
        const target = byId.get(child);
        return target ? render(target, depth + 1, `${key}-${index}`) : null;
      }
      return record(child) ? render(child, depth + 1, `${key}-${index}`) : null;
    });
    switch (component.component) {
      case "Text":
        return (
          <p className="run-widget-text" key={key}>
            {get("text") || get("value") || get("label")}
            {children}
          </p>
        );
      case "Metric":
        return (
          <div className="run-widget-metric" key={key}>
            <small>{get("label") || get("title")}</small>
            <strong>{get("value")}</strong>
            <span>{get("unit")}</span>
            {children}
          </div>
        );
      case "Card":
        return (
          <section className="run-widget-card" key={key}>
            <h3>{get("title")}</h3>
            <p>{get("description") || get("text")}</p>
            {children}
          </section>
        );
      case "Table": {
        const rows = valueAt(data, component.rows);
        const rawColumns = valueAt(data, component.columns);
        if (!Array.isArray(rows) || !Array.isArray(rawColumns))
          return <p key={key}>Table data pending…</p>;
        const columns = rawColumns.slice(0, 12).flatMap((column) => {
          if (typeof column === "string") return [{ key: column, label: column }];
          if (record(column) && typeof column.key === "string")
            return [{ key: column.key, label: label(column.label) || column.key }];
          return [];
        });
        return (
          <div className="run-widget-overflow" key={key}>
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key}>{column.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 100).map((row, index) => (
                  <tr key={index}>
                    {columns.map((column) => (
                      <td key={column.key}>{label(record(row) ? row[column.key] : undefined)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {children}
          </div>
        );
      }
      case "Chart": {
        const points = valueAt(data, component.points);
        if (!Array.isArray(points)) return <p key={key}>Chart data pending…</p>;
        const entries = points
          .slice(0, 20)
          .filter((point) => record(point) && typeof point.value === "number") as {
          label?: string;
          value: number;
        }[];
        const max = Math.max(1, ...entries.map((point) => Math.max(0, point.value)));
        return (
          <div
            className="run-widget-chart"
            key={key}
            role="img"
            aria-label={get("title") || "Bar chart"}
          >
            {entries.map((point, index) => (
              <div key={index}>
                <span>{label(point.label)}</span>
                <i style={{ width: `${(Math.max(0, point.value) / max) * 100}%` }} />
                <strong>{point.value}</strong>
              </div>
            ))}
            {children}
          </div>
        );
      }
      case "QuestionForm": {
        const questionId = get("questionId");
        const question = questions.find(
          (item) =>
            item.questionId === questionId &&
            item.status === "OPEN" &&
            (!invocationId || item.invocationId === invocationId),
        );
        if (!question)
          return (
            <div className="run-widget-card" key={key}>
              <h3>{get("title") || "Provider question"}</h3>
              <p>{get("question") || get("description") || "This question is no longer open."}</p>
            </div>
          );
        if (!onAnswer)
          return (
            <div className="run-widget-card" key={key}>
              <h3>{get("title") || "Provider question"}</h3>
              <p>{question.prompt}</p>
              <small>Answering is unavailable in this view.</small>
            </div>
          );
        return (
          <div className="run-widget-card" key={key}>
            <h3>{get("title") || "Provider question"}</h3>
            <QuestionForm
              question={question}
              compact
              onSubmit={(values) => onAnswer(question, values)}
            />
          </div>
        );
      }
      default:
        return null;
    }
  }

  return (
    <section className="run-widget" aria-label="App widget">
      <header>
        APP WIDGET <span>A2UI v0.9.1</span>
      </header>
      {renderList.map((component, index) =>
        render(component, 0, label(component.id) || `root-${index}`),
      )}
    </section>
  );
}
