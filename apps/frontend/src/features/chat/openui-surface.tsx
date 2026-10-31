// Must run before @openuidev/react-lang is evaluated (see the module).
import "@/src/features/chat/openui-devtools-off";
import {
  createLibrary,
  defineComponent,
  Renderer,
  type ComponentRenderer,
} from "@openuidev/react-lang";
import {
  OPENUI_ROOT,
  componentList,
  type ComponentName,
  type ComponentProps,
} from "@payvoke/shared/openui";
import { ChatWidget } from "@/src/features/chat/chat-widget";
import { cn } from "@/src/lib/utils";

// OpenUI Lang is host-rendered declarative data. Every component below is a
// fixed host renderer for the shared catalog; provider text is only ever React
// text content, and the catalog has no action, URL or tool props to wire up.
// Interaction is the built-in tools' job, never a surface's.
const label = (value: unknown) =>
  typeof value === "string" || typeof value === "number" || typeof value === "boolean"
    ? String(value)
    : "";

const isNumber = (value: unknown) => typeof value === "number" && Number.isFinite(value);

const renderers: { [N in ComponentName]: ComponentRenderer<ComponentProps<N>> } = {
  Stack: ({ props, renderNode }) => (
    <div
      className={cn(
        "grid min-w-0 gap-4",
        props.direction === "horizontal" &&
          "grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-px border border-border bg-border",
      )}
    >
      {renderNode(props.children)}
    </div>
  ),
  Text: ({ props }) =>
    props.variant === "heading" ? (
      <h3 className="text-base font-semibold tracking-[-0.01em] break-words">{props.value}</h3>
    ) : (
      <p
        className={cn(
          "leading-relaxed break-words whitespace-pre-wrap",
          props.variant === "caption" ? "-mt-3 text-xs text-muted-foreground" : "text-sm",
        )}
      >
        {props.value}
      </p>
    ),
  Card: ({ props, renderNode }) => (
    <section className="grid min-w-0 gap-3">
      <header className="grid gap-0.5">
        <h3 className="text-sm font-medium">{props.title}</h3>
        {props.description && (
          <p className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground">
            {props.description}
          </p>
        )}
      </header>
      {props.children && renderNode(props.children)}
    </section>
  ),
  // A figure cell: inside a horizontal stack the cells share hairlines.
  Metric: ({ props }) => (
    <div className="grid min-w-0 gap-1 bg-card px-3.5 py-3">
      <span className="truncate text-xs text-muted-foreground">{props.label}</span>
      <span className="flex items-baseline gap-1.5">
        <strong className="font-mono text-2xl font-semibold tracking-tight tabular-nums">
          {label(props.value)}
        </strong>
        {props.unit && <span className="text-xs text-muted-foreground">{props.unit}</span>}
      </span>
    </div>
  ),
  Table: ({ props }) => {
    const columns = props.columns
      .slice(0, 12)
      .map((column) => (typeof column === "string" ? { key: column, label: column } : column));
    const rows = props.rows.slice(0, 100);
    // A column of numbers reads right-aligned, so the digits line up.
    const numeric = new Set(
      columns
        .filter((column) =>
          rows.every((row) => {
            const value = Object.hasOwn(row, column.key) ? row[column.key] : null;
            return value === null || value === undefined || isNumber(value);
          }),
        )
        .map((column) => column.key),
    );
    return (
      <div className="max-w-full overflow-x-auto border border-border">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/60">
            <tr>
              {columns.map((column) => (
                <th
                  key={column.key}
                  scope="col"
                  className={cn(
                    "border-b border-border px-3 py-2 font-medium whitespace-nowrap text-muted-foreground",
                    numeric.has(column.key) ? "text-right" : "text-left",
                  )}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index} className="border-b border-border last:border-b-0">
                {columns.map((column) => {
                  const value = Object.hasOwn(row, column.key) ? row[column.key] : undefined;
                  return (
                    <td
                      key={column.key}
                      className={cn(
                        "px-3 py-2 align-top",
                        numeric.has(column.key)
                          ? "text-right font-mono tabular-nums whitespace-nowrap"
                          : "min-w-[8rem] break-words",
                      )}
                    >
                      {label(value)}
                    </td>
                  );
                })}
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
      <figure className="grid min-w-0 gap-3">
        {props.title && <figcaption className="text-sm font-medium">{props.title}</figcaption>}
        <div className="grid gap-1.5" role="img" aria-label={props.title || "Bar chart"}>
          {points.map((point, index) => (
            <div
              key={index}
              className="grid grid-cols-[minmax(3rem,7rem)_minmax(0,1fr)_auto] items-center gap-3 text-xs"
            >
              <span className="truncate text-muted-foreground">{point.label}</span>
              <span className="h-2.5 bg-muted">
                <i
                  className="block h-full bg-primary"
                  style={{ width: `${(Math.max(0, point.value) / max) * 100}%` }}
                />
              </span>
              <strong className="text-right font-mono font-medium tabular-nums">
                {point.value}
              </strong>
            </div>
          ))}
        </div>
      </figure>
    );
  },
};

export const openuiLibrary = createLibrary({
  root: OPENUI_ROOT,
  components: componentList.map((spec) =>
    defineComponent({ ...spec, component: renderers[spec.name] as ComponentRenderer<any> }),
  ),
});
export function OpenUISurface({ source }: { source: string }) {
  if (typeof source !== "string" || !source.trim()) return null;
  return (
    <ChatWidget label="Live view from the agent" aria-label="Live view from the agent">
      <Renderer response={source} library={openuiLibrary} />
    </ChatWidget>
  );
}
