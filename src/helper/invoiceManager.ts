import got from 'got/dist/source';
import { logger, providerManager, socketManager } from '../app';
import { IInvoice } from '../models/invoice/invoice.interface';
import { Invoice } from '../models/invoice/invoice.model';
import { CryptoUnits, PaymentStatus } from './types';

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

        // Get all pending and unconfirmed transcations
        Invoice.find({ $or: [ { status: PaymentStatus.PENDING }, { status: PaymentStatus.UNCONFIRMED } ]}).then(invoices => {
            logger.info(`There are ${invoices.length} invoices that are pending or unconfirmed`);

            invoices.forEach(invoice => {
                if (invoice.status === PaymentStatus.DONE || invoice.status === PaymentStatus.CANCELLED) {
                    this.removeInvoice(invoice);
                    return;
                }

                if (invoice.status === PaymentStatus.PENDING) { this.pendingInvoices.push(invoice); }
                if (invoice.status === PaymentStatus.UNCONFIRMED) { this.unconfirmedTranscations.push(invoice); }

                try {
                    providerManager.getProvider(invoice.paymentMethod).validateInvoice(invoice);
                } catch (err) {
                    logger.debug(`Cannot validate invoice ${invoice.id} because there is no provider for ${invoice.paymentMethod}. Remove ...`);
                    this.removeInvoice(invoice);
                }
            });
        });

        this.expireScheduler();
        this.watchConfirmations();
    }

    /**
     * This function will basicly close all invoices that have not been paid in time.
     */
    private expireScheduler() {
        setInterval(async () => {
            // Find invoices that are pending or requested and reached there EOF date
            const expiredInvoices = await Invoice.find({
                dueBy: { $lte: new Date() },
                $or: [ { status: PaymentStatus.PENDING }, { status: PaymentStatus.REQUESTED } ]
            });
            
            expiredInvoices.forEach(async eInvoice => {
                eInvoice.status = PaymentStatus.TOOLATE;
                await eInvoice.save();
            });

        }, 5_000);
    }

    /**
     * This will add `invoice` to the pending list.
     * @param upgrade If `true` then this invoice will be directly added to the unconfirmed invoices.
     */
    addInvoice(invoice: IInvoice, upgrade?: boolean) {
        // Avoid duplicates
        this.removeInvoice(invoice);

        if (upgrade) {
            logger.info(`A new unconfirmed invoice has been created: ${invoice.id}`)
            this.pendingInvoices.push(invoice);
            this.upgradeInvoice(invoice);
        } else {
            logger.info(`A new invoice has been created: ${invoice.id}`)
            this.pendingInvoices.push(invoice);
        }
    }

    removeInvoice(invoice: IInvoice) {
        if (this.unconfirmedTranscations.indexOf(invoice) != -1) this.unconfirmedTranscations.splice(this.unconfirmedTranscations.indexOf(invoice), 1);
        if (this.pendingInvoices.indexOf(invoice) != -1) this.pendingInvoices.splice(this.pendingInvoices.indexOf(invoice), 1);
    }

    /**
     * Upgrade a pending invoice up to an unconfirmed invoice.
     */
    upgradeInvoice(invoice: IInvoice) {
        const target = this.pendingInvoices.find(item => { return item.id = invoice.id });
        if (target !== undefined) {
            this.unconfirmedTranscations.push(invoice);
            this.pendingInvoices.splice(this.pendingInvoices.indexOf(invoice), 1);
        } else {
            this.unconfirmedTranscations.push(invoice);
        }

        this.knownConfirmations.set(invoice.id, 0);
        invoice.status = PaymentStatus.UNCONFIRMED;
        invoice.save();
    }

    getPendingInvoices() {
        return this.pendingInvoices;
    }

    getUnconfirmedTransactions() {
        return this.unconfirmedTranscations;
    }

    /**
     * This will return you the price in the choosen cryptocurrency.
     * 
     * If no payment methods has been choosen yet, you'll get `0` back.
     */
    getPriceByInvoice(invoice: IInvoice): number {
        if (invoice.paymentMethod === undefined) return 0;
        return invoice.paymentMethods.find(method => { return method.method === invoice.paymentMethod }).amount;
    }

    /**
     * @param confirmations Your confirmation count
     * @returns If yours is different then what the manager knows, this function returns `true`.
     */
    hasConfirmationChanged(invoice: IInvoice, confirmations: number) {
        return this.knownConfirmations.get(invoice.id) !== confirmations;
    }

    getConfirmationCount(invoice: IInvoice) {
        return this.knownConfirmations.get(invoice.id);
    }

    /**
     * Notify LibrePay about a confirmation change. If something changed, the user will be notfied.
     * 
     * If the confirmation count is treated as "trusted", then the invoice will be completed.
     */
    async setConfirmationCount(invoice: IInvoice, count: number) {        
        if (this.hasConfirmationChanged(invoice, count)) {
            this.knownConfirmations.set(invoice.id, count);
            socketManager.emitInvoiceEvent(invoice, 'confirmationUpdate', { count });

            if (count > 2) {
                logger.info(`Transaction (${invoice.transcationHash}) has reached more then 2 confirmations and can now be trusted!`);
                const sentFunds = (await providerManager.getProvider(invoice.paymentMethod).getTransaction(invoice.transcationHash, invoice)).amount;
                
                // This transaction sent more then requested funds
                if (sentFunds > this.getPriceByInvoice(invoice)) {
                    invoice.status = PaymentStatus.TOOMUCH;
                } else {
                    invoice.status = PaymentStatus.DONE;
                }

                await invoice.save(); // This will trigger a post save hook that will notify the user.
                this.removeInvoice(invoice);

                // Notify merchant about status change by calling the callback.
                const request = await got.get(invoice.successUrl);
                if (request.statusCode !== 200) {
                    logger.error(`Success callback ${invoice.successUrl} for invoice ${invoice.id} failed with ${request.statusCode}!`);
                    return;
                }
            }
        }
    }

    /**
     * This mehtod, once started, will check every n-seconds if the confirmation
     * count of one unconfirmed transcation has changed.
     */
    async watchConfirmations() {
        setInterval(() => {
            this.unconfirmedTranscations.forEach(async invoice => {
                const transcation = invoice.transcationHash;

                if (providerManager.getProvider(invoice.paymentMethod) === undefined) {
                    logger.debug(`Cannot get confirmations of invoice ${invoice.id} because there is no provider for ${invoice.paymentMethod}. Remove ...`);
                    this.removeInvoice(invoice);
                    return;

                }
                
                const provider = providerManager.getProvider(invoice.paymentMethod);
                const tx = await provider.getTransaction(transcation, invoice);
                this.setConfirmationCount(invoice, tx.confirmations);
            });
        }, 2_000);
    }

    /**
     * This method checks if a payment has been made in time and that the right amount was sent.
     * 
     * **Only issue this method in the moment the payment has been made.**
     */
    async validatePayment(invoice: IInvoice, tx: string): Promise<void> {
        if (invoice.dueBy.getTime() < Date.now() && invoice.status <= PaymentStatus.PENDING && invoice.status >= PaymentStatus.REQUESTED) {
            invoice.status = PaymentStatus.TOOLATE;
            await invoice.save();

            return; // Payment is too late
        }

        const txInfo = await providerManager.getProvider(invoice.paymentMethod).getTransaction(tx, invoice);
        
        const price = this.getPriceByInvoice(invoice);
        if (price === 0) return;

        // Sent enough funds
        if (txInfo.amount == price || txInfo.amount > price) {
            invoice.transcationHash = tx;
            await invoice.save();

            this.upgradeInvoice(invoice);
        } else {
            /* **Note**
             * Sending funds back is complicated since we can never know who the original sender was to 100%.
             * For Bitcoin, a transaction can have more then one input and if this is the case, you can never
             * know who the original sender was. Therefore if a customer sent not the right amount, he/she
             * should contact the support of the shop.
             */
            logger.warning(`Transaction (${tx}) did not sent requested funds. (sent: ${txInfo.amount}, requested: ${price})`);
            invoice.status = PaymentStatus.TOOLITTLE;

            await invoice.save();

            // Notify merchant about status change by calling the callback.
            const request = await got.get(invoice.failUrl);
            if (request.statusCode !== 200) {
                logger.error(`Fail callback ${invoice.failUrl} for invoice ${invoice.id} failed with ${request.statusCode}!`);
                return;
            }

            return;
        }
    }
}