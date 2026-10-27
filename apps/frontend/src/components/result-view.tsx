import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./ui/table";

type Scalar = string | number | boolean | null;
const isScalar = (value: unknown): value is Scalar =>
  value === null || ["string", "number", "boolean"].includes(typeof value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);
const cell = (value: unknown) => (isScalar(value) ? String(value ?? "—") : JSON.stringify(value));

// Structured output rendered by shape: a flat object as a definition list, a
// list of flat objects as a table, anything else as formatted JSON.
export function ResultView({ output }: { output: unknown }) {
  if (isRecord(output) && Object.values(output).every(isScalar))
    return (
      <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[auto_minmax(0,1fr)]">
        {Object.entries(output).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="font-mono text-xs text-faint">{key}</dt>
            <dd className="text-sm leading-relaxed break-words whitespace-pre-wrap">
              {cell(value)}
            </dd>
          </div>
        ))}
      </dl>
    );
  const rows = isRecord(output)
    ? Object.values(output).find((value) => Array.isArray(value))
    : output;
  if (Array.isArray(rows) && rows.length && rows.every(isRecord)) {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    return (
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((column) => (
                <TableHead key={column} className="font-mono">
                  {column}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, index) => (
              <TableRow key={index}>
                {columns.map((column) => (
                  <TableCell key={column} className="max-w-80 break-words whitespace-normal">
                    {cell(row[column])}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    );
  }
  return (
    <pre className="max-h-120 overflow-auto font-mono text-xs leading-relaxed break-words whitespace-pre-wrap">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}
