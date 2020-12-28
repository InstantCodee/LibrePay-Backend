import { IInvoice } from "../models/invoice/invoice.interface";
import { Subscriber } from 'zeromq';
import { logger, rpcClient, socketManager } from "../app";
import { invoiceRouter } from "../routes/invoice";
import { Invoice } from "../models/invoice/invoice.model";
import { CryptoUnits, PaymentStatus } from "./types";
import { config } from "../../config";

/**
 * This invoice manager keeps track of the status of each transaction.
 */
export class InvoiceManager {
    private pendingInvoices: IInvoice[];
    private unconfirmedTranscations: IInvoice[];
    private knownConfirmations: Map<string, number>;    // Invoice id / confirmation count

    constructor() {
        this.unconfirmedTranscations = [];
        this.pendingInvoices = [];
        this.knownConfirmations = new Map<string, number>();

        // Get all pending transcations
        Invoice.find({ status: PaymentStatus.PENDING }).then(invoices => {
            console.log('These are pending', invoices);
            
            this.pendingInvoices = invoices;
        });

        // Get all unconfirmed transactions
        Invoice.find({ status: PaymentStatus.UNCONFIRMED }).then(invoices => {
            this.unconfirmedTranscations = invoices;
        });
    }

    /**
     * This will add `invoice` to the pending list.
     */
    addInvoice(invoice: IInvoice) {
        logger.info(`A new invoice has been created: ${invoice.id}`)
        this.pendingInvoices.push(invoice);
    }

    removeInvoice(invoice: IInvoice) {
        this.unconfirmedTranscations.splice(this.unconfirmedTranscations.indexOf(invoice), 1);
    }

    /**
     * Upgrade a pending invoice up to an unconfirmed invoice.
     */
    upgradeInvoice(invoice: IInvoice) {
        const target = this.pendingInvoices.find(item => { return item.id = invoice.id });
        if (target !== undefined) {
            this.pendingInvoices.push(invoice);
            this.pendingInvoices.splice(this.pendingInvoices.indexOf(invoice), 1);
        }
    }

    getPendingInvoices() {
        return this.pendingInvoices;
    }

    getUnconfirmedTransactions() {
        return this.unconfirmedTranscations;
    }

    hasConfirmationChanged(invoice: IInvoice, confirmations: number) {
        return this.knownConfirmations.get(invoice.id) !== confirmations;
    }

    getConfirmationCount(invoice: IInvoice) {
        return this.knownConfirmations.get(invoice.id);
    }

    setConfirmationCount(invoice: IInvoice, count: number) {
        socketManager.emitInvoiceEvent(invoice, 'confirmationUpdate', { count });
        return this.knownConfirmations.set(invoice.id, count);
    }
}