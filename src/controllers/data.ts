import { Request, Response } from "express";
import { CryptoUnits, PaymentStatus, roundNumber } from "../helper/types";
import { Invoice } from "../models/invoice/invoice.model";

export async function getSummary(req: Request, res: Response) {
    const from = new Date(Number(req.query.from) * 1000);
    const to = new Date(Number(req.query.to) * 1000);

    const dbQuery = Invoice.find()
        .sort({ createdAt: -1 });

    // If both dates are valid
    if (!isNaN(from.getTime()) && !isNaN(to.getTime())) {
        dbQuery.where({ createdAt: { $gte: from.getTime(), $lte: to.getTime() } });
    }

    const dbRes = await dbQuery.exec();

    // Analyse data
    let income = 0;
    let lost = 0;
    let transactionsCompleted = 0;
    let transactionsFailed = 0;
    let currencies = new Map<CryptoUnits, number>();

    for (let i = 0; i < dbRes.length; i++) {
        const invoice = dbRes[i];

        // If payment has been made
        if (invoice.status >= 3) {
            income += invoice.totalPrice;
            transactionsCompleted += 1;

            if (currencies.has(invoice.paymentMethod)) {
                currencies.set(invoice.paymentMethod, currencies.get(invoice.paymentMethod) + 1);
            } else {
                currencies.set(invoice.paymentMethod, 1);
            }
        } else if (invoice.status < 0) {
            lost += invoice.totalPrice;
            transactionsFailed += 1;
        }
    }

    income = roundNumber(income, 2);
    lost = roundNumber(lost, 2);

    res.status(200).send({
        income,
        lost,
        transactionsCompleted,
        transactionsFailed,
        transactions: transactionsFailed + transactionsCompleted,

        // @ts-ignore: Object.fromEntries does indeed exist but TypeScript seems to not recognise that. *Shame*
        currencies: Object.fromEntries(currencies)
    });
}