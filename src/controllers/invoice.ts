import { Request, Response } from "express";

export async function createInvoice(req: Request, res: Response) {
    const paymentMethods = req.body.methods;
}