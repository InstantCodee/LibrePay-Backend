import { Request, Response } from "express";
import { invoiceScheduler, INVOICE_SECRET } from "../app";
import { CryptoUnits, FiatUnits } from "../helper/types";
import { ICart, IInvoice } from "../models/invoice/invoice.interface";
import { Invoice } from "../models/invoice/invoice.model";
import { rpcClient } from '../app';

// POST /invoice/?sercet=XYZ
export async function createInvoice(req: Request, res: Response) {
    const secret = req.query.secret;
    if (secret === undefined) {
        res.status(401).send({ message: 'secret parameter is missing' });
        return;
    } else {
        if (secret !== INVOICE_SECRET) {
            setTimeout(() => {
                res.status(401).send();
            }, 1200);
            return;
        }
    }

    const paymentMethods: CryptoUnits[] = req.body.methods;
    const successUrl: string = req.body.successUrl;
    const cancelUrl: string = req.body.cancelUrl;
    const cart: ICart[] = req.body.cart;
    const currency: FiatUnits = req.body.currency;
    const totalPrice: number = req.body.totalPrice;

    if (paymentMethods === undefined) {
        res.status(400).send({ message: '"paymentMethods" are not provided!' });
        return;
    }

    if (successUrl === undefined) {
        res.status(400).send({ message: '"successUrl" is not provided!' });
        return;
    }

    if (cancelUrl === undefined) {
        res.status(400).send({ message: '"cancelUrl" is not provided!' });
        return;
    }

    if (currency === undefined) {
        res.status(400).send({ message: '"currency" is not provided!' });
        return;
    }

    /*if (cart === undefined && totalPrice === undefined) {
        res.status(400).send({ message: 'Either "cart" or "totalPrice" has to be defined.' });
        return;
    }*/

    rpcClient.request('getnewaddress', ['', 'bech32'], async (err, response) => {
        if (err) throw err;
        //console.log(response.result);

        Invoice.create({
            paymentMethods,
            successUrl,
            cancelUrl,
            cart,
            currency,
            totalPrice,
            dueBy: 60,
            receiveAddress: response.result
        }, (error, invoice: IInvoice) => {
            if (error) {
                res.status(500).send({error: error.message});
                return;
            }

            invoiceScheduler.addInvoice(invoice);
            res.status(200).send({ id: invoice.id });
        });
    });

}

// GET /invoice/
// GET /invoice/:id
export async function getInvoice(req: Request, res: Response) {
    const invoiceId = req.params.id;

    // If an id is provided
    if (invoiceId !== undefined) {
        const invoice: any = await Invoice.findById(invoiceId);
        if (invoice === null) {
            res.status(404).send();
            return;
        }
    
        res.status(200).send(invoice);
        return;
    }

    let skip = req.query.skip;
    let limit = req.query.limit;
    let sortQuery = req.query.sort;      // Either 'newest' (DESC) or 'oldest' (ASC)
    let sort = 1;

    if (skip === undefined) skip = '0';
    if (limit === undefined || Number(limit) > 100) limit = '100';
    if (sortQuery !== undefined) {
        if (sortQuery === 'newest') sort = -1;
        else if (sortQuery === 'newest') sort = 1;
        else {
            res.status(400).send({ message: 'Unkown sort parameter. "sort" can only be "newest" or "oldest"' });
            return;
        }
    }

    const invoices = await Invoice.find({})
        .limit(Number(limit))
        .skip(Number(skip))
        .sort({ createdAt: sort });

    res.status(200).send(invoices);
}