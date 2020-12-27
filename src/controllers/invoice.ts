import { Request, Response } from 'express';
import got from 'got';

import { invoiceScheduler, INVOICE_SECRET, rpcClient } from '../app';
import { randomString } from '../helper/crypto';
import { CryptoUnits, FiatUnits, findCryptoBySymbol, PaymentStatus } from '../helper/types';
import { ICart, IInvoice, IPaymentMethod } from '../models/invoice/invoice.interface';
import { Invoice } from '../models/invoice/invoice.model';
import { calculateCart } from '../models/invoice/invoice.schema';

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

    const paymentMethodsRaw: string[] = req.body.methods;
    const successUrl: string = req.body.successUrl;
    const cancelUrl: string = req.body.cancelUrl;
    const cart: ICart[] = req.body.cart;
    let currency: FiatUnits = req.body.currency;
    let totalPrice: number = req.body.totalPrice;

    if (paymentMethodsRaw === undefined) {
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
    } else {
        if (Object.keys(FiatUnits).indexOf(currency.toUpperCase()) === -1) {
            res.status(400).send({ message: '"currency" can only be "eur" and "usd"' });
            return;
        } else {
            currency = FiatUnits[currency.toUpperCase()];
        }
    }

    if (cart === undefined && totalPrice === undefined) {
        res.status(400).send({ message: 'Either "cart" or "totalPrice" has to be defined.' });
        return;
    }

    rpcClient.request('getnewaddress', ['', 'bech32'], async (err, response) => {
        if (err) throw err;

        // Get price
        // Convert coin symbol to full text in order to query Coin Gecko. eg.: ['btc', 'xmr'] => ['bitcoin', 'monero']
        let cgFormat = [];

        paymentMethodsRaw.forEach(coin => {
            const crypto = findCryptoBySymbol(coin);
            
            if (crypto !== undefined) {
                cgFormat.push(crypto.toLowerCase());
            }
        });
        
        const request = await got.get(`https://api.coingecko.com/api/v3/simple/price?ids=${cgFormat.join(',')}&vs_currencies=${currency.toLowerCase()}`, {
            responseType: 'json'
        });

        // Calulate total price, if cart is provided
        if (cart !== undefined && totalPrice === undefined) {
            totalPrice = calculateCart(cart);
        }

        let paymentMethods: IPaymentMethod[] = [];        
        Object.keys(request.body).forEach(coin => {
            paymentMethods.push({ method: CryptoUnits[coin.toUpperCase()], amount:  totalPrice / Number(request.body[coin][currency.toLowerCase()]) });
        });
        
        Invoice.create({
            selector: randomString(128),
            paymentMethods: paymentMethods,
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
            res.status(200).send({ id: invoice.selector });
        });
    });

}

// GET /invoice/
// GET /invoice/:selector
export async function getInvoice(req: Request, res: Response) {
    const selector = req.params.selector;

    // If an id is provided
    if (selector !== undefined) {
        const invoice: IInvoice = await Invoice.findOne({ selector: selector });
        if (invoice === null) {
            res.status(404).send();
            return;
        }

        if(invoice.status === PaymentStatus.UNCONFIRMED || invoice.status === PaymentStatus.DONE) {
            rpcClient.request('gettransaction', [invoice.transcationHashes[0]], (err, message) => {
                let invoiceClone: any = invoice;
                console.log(message.result.confirmations);
                
                invoiceClone['confirmation'] = message.result.confirmations;
                res.status(200).send(invoiceClone);
            });
        } else {
            res.status(200).send(invoice);
        }

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

// DELETE /invoice/:selector
export async function cancelPaymnet(req: Request, res: Response) {
    const selector = req.params.selector;

    // If an id is provided
    if (selector !== undefined) {
        const invoice = await Invoice.findOne({ selector: selector });
        if (invoice === null) {
            res.status(404).send();
            return;
        }
    
        invoice.status = PaymentStatus.CANCELLED;
        await invoice.save();
        return;
    }
}