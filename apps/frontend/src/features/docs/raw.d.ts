// Vite's `?raw` imports: a guide's Markdown as a string.
declare module "*.md?raw" {
  const content: string;
  export default content;
}
