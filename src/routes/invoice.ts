import { Router } from "express";
import { createInvoice, getConfirmation, getInvoice, getPaymentMethods, setPaymentMethod } from "../controllers/invoice";
import { MW_User } from "../controllers/user";

const invoiceRouter = Router()

invoiceRouter.get('/paymentmethods', getPaymentMethods);
invoiceRouter.get('/:selector', getInvoice);
invoiceRouter.get('/:selector/confirmation', getConfirmation);
invoiceRouter.post('/:selector/setmethod', setPaymentMethod);
invoiceRouter.get('/', MW_User, getInvoice);
invoiceRouter.post('/', MW_User, createInvoice);

export { invoiceRouter };