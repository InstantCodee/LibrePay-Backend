import { Router } from "express";
import { createInvoice, getInvoice, getPaymentMethods } from "../controllers/invoice";
import { MW_User } from "../controllers/user";

const invoiceRouter = Router()

invoiceRouter.get('/paymentmethods', getPaymentMethods);
invoiceRouter.get('/:selector', getInvoice);
invoiceRouter.get('/', MW_User, getInvoice);
invoiceRouter.post('/', MW_User, createInvoice);

export { invoiceRouter };