import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Redirect old /r?b=TOKEN links → /api/review?token=TOKEN
app.get("/r", (req, res) => {
  const b = req.query.b as string;
  if (b) {
    res.redirect(302, `/api/review?token=${encodeURIComponent(b)}`);
  } else {
    res.redirect(302, "/");
  }
});

// Redirect /p?b=TOKEN → serve via frontend (already handled there)
app.get("/p", (req, res) => {
  res.redirect(302, `/?page=booking&b=${req.query.b || ""}`);
});

app.use("/api", router);

export default app;
