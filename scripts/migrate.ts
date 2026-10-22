import "dotenv/config";
import { runMigrations } from "../src/db/migrate";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
runMigrations(url)
  .then(() => {
    console.log("Migrations applied.");
  })
  .catch((err) => {
    console.error("Migration failed:", err);
    process.exit(1);
  });
