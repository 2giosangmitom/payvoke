import { ConfigModule } from "@nestjs/config";
import typia, { tags } from "typia";

export interface Environment {
  DATABASE_URL: string;
  SUPABASE_URL?: string & tags.Format<"uri">;
  SUPABASE_PUBLISHABLE_KEY?: string;
  AUTH_ORIGIN: string & tags.Format<"uri">;
  PORT?: number & tags.Type<"uint32"> & tags.Minimum<1> & tags.Maximum<65535>;
}

// Shared by application bootstrap and migrations without importing any feature module.
export const appConfigModule = ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  validate(config) {
    return typia.assert<Environment>({
      DATABASE_URL: config.DATABASE_URL,
      SUPABASE_URL: config.SUPABASE_URL,
      SUPABASE_PUBLISHABLE_KEY: config.SUPABASE_PUBLISHABLE_KEY,
      AUTH_ORIGIN: config.AUTH_ORIGIN ?? "http://localhost:3000",
      PORT: config.PORT === undefined ? 8000 : Number(config.PORT),
    });
  },
});
