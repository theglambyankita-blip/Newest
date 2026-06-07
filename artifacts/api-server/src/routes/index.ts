import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emailRouter from "./email";
import stripeRouter from "./stripe";

const router: IRouter = Router();

router.use(healthRouter);
router.use(emailRouter);
router.use(stripeRouter);

export default router;
