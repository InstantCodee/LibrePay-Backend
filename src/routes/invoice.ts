import { Router } from "express";
import { createInvoice, getInvoice } from "../controllers/invoice";
import { MW_User } from "../controllers/user";

const invoiceRouter = Router()

invoiceRouter.get('/:id', getInvoice);
invoiceRouter.get('/', MW_User, getInvoice);
invoiceRouter.post('/', MW_User, createInvoice);

export { invoiceRouter };