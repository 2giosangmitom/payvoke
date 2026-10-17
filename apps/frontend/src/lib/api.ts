import { functional, type IConnection } from "api";

export const api = functional.v1;

export const connection: IConnection = {
  host: import.meta.env.VITE_API_HOST ?? "http://localhost:8000",
};
