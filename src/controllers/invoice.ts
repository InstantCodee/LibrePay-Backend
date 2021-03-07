import { Request, Response } from 'express';
import got from 'got';
import { config } from '../../config';

import { invoiceManager, INVOICE_SECRET, logger, providerManager } from '../app';
import { randomString } from '../helper/crypto';
import { CryptoUnits, decimalPlaces, FiatUnits, findCryptoBySymbol, PaymentStatus, roundNumber } from '../helper/types';
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

    const successUrl: string = req.body.successUrl;
    const cancelUrl: string = req.body.cancelUrl;
    const cart: ICart[] = req.body.cart;
    let currency: FiatUnits = req.body.currency;
    let totalPrice: number = req.body.totalPrice;
    let customSelector: string = req.body.selector;

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

    // Get price
    // Convert coin symbol to full text in order to query Coin Gecko. eg.: ['btc', 'xmr'] => ['bitcoin', 'monero']
    let cgFormat = [];

    config.payment.methods.forEach(coin => {
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
    
    cgFormat.forEach(coinFullName => {
        const coin = CryptoUnits[coinFullName.toUpperCase()];
        const exRate = Number(request.body[coinFullName][currency.toLowerCase()]);

        paymentMethods.push({ exRate, method: coin, amount: roundNumber(totalPrice / exRate, decimalPlaces.get(coin))});
    });

    const dueBy = new Date(Date.now() + 1000 * 60 * 30);
    
    Invoice.create({
        selector: customSelector === undefined ? randomString(32) : customSelector,
        paymentMethods,
        successUrl,
        cancelUrl,
        cart,
        currency,
        totalPrice,
        dueBy
    }, (error, invoice: IInvoice) => {
        if (error) {
            res.status(500).send({message: error.message});
            return;
        }

        //invoiceScheduler.addInvoice(invoice);
        //res.status(200).send({ id: invoice.selector });
        res.status(200).send({
            methods: paymentMethods,
            selector: invoice.selector,
            expireDate: invoice.dueBy
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

        res.status(200).send(invoice.toJSON({ virtuals: true }));

        return;
    }

    let reqSkip = req.query.skip;
    let reqLimit = req.query.limit;
    const reqStatus = req.query.status;
    const reqCurrency = req.query.currency; // Full name, not symbol!
    
    /*
     * Following sort methods are availabe:
     *  - 'newest' (DESC)   -> This will show the newest transactions first.
     *  - 'oldest' (ASC)    -> This will show the oldest transactions first.
     *  - 'biggest' (DESC)  -> This will show the biggest transcations by amount first.
     *  - 'smallest' (ASC)  -> This will show the smallest transcations by amount first.
     */
    let reqSort = req.query.sort;

    let querySort = {};
    let queryStatus = {};

    if (reqSkip === undefined) reqSkip = '0';
    if (reqLimit === undefined || Number(reqLimit) > 100) reqLimit = '100';
    if (reqSort !== undefined) {
        if (reqSort === 'newest') querySort = { createdAt: -1 };
        else if (reqSort === 'oldest') querySort = { createdAt: 1 };
        else if (reqSort === 'biggest') querySort = { totalPrice: -1 }
        else if (reqSort === 'smallest') querySort = { totalPrice: 1 }
        else {
            res.status(400).send({ message: 'Unkown sort parameter. "sort" can only be "newest", "oldest", "biggest" or "smallest".' });
            return;
        }
    }

    const invoices = Invoice.find({}, { cart: 0, dueBy: 0, successUrl: 0, cancelUrl: 0, paymentMethods: 0 })
        .limit(Number(reqLimit))
        .skip(Number(reqSkip))
        .sort(querySort);

    if (reqStatus !== undefined) {
        if (reqStatus === 'paid') queryStatus = { status: PaymentStatus.DONE }
        else if (reqStatus === 'pending') queryStatus = { status: PaymentStatus.PENDING }
        else if (reqStatus === 'unconfirmed') queryStatus = { status: PaymentStatus.UNCONFIRMED }
        else if (reqStatus === 'failed') queryStatus = { status: [PaymentStatus.CANCELLED, PaymentStatus.TOOLATE, PaymentStatus.TOOLITTLE] }
        else {
            res.status(400).send({ message: 'Unkown status parameter. "status" can only be "paid", "pending", "failed" or "unconfirmed".' });
            return;
        }

        invoices.where(queryStatus);
    }

    if (reqCurrency !== undefined) {        
        if (Object.keys(CryptoUnits).indexOf(reqCurrency.toString().toUpperCase()) === -1) {
            res.status(400).send({ message: '"currency" has to be the full name of a supported cryptocurrency: ' + Object.keys(CryptoUnits).join(', ').toLowerCase() });
            return;
        }

        invoices.where({ paymentMethod: CryptoUnits[reqCurrency.toString().toUpperCase()] });
    }

    res.status(200).send(await invoices.exec());
}

// GET /invoice/:selector/confirmation
export async function getConfirmation(req: Request, res: Response) {
    const selector = req.params.selector;
    
    const invoice = await Invoice.findOne({ selector: selector });
    if (invoice === null) {
        res.status(404).send();
        return;
    }

    if (invoice.status !== PaymentStatus.UNCONFIRMED) {
        res.status(400).send({ message: 'This has no unconfirmed transaction (yet)!' });
        return;
    }

    try {
        const confirmation = (await providerManager.getProvider(invoice.paymentMethod).getTransaction(invoice.transcationHash)).confirmations;
        res.status(200).send({ confirmation });
    } catch (err) {
        res.status(500).send();
        logger.error(`Error while getting confirmations for: ${invoice.transcationHash}`);
    }
}

// DELETE /invoice/:selector
export async function cancelInvoice(req: Request, res: Response) {
    const selector = req.params.selector;

    const invoice = await Invoice.findOne({ selector: selector });
    if (invoice === null) {
        res.status(404).send();
        return;
    }

    invoice.status = PaymentStatus.CANCELLED;
    await invoice.save();
    return;
}

// POST /invoice/:selector/setmethod
export async function setPaymentMethod(req: Request, res: Response) {
    const method: string = req.body.method;
    const selector: string = req.params.selector;

    if (method === undefined || selector === undefined) {
        res.status(400).send();
        return;
    }

    if (Object.values(CryptoUnits).indexOf(method.toUpperCase() as any) === -1) {
        res.status(400).send({ message: 'Unknown payment method' });
        return;
    }

    const invoice = await Invoice.findOne({ selector: selector });
    if (invoice === null) {
        res.status(404).send();
        return;
    }

    if (invoice.paymentMethod !== undefined) {
        res.status(409).send({ message: 'The payment method has already been set.' });
        return;
    }

    invoice.status = PaymentStatus.PENDING;
    invoice.paymentMethod = CryptoUnits[findCryptoBySymbol(method)];
    invoice.receiveAddress = await providerManager.getProvider(invoice.paymentMethod).getNewAddress();

    await invoice.save();
    
    invoiceManager.addInvoice(invoice)

    res.status(200).send({
        receiveAddress: invoice.receiveAddress
    });
}

// GET /invoice/paymentmethods
export async function getPaymentMethods(req: Request, res: Response) {
    res.status(200).send({ methods: config.payment.methods });
}