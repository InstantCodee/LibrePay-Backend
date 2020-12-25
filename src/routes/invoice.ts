import { Router } from "express";
import { createInvoice } from "../controllers/invoice";

const invoiceRouter = Router()

invoiceRouter.get('/:id');
invoiceRouter.post('/', createInvoice);

export { invoiceRouter };