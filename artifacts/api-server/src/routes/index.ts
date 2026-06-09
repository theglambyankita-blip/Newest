import { Router, type IRouter } from "express";
import healthRouter from "./health";
import emailRouter from "./email";
import stripeRouter from "./stripe";
import adminRouter from "./admin";
import authRouter from "./auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(emailRouter);
router.use(stripeRouter);
router.use(adminRouter);
router.use(authRouter);

export default router;
