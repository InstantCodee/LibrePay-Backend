import { Router } from "express";
import { getSummary } from "../controllers/data";

const dataRouter = Router()

dataRouter.get('/summary', getSummary);

export { dataRouter };