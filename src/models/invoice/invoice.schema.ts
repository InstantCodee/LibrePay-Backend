import { Schema } from 'mongoose';
import { eventManager, invoiceManager, logger, providerManager } from '../../app';
import { CryptoUnits, FiatUnits, findCryptoBySymbol, PaymentStatus } from '../../helper/types';
import { ICart, IInvoice } from './invoice.interface';

const urlRegex = /((([A-Za-z]{3,9}:(?:\/\/)?)(?:[\-;:&=\+\$,\w]+@)?[A-Za-z0-9\.\-]+|(?:www\.|[\-;:&=\+\$,\w]+@)[A-Za-z0-9\.\-]+)((?:\/[\+~%\/\.\w\-_]*)?\??(?:[\-\+=&;%@\.\w_]*)#?(?:[\.\!\/\\\w]*))?)/

const schemaCart = new Schema({
    price: { type: Number, required: true },
    name: { type: String, trim: true, required: true },
    image: { type: String, match: urlRegex, required: true },
    quantity: { type: Number, default: 1 }
}, { _id: false });

const schemaPaymentMethods = new Schema({
    method: { type: String, enum: Object.values(CryptoUnits), required: true },
    amount: { type: Number, required: false },
    exRate: { type: Number, required: true },   // Exchange rate at creation
}, { _id: false });

const schemaInvoice = new Schema({
    selector: { type: String, length: 32, required: true },
    paymentMethods: [{ type: schemaPaymentMethods, required: true }],
    paymentMethod: { type: String, enum: Object.values(CryptoUnits), required: false },
    receiveAddress: { type: String, required: false },
    paymentId: { type: String, required: false },
    transcationHash: { type: String, required: false },
    cart: [{ type: schemaCart, required: false }],
    totalPrice: { type: Number, required: false },
    currency: { type: String, enum: Object.values(FiatUnits), required: true },
    dueBy: { type: Date, required: true },
    status: { type: Number, enum: Object.values(PaymentStatus), default: PaymentStatus.REQUESTED },
    email: { type: String, required: false },
    successUrl: { type: String, match: urlRegex, required: true },
    cancelUrl: { type: String, match: urlRegex, required: true },
    failUrl: { type: String, match: urlRegex, required: true },
    redirectTo: { type: String, match: urlRegex, required: true }
}, {
    timestamps: {
        createdAt: true,
    },
    versionKey: false
});

// Create virutal field that contains a link to a block explorer defined in provider
schemaInvoice.virtual('transactionLink').get(function() {
    let self = this as IInvoice;

    // Stop if this invoice does not have an tx id yet.
    if (self.transcationHash === undefined) return null;

    const provider = providerManager.getProvider(self.paymentMethod);

    if (provider === undefined) return null;

    // Check if provider supports this function
    if (provider.getBlockExplorerLink !== undefined) {
        return provider.getBlockExplorerLink(self.transcationHash).toString();
    }

    return null;
});

schemaInvoice.virtual('testnet').get(function() {
    let self = this as IInvoice;

    if (self.receiveAddress === undefined) return false;

    const provider = providerManager.getProvider(self.paymentMethod);
    if (provider === undefined) return false;

    return provider.isTestnetAddress(self.receiveAddress);
});

schemaInvoice.pre('validate', function(next) {
    let self = this as IInvoice;
    self.currency = FiatUnits[self.currency];

    next();
});

// Validate values
schemaInvoice.post('validate', function (doc, next) {
    let self = this as IInvoice;
    
    // If cart is undefined and price too, error.
    if ((self.cart === undefined || self.cart.length === 0) && self.totalPrice === undefined) {
        next(new Error('Either cart or price has to be defined!'));
        return;
    }
    
    next();
});

// Remove invoice from invoice manager because a negative status is always final.
schemaInvoice.post('save', function (doc: IInvoice, next) {
    eventManager.push('status', { status: doc.status }, doc.selector);

    // If a status has a negative value, then this invoice has failed.
    if (doc.status < 0) {
        invoiceManager.removeInvoice(doc);
    }

    next();
});

export async function setMethod(invoice: IInvoice, method: CryptoUnits) {
    invoice.status = PaymentStatus.PENDING;
    invoice.paymentMethod = method;
    invoice.receiveAddress = await providerManager.getProvider(method).getNewAddress();

    await invoice.save();
    
    invoiceManager.addInvoice(invoice);

    return invoice;
}

export function calculateCart(cart: ICart[]): number {
    let totalPrice = 0;
    
    for (let i = 0; i < cart.length; i++) {
        const item = cart[i];
        totalPrice += item.price * item.quantity;
    }

    return totalPrice;
}

export { schemaInvoice }