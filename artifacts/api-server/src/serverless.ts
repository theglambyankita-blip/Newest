import app from "./app";
import { initAdminToken } from "./routes/admin";

initAdminToken().catch((e) => console.error("initAdminToken failed:", e));

export default app;
