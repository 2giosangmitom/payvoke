# @payvoke/openui-components

Shared OpenUI component library for Payvoke marketplace.

## Overview

This package defines the **allowed OpenUI components** that providers can use to generate UIs. It's used by:

- **Backend**: System prompt generation, validation, and security checks
- **Frontend**: React component rendering
- **Providers**: OpenUI Lang generation guidance

## Components

| Component      | Description                               | Example                                       |
| -------------- | ----------------------------------------- | --------------------------------------------- |
| `Stack`        | Container with vertical/horizontal layout | `root = Stack([a, b], "vertical", 4)`         |
| `Text`         | Text display with variants                | `header = Text("Results", "heading")`         |
| `Card`         | Bordered container with title             | `card = Card("Title", "Content", [children])` |
| `Metric`       | Labeled numeric value                     | `revenue = Metric("Revenue", 1200000, "USD")` |
| `Table`        | Tabular data display                      | `table = Table([cols], [rows])`               |
| `Chart`        | Visual chart (line/bar/pie)               | `chart = Chart("line", data)`                 |
| `Button`       | Interactive button                        | `btn = Button("Export", "export", "primary")` |
| `Form`         | Generic input form                        | `form = Form("id", schema, "Submit")`         |
| `QuestionForm` | Provider → buyer question                 | `q = QuestionForm("q1", schema, "Prompt")`    |

## Usage

### Backend (System Prompt)

```typescript
import { getLibrarySpec } from "@payvoke/openui-components";
import { generateSystemPrompt } from "@openuidev/lang-core";

const spec = getLibrarySpec();
const systemPrompt = generateSystemPrompt({ library: spec });
```

### Backend (Validation)

```typescript
import { isAllowedComponent, getLibrarySchema } from "@payvoke/openui-components";
import { createParser } from "@openuidev/lang-core";

// Check if component is in allowlist
if (!isAllowedComponent("HackerComponent")) {
  throw new Error("Unknown component");
}

// Parse with schema validation
const parser = createParser(getLibrarySchema(), "Stack");
const result = parser.parse(openUILangText);
```

### Frontend (React)

```typescript
import { ALLOWED_COMPONENTS } from "@payvoke/openui-components";

// Map OpenUI component names to React components
const componentMap = {
  Stack: StackComponent,
  Text: TextComponent,
  // ... etc
};

function render(componentName: string) {
  if (!ALLOWED_COMPONENTS.includes(componentName)) {
    return null; // Unknown component
  }
  const Component = componentMap[componentName];
  return <Component {...props} />;
}
```

### Provider (OpenUI Lang Generation)

Providers receive the system prompt with component signatures and should follow the positional argument syntax:

```
root = Stack([header, content], "vertical", 4)
header = Text("Analysis Complete", "heading")
content = Metric("Revenue", 1200000, "USD")
```

**Key points:**

- Arguments are **positional** (order matters)
- Use double quotes for strings
- Children use array syntax: `[a, b, c]`
- Optional arguments can be omitted from the end

## Security

**Component allowlist**: Only the 9 components defined in this package are allowed. Unknown components are rejected at parse time.

**XSS prevention**: String values in OpenUI Lang are not sanitized by the parser. The **frontend renderer** must escape all string props before rendering to prevent XSS.

**Action validation**: `Button.action` and form submissions must be validated by the backend before execution. The frontend cannot execute arbitrary actions.

## Building

```bash
pnpm --filter @payvoke/openui-components build
```

This generates:

- `dist/index.js` - Main library export
- `dist/spec.json` - Library spec for static import
- `dist/schema.json` - JSON Schema for parser initialization

## Development

```bash
pnpm --filter @payvoke/openui-components dev
```

Watches TypeScript files and recompiles on changes.
