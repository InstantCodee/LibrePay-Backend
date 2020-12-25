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