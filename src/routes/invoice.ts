import { Router } from "express";
import { cancelInvoice, createInvoice, getConfirmation, getInvoice, getPaymentMethods, setPaymentMethod } from "../controllers/invoice";
import { MW_User } from "../controllers/user";

const invoiceRouter = Router()

// Get general information
invoiceRouter.get('/paymentmethods', getPaymentMethods);

// Actions related to specific invoices
invoiceRouter.get('/:selector', getInvoice);
invoiceRouter.delete('/:selector', cancelInvoice);
invoiceRouter.get('/:selector/confirmation', getConfirmation);
invoiceRouter.post('/:selector/setmethod', setPaymentMethod);

invoiceRouter.get('/', MW_User, getInvoice);
invoiceRouter.post('/', createInvoice);

export { invoiceRouter };