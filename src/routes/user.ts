import { Router } from "express";

const invoiceRouter = Router()

invoiceRouter.get('/:id');
invoiceRouter.post('/');

export { invoiceRouter };