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
    <ChatWidget label="App widget" aria-label="App widget">
      <Renderer response={source} library={openuiLibrary} />
    </ChatWidget>
  );
}
