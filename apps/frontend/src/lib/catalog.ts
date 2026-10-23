export type Product = {
  id: string;
  name: string;
  description: string;
  kind: string;
  status: string;
  availability: string;
  providerApp: { name: string } | null;
};
